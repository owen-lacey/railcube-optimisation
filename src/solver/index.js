// The CP-SAT model, behind one function. Tests talk to solveTrack and nothing
// else, so the encoding underneath can change on a benchmark result without any
// test moving.
//
// Shape of the model: step-indexed variables rather than addCircuit, because a
// route is a sequence with pose state and a circuit constraint has no room for
// the pose. Step i has a head — a cell and a pose — and a piece clicked into it.
// The transition (cell, pose, type) → (cell, pose) is the 144-row table in
// transitions.js.
//
// cpsat-js offers no allowed-assignments constraint, so the table is encoded as
// one boolean per row per step with exactly one true. That turns out better than
// a table would be anyway: because exactly one selector is true, the entire
// transition is four plain linear equations over those booleans, with no
// reification at all.

import { CpModel, CpSolver, CpSolverStatus, LinearExpr } from 'cpsat-js';
import {
  POSES, FACES, PIECE_TYPES, POOLS, POOL_OF, PROJ, SCORES, cellsFor, chainTrack, startCell,
} from '../track.js';
import { METRICS, SIGNS, combinedWeights } from '../metrics.js';
import { solveNative } from './native.js';
import { transitionTable } from './transitions.js';

/** The most cells any one piece's material fills — the 2×2 curves. */
const MAX_FOOT = 4;

// Loading the WASM costs far more than solving a small model, so do it once.
let solverPromise = null;
const getSolver = () => (solverPromise ??= CpSolver.create());

/**
 * The engines a model can be solved on, each `(model, params) => result` in
 * cpsat-js's shape. The model is the same either way; see native.js.
 */
const ENGINES = {
  wasm: async () => {
    const solver = await getSolver();
    return (model, params) => solver.solve(model, params);
  },
  native: async () => solveNative,
};

// LinearExpr.plus takes another LinearExpr or a number — not an IntVar, which
// only IntVar.plus accepts. Fold in expression space and the asymmetry is gone.
const sum = terms => terms.reduce(
  (acc, t) => acc.plus(t.toLinearExpr ? t.toLinearExpr() : t), LinearExpr.fromConstant(0));

/**
 * The selector booleans for one step: exactly one row of the table is taken, or
 * none at all if the step is switched off. Everything else — displacement,
 * claims, inventory — is a sum over these, so an inactive step contributes
 * nothing anywhere without needing to be special-cased.
 */
function stepSelectors(model, rows, i, active) {
  const vars = rows.map((_, r) => model.newBoolVar(`sel_${i}_${r}`));
  model.add(sum(vars).equals(active));
  return vars;
}

/**
 * Which steps are used. The step count is always an upper bound — the used steps
 * form a contiguous prefix and the tail is switched off.
 *
 * The prefix is not just tidiness. Left free, "which of the 32 steps are off" is
 * an enormous symmetry — choosing 12 of 32 positions is some 225 million
 * equivalent solutions, all describing the same track.
 */
function activeSteps(model, steps) {
  const active = Array.from({ length: steps }, (_, i) => model.newBoolVar(`active_${i}`));
  for (let i = 1; i < steps; i++) model.add(active[i].le(active[i - 1]));
  model.add(active[0].equals(1)); // a track with no pieces is not a track
  return active;
}

/**
 * Objectives, kept as a table rather than baked into the constraints, so later
 * chapters can swap one in without touching the model's shape.
 *
 * The step count is the whole inventory, so every step the loop does not use is a
 * piece left in the box, and the loop's length is a decision variable for free.
 * What the weights then decide is *which* pieces lose when something has to be
 * dropped — see SCORES in track.js for why they are all positive.
 */
export const OBJECTIVES = {
  // Scored in cubes on the table, not steps in the route. A crossed cross is two
  // steps and one cube, so its second step has its score taken back off — count
  // steps here and the solver mints free pieces.
  maximiseScore: ({ model, rows, selectors, revisit }) => {
    const scored = sum(selectors.flatMap(vars =>
      vars.map((v, r) => v.times(SCORES[PIECE_TYPES[rows[r].type]]))));
    model.maximize(revisit ? scored.minus(sum(revisit).times(SCORES.cross)) : scored);
  },
  // The readings of src/metrics.js, each in its good direction (SIGNS) or,
  // asked for the worst, the other, and their equal-weighted combination. Each
  // solves for the number metricsOf would count off the chained route, which is
  // what the answer is then checked by.
  ...Object.fromEntries(METRICS.map(name => [name, context =>
    aim(context, SIGNS[name], METRIC_TERMS[name](context))])),
  combined: context => aim(context, 1, combinedTerm(context)),
  // The material's longest extent on any axis: one bound per axis, no product.
  // Nothing pulls the extents in but the objective, so this is sound only when
  // minimised.
  longestSide: context => {
    const extents = materialExtent(context);
    const longest = context.model.newIntVar(1, Math.max(...extents.map(e => e.most)), 'longest');
    extents.forEach(({ at }) => context.model.add(longest.ge(at)));
    context.model.minimize(longest);
  },
};

/** Post a term towards its good end (sign +1 is up), or away from it when asked for the worst. */
function aim({ model, direction }, sign, term) {
  if (sign * (direction === 'worst' ? -1 : 1) > 0) model.maximize(term);
  else model.minimize(term);
}

/**
 * The metrics whose encoding is exact both ways, so their worst can be asked
 * for. Every other is sound only in its good direction.
 */
const TWO_WAY = new Set(['repeats', 'faceUp', 'ceiling', 'height']);

/** Whether an objective's worst can be asked for: combined only if every metric it weighs can. */
const twoWay = (objective, ranges) => (objective === 'combined'
  ? Object.entries(combinedWeights(ranges).weights).every(([name, w]) => !w || TWO_WAY.has(name))
  : TWO_WAY.has(objective));

/** The combination, exact in integers: every term multiplied through by the LCM of the ranges. */
function combinedTerm(context) {
  if (!context.ranges) throw new Error('the combined objective needs ranges to rescale by');
  const { weights } = combinedWeights(context.ranges);
  return sum(Object.keys(weights).filter(name => weights[name])
    .map(name => METRIC_TERMS[name](context).times(weights[name])));
}

/**
 * Hold metrics at least this good, in their good direction (SIGNS; combined is
 * maximised), or at least this bad when `direction` is worst. The same terms as
 * the objectives, so the same soundness: a one-way term is only right bounded
 * from its good side, so the worst is refused for it.
 */
function addLimits(context, limits) {
  const flip = context.direction === 'worst' ? -1 : 1;
  for (const [name, value] of Object.entries(limits)) {
    if (flip < 0 && !twoWay(name, context.ranges)) {
      throw new Error(`the ${name} limit is sound only in its good direction, so it cannot be held at its worst`);
    }
    if (name === 'combined') {
      const term = combinedTerm(context);
      context.model.add(flip > 0 ? term.ge(value) : term.le(value));
    } else if (METRIC_TERMS[name]) {
      const term = METRIC_TERMS[name](context);
      context.model.add(SIGNS[name] * flip > 0 ? term.ge(value) : term.le(value));
    } else {
      throw new Error(`unknown limit ${name}`);
    }
  }
}

/**
 * The material's extent along each axis, [across, up, along], from bounds every
 * material cell must sit inside. Nothing pulls the bounds in but what reads the
 * extent, so it is sound only as something kept small.
 */
function materialExtent({ model, material, region }) {
  return region.map(([floor, ceiling], a) => {
    const hi = model.newIntVar(floor, ceiling, `hi_${a}`);
    const lo = model.newIntVar(floor, ceiling, `lo_${a}`);
    for (const { used, coord } of material) {
      model.add(hi.ge(coord[a])).onlyEnforceIf(used);
      model.add(lo.le(coord[a])).onlyEnforceIf(used);
    }
    return { most: ceiling - floor + 1, at: hi.minus(lo).plus(1) };
  });
}

/**
 * Where material may sit, as [lo, hi] along each axis [across, up, along]: the
 * box and the floor, narrowed by `spans`. The start cube is material at the
 * origin, so an extent of n cells reaches at most n − 1 either side of it.
 */
function regionOf(box, minY, spans) {
  return [0, 1, 2].map(a => {
    const floor = a === UP && minY !== null ? minY : -box;
    const reach = spans ? spans[a] - 1 : box;
    return [Math.max(floor, -reach), Math.min(box, reach)];
  });
}

/** The selectors, across all steps, whose row passes a test. */
const rowsWhere = (selectors, rows, test) =>
  selectors.flatMap(vars => vars.filter((_, r) => test(rows[r])));

const UP = 1;

/**
 * Each metric of src/metrics.js as a linear expression, read the same way
 * `metricsOf` reads a chained route: step i's head is the train's cell and pose
 * there, and a crossed cross's second pass is a step like any other.
 */
const METRIC_TERMS = {
  // A face is seen only if some step is entered riding on it. Nothing forces it
  // on, so this is sound only when maximised.
  faces: ({ model, rows, selectors }) => sum(FACES.map(f => {
    const seen = model.newBoolVar(`seen_${f}`);
    model.add(seen.le(sum(rowsWhere(selectors, rows, row => POSES[row.pose][0] === f))));
    return seen;
  })),

  // The material's bounding box, then its volume off a one-hot table of span
  // triples — there is no multiplication here. Nothing pulls the bounds in or
  // picks the smallest triple but the objective, so this is sound only when
  // minimised.
  volume: context => {
    const { model } = context;
    const spans = materialExtent(context);
    const triples = [];
    for (let across = 1; across <= spans[0].most; across++) {
      for (let up = 1; up <= spans[1].most; up++) {
        for (let along = 1; along <= spans[2].most; along++) {
          triples.push({ span: [across, up, along], b: model.newBoolVar(`span_${across}_${up}_${along}`) });
        }
      }
    }
    model.add(sum(triples.map(t => t.b)).equals(1));
    spans.forEach(({ at }, a) => model.add(sum(triples.map(t => t.b.times(t.span[a]))).ge(at)));
    return sum(triples.map(t => t.b.times(t.span[0] * t.span[1] * t.span[2])));
  },

  // Steps that start three of a kind in a row, wrapping to the first. One `trip`
  // per step and type, true exactly when that type fills all three: forced on by
  // the triple and off by any one of them missing, so sound in both directions.
  repeats: ({ model, rows, selectors }) => {
    const types = [...new Set(rows.map(row => row.type))];
    const typeIs = (vars, t) => sum(vars.filter((_, r) => rows[r].type === t));
    const at = i => selectors[i % selectors.length];
    capRuns(model, selectors, typeIs, at);
    return sum(selectors.flatMap((vars, i) => types.map(t => {
      const run = [vars, at(i + 1), at(i + 2)].map(v => typeIs(v, t));
      const trip = model.newBoolVar(`trip_${i}_${t}`);
      model.add(trip.ge(run[0].plus(run[1]).plus(run[2]).minus(2)));
      run.forEach(one => model.add(trip.le(one)));
      return trip;
    })));
  },

  // Steps entered riding face up: the floor faces down.
  faceUp: ({ rows, selectors }) => sum(rowsWhere(selectors, rows,
    row => PROJ[POSES[row.pose][0]][UP] < 0)),

  // Steps entered riding upside down: the floor faces up.
  ceiling: ({ rows, selectors }) => sum(rowsWhere(selectors, rows,
    row => PROJ[POSES[row.pose][0]][UP] > 0)),

  // The train's up coordinate summed over the steps: the head before each one,
  // which is the cell metricsOf reads off each placed piece.
  height: ({ y, selectors }) => sum(y.slice(0, selectors.length)),
};

/**
 * The longest run of each curve a closed track can hold, so a run objective's
 * bound need not discover it by search. Four of a curve close a ring, and every
 * piece after one collides with its first. Three inside or outside curves pass
 * an open chain, but no closed track has been found to hold them: none of the
 * 11.3M crossed sweep layouts, and no loop up to 12 pieces but the IIII ring
 * itself. Wrapping, so only under `fill`, which the metrics need; a four-step
 * loop is exempt, since it can be that ring.
 */
const RUN_CAPS = [['leftCurve', 3], ['rightCurve', 3], ['insideCurve', 2], ['outsideCurve', 2]];

function capRuns(model, selectors, typeIs, at) {
  if (selectors.length <= 4) return;
  for (const [name, most] of RUN_CAPS) {
    const t = PIECE_TYPES.indexOf(name);
    selectors.forEach((_, i) => model.add(
      sum(Array.from({ length: most + 1 }, (__, k) => typeIs(at(i + k), t))).le(most)));
  }
}

/** What a chained track is worth, in plain JavaScript. Never a solver variable. */
const scoreOf = placed => placed.reduce(
  (total, piece) => total + (piece.revisit ? 0 : SCORES[piece.type]), 0);

/**
 * Break the mirror symmetry: allow a right curve only after a left one has
 * already appeared.
 *
 * Sound because reflecting a layout left-to-right maps left curves to right
 * curves and leaves every other piece alone, so the mirror of a legal track is a
 * legal track of the same length.
 *
 * It also has to be affordable, and that is the fragile part. Reflection swaps
 * the two curve counts, so it stays within budget only because the inventory
 * holds equally many of each — four and four in `SET`, and likewise in every test
 * fixture. Give the model an inventory with more of one colour than the other and
 * this break starts ruling out real answers. `tests/track.test.js` pins the
 * equality for that reason.
 *
 * It halves the search without touching the optimal value. It does not break
 * rotation (the same cyclic loop read from a different starting piece), which is
 * the larger symmetry and a harder one to state. Smaller than it looks, though:
 * the start is face-up with nothing below it, so only pieces at the bottom of a
 * track can open it — 8.9 of 36 on average over the swept 35-cube tracks.
 * Pinning the cross as the start was tried and removed; CLAUDE.md has why.
 */
function breakMirrorSymmetry(model, rows, selectors) {
  const ofType = (vars, name) =>
    vars.flatMap((v, r) => (PIECE_TYPES[rows[r].type] === name ? [v] : []));

  const leftsSoFar = [];
  for (const vars of selectors) {
    for (const right of ofType(vars, 'rightCurve')) {
      model.addBoolOr([right.not(), ...leftsSoFar]);
    }
    leftsSoFar.push(...ofType(vars, 'leftCurve'));
  }
}

/** Which axis a heading runs along: left/right 0, up/down 1, forwards/back 2. */
const AXIS_OF = { L: 0, R: 0, U: 1, D: 1, F: 2, B: 2 };

/**
 * The cross, traversed twice.
 *
 * A cross is one cube with two rails on one face, so the train can pass over it
 * twice — but only one of those passes puts a cube on the table. The later pass
 * is a `revisit`: it claims no material and no clearance, because the earlier
 * pass already claimed both.
 *
 * Encoded per *cube*, not per pair of steps. Each cross the box can spend gets a
 * crossing slot with its own cell, face and heading axes, plus two selectors
 * naming which step runs its first rail and which runs its second. The geometry
 * is then stated once against the slot's variables rather than once for every
 * pair of steps that might conceivably have been the same cube.
 *
 * That is the whole reason for the shape. A boolean per ordered pair of steps is
 * O(steps²) — 630 of them at 36 steps — and it asks the solver to rediscover
 * which pairs could possibly go together. This is O(steps × crosses), and a box
 * holds one or two crosses, not eighteen.
 *
 * A revisit still has to be earned. Both passes must be crosses, at the same
 * cell and on the same face, with their headings on different axes: equal or
 * opposite headings are the same rail, which is retracing rather than crossing.
 *
 * One further rule carries three meanings at once — a step takes at most one role
 * across all slots. That says a cube is crossed only once (it has two rails, not
 * three), that a placement is never itself a revisit, and that a step is not both
 * passes over itself.
 */
function addCrossings({
  model, rows, selectors, x, y, z, active, reach, crosses, minCrossings,
  minLoopLength,
}) {
  const steps = selectors.length;
  // Two steps to a crossing, and never more crossings than crosses in the box.
  const slotCount = Math.min(crosses, Math.floor(steps / 2));

  const isCross = selectors.map(vars =>
    sum(vars.flatMap((v, r) => (PIECE_TYPES[rows[r].type] === 'cross' ? [v] : []))));
  const faceOf = selectors.map(vars => pick(vars, rows, r => FACES.indexOf(POSES[r.pose][0])));
  const axisOf = selectors.map(vars => pick(vars, rows, r => AXIS_OF[POSES[r.pose][1]]));

  const roles = Array.from({ length: steps }, () => []);   // every role any step holds
  const seconds = Array.from({ length: steps }, () => []); // the revisiting ones only
  const used = [];
  const firstAt = [];

  for (let c = 0; c < slotCount; c++) {
    const on = model.newBoolVar(`crossing_${c}`);
    const cell = ['X', 'Y', 'Z'].map((a, k) => model.newIntVar(...reach[k], `cross${a}_${c}`));
    const face = model.newIntVar(0, FACES.length - 1, `crossFace_${c}`);
    const at = [], axis = [];

    // The two passes are built the same way; only what they mean downstream
    // differs, so the second one's selectors are also the revisit flags.
    for (const pass of ['first', 'second']) {
      const takes = selectors.map((_, i) => model.newBoolVar(`${pass}_${c}_${i}`));
      model.add(sum(takes).equals(on));

      const axisHere = model.newIntVar(0, 2, `${pass}Axis_${c}`);
      const atHere = model.newIntVar(0, steps - 1, `${pass}At_${c}`);
      model.add(atHere.equals(sum(takes.map((v, i) => v.times(i)))));

      takes.forEach((v, i) => {
        roles[i].push(v);
        if (pass === 'second') seconds[i].push(v);
        model.add(v.le(active[i]));
        const when = bounded => model.add(bounded).onlyEnforceIf(v);
        when(isCross[i].equals(1));
        [x, y, z].forEach((axes, a) => when(cell[a].equals(axes[i])));
        when(face.equals(faceOf[i]));
        when(axisHere.equals(axisOf[i]));
      });
      at.push(atHere);
      axis.push(axisHere);
    }

    // Of two passes over one cube the earlier is the placement, by definition.
    model.add(at[0].lt(at[1])).onlyEnforceIf(on);
    // Shape rather than legality: a small loop is perfectly legal, and left to
    // itself the solver closes almost every crossing the smallest way it is
    // allowed — 32 of the first 38 layouts of a 35-cube sweep were the same
    // six-step figure eight, and banning that moved the pile-up to eight.
    //
    // A crossing splits the loop into two, and both are bounded. The gap in
    // route order is only one of them; the other runs from the second pass round
    // through the start to the first, so a route that starts inside the small
    // loop reads as a gap of length − 6 and slipped through when only the first
    // was checked — twelve layouts of that same sweep did.
    if (minLoopLength !== null) {
      const gap = at[1].minus(at[0]);
      model.add(gap.ge(minLoopLength)).onlyEnforceIf(on);
      model.add(sum(active).minus(gap).ge(minLoopLength)).onlyEnforceIf(on);
    }
    // The rails must actually cross. Said via `differ` because notEquals does not.
    differ(model, axis[0], axis[1], `crossAxis_${c}`);

    // Slots are interchangeable, which is a symmetry worth closing: fill them in
    // order, and in the order their placements appear along the route.
    if (c) {
      model.add(on.le(used[c - 1]));
      model.add(firstAt[c - 1].lt(at[0])).onlyEnforceIf(on);
    }
    used.push(on);
    firstAt.push(at[0]);
  }

  // What the rest of the model actually asks of a step: does it claim anything?
  const revisit = selectors.map((_, i) => model.newBoolVar(`revisit_${i}`));
  revisit.forEach((r, i) => model.add(r.equals(sum(seconds[i]))));
  for (const held of roles) if (held.length) model.add(sum(held).le(1));
  if (minCrossings) model.add(sum(used).ge(minCrossings));
  return revisit;
}

/**
 * You only have the pieces in the box (pieces.md:144-156).
 *
 * Counted in cubes, not in steps: a crossed cross is two steps and one cube, so
 * the revisits come back off the total.
 */
function addInventory(model, rows, selectors, inventory, revisit) {
  for (const pool of POOLS) {
    const inPool = selectors.flatMap(vars =>
      vars.flatMap((v, r) => (POOL_OF[PIECE_TYPES[rows[r].type]] === pool ? [v] : [])));
    if (!inPool.length) continue;
    const spent = pool === 'cross' && revisit ? sum(inPool).minus(sum(revisit)) : sum(inPool);
    model.add(spent.le(inventory[pool] ?? 0));
  }
}

/** sum of coefficient × selector — the value some quantity takes at this step. */
const pick = (vars, rows, of) => sum(vars.map((v, r) => v.times(of(rows[r]))));

/** The cells a row's piece claims, as offsets from the train's cell at the head. */
const cellsOf = (row, kind) => cellsFor(PIECE_TYPES[row.type], POSES[row.pose], [0, 0, 0])[kind];

/**
 * The scalar cell-id scheme. A cell (x, y, z) becomes x + N·y + N²·z, shifted
 * positive. That is linear in the head's coordinates, and a claimed cell's
 * offset is a constant, so a claim is just the head's id plus a number the
 * selectors pick out — no multiplication anywhere.
 *
 * Each axis has to cover every cell any claim can reach, or two different cells
 * would fold onto the same id. Material lives within the region, and every head
 * and train cell is one cell from material, so within one of it; each axis keeps
 * one cell of room past that.
 */
function grid(region) {
  const lows = region.map(([lo]) => lo - 2);
  const sizes = region.map(([lo, hi]) => hi - lo + 5);
  const stride = [1, sizes[0], sizes[0] * sizes[1]];
  const idOf = offset => offset.reduce((id, v, a) => id + v * stride[a], 0);
  return { stride, size: stride[2] * sizes[2], idOf, shift: -idOf(lows) };
}

/**
 * One integer per cell a piece claims, of one kind — material or train.
 *
 * Pieces claim one cell or four depending on type, and type is a variable, so
 * unused slots need somewhere to go. They get a sentinel past the end of the
 * grid, distinct per slot and per kind, so that AllDifferent over material stays
 * satisfiable and no material sentinel can ever collide with a train one.
 */
function claimSlots({ model, rows, selectors, x, y, z, g, kind, sentinel, revisit }) {
  const claims = [];
  const maxSlots = Math.max(...rows.map(row => cellsOf(row, kind).length));

  selectors.forEach((vars, i) => {
    const head = sum([x[i], y[i].times(g.stride[1]), z[i].times(g.stride[2])]).plus(g.shift);
    for (let k = 0; k < maxSlots; k++) {
      const cellAt = row => cellsOf(row, kind)[k];
      const used = model.newBoolVar(`${kind}Used_${i}_${k}`);
      // A revisit claims nothing: the first pass over this cube already did.
      // Only slot 0 needs the subtraction — a cross fills one cell and needs
      // one clearance cell, so its later slots are empty either way.
      const claimed = pick(vars, rows, row => (cellAt(row) ? 1 : 0));
      model.add(used.equals(revisit && k === 0 ? claimed.minus(revisit[i]) : claimed));

      const spare = sentinel + i * MAX_FOOT + k;
      const claim = model.newIntVar(0, spare, `${kind}_${i}_${k}`);
      model.add(claim.equals(head.plus(pick(vars, rows, row => (cellAt(row) ? g.idOf(cellAt(row)) : 0)))))
        .onlyEnforceIf(used);
      model.add(claim.equals(spare)).onlyEnforceIf(used.not());
      claims.push({ claim, used, step: i, slot: k });
    }
  });
  return claims;
}

/** The region binds material cells, not the head — as the oracle reads the box and floor. */
//
// Returns every material slot as `{ used, coord }`, for anything else that reads
// where the material is — the volume objective.
function boundMaterial({ model, rows, selectors, x, y, z, region }) {
  return selectors.flatMap((vars, i) => Array.from({ length: MAX_FOOT }, (_, k) => {
    const cellAt = row => cellsOf(row, 'material')[k];
    const used = model.newBoolVar(`inBox_${i}_${k}`);
    model.add(used.equals(pick(vars, rows, row => (cellAt(row) ? 1 : 0))));
    const coord = [x, y, z].map((axis, a) =>
      axis[i].plus(pick(vars, rows, row => (cellAt(row) ? cellAt(row)[a] : 0))));
    coord.forEach((at, a) => {
      model.add(at.le(region[a][1])).onlyEnforceIf(used);
      model.add(at.ge(region[a][0])).onlyEnforceIf(used);
    });
    return { used, coord };
  }));
}

/**
 * Start the search from a route we already have.
 *
 * A hint constrains nothing. The model is the same model and the optimum is the same
 * optimum; all this does is give CP-SAT somewhere to begin. That matters here for one
 * reason: the first thing the solver finds is the first thing there is to draw, and
 * on the browser's single worker that is otherwise half a minute of blank screen.
 *
 * Only the true selectors are named, plus which steps are on at all. The false ones
 * follow from `sum(selectors) == active` the moment the true one is fixed, so naming
 * them would add a few thousand entries and no information.
 */
function hintRoute({ model, rows, selectors, active, route, startPose }) {
  if (route.length > selectors.length) {
    throw new Error(`hint is ${route.length} pieces but there are only ${selectors.length} steps`);
  }
  // Chained first, so an illegal hint throws here rather than quietly costing a solve.
  chainTrack(route, startPose).forEach((piece, i) => {
    const r = rows.findIndex(row =>
      POSES[row.pose] === piece.pose && PIECE_TYPES[row.type] === piece.type);
    if (r < 0) {
      throw new Error(`hint step ${i} is a ${piece.type} at ${piece.pose}, which this model `
        + 'has no row for — is that type excluded?');
    }
    model.addHint(selectors[i][r], 1);
    model.addHint(active[i], 1);
  });
  for (let i = route.length; i < selectors.length; i++) model.addHint(active[i], 0);
}

/**
 * Two variables must differ.
 *
 * NOT `a.notEquals(b)`: through cpsat-js 1.1.0 that constraint is silently a no-op —
 * pin two variables to the same value, add it, and the model still solves. So
 * this says the same thing the long way round, as a pair of strict inequalities
 * under a reifying boolean, which does work. Fix the library and this can
 * collapse back to one line; until then tests/library.test.js guards it.
 */
function differ(model, a, b, name) {
  const below = model.newBoolVar(name);
  model.add(a.lt(b)).onlyEnforceIf(below);
  model.add(a.gt(b)).onlyEnforceIf(below.not());
}

/**
 * Clearance: no cell is ever both material and train. Train cells may coincide
 * with each other — there is only one train — so this is not an AllDifferent and
 * cannot be folded into the material one. It is every material claim against
 * every train claim, pairwise.
 *
 * That is quadratic, and it is the cost the boolean occupancy grid would buy
 * back. The benchmark in tests/clearance.test.js is what decides whether it
 * needs buying.
 */
function addClearance(model, material, train) {
  for (const m of material) {
    for (const t of train) {
      differ(model, m.claim, t.claim, `clear_${m.step}_${m.slot}_${t.step}_${t.slot}`);
    }
  }
}

/**
 * Build the model. Returns the variables the caller needs to read a solution
 * back out, so that reading stays in one place.
 */
function buildModel({
  steps, box, minY, exclude, startPose, collisions, checkTrain,
  inventory, objective, symmetryBreaking, crossings, minCrossings, minLoopLength,
  require: forced, hint, fill, ranges, limits, spans, direction,
}) {
  const rows = transitionTable().filter(row => !exclude.includes(PIECE_TYPES[row.type]));
  const model = new CpModel();
  const start = POSES.indexOf(startPose);

  // Everything is built over the region, never the whole box: a narrower span
  // is a smaller model, not just a capped one.
  const region = regionOf(box, minY, spans);

  // Head position and pose before each step, plus one more for after the last:
  // that final head is what has to be back where it started. The head's own
  // domain is one wider than the region, because the region binds material cells
  // and a head is the train's cell, one beyond the cube it stands on — except
  // below the floor, where the train cannot be either: riding under a cube on the
  // ground would put it inside the ground. No piece books a train cell lower than
  // both of its heads, so bounding the heads bounds the whole train.
  const reach = region.map(([lo, hi], a) =>
    [a === UP && minY !== null ? Math.max(lo - 1, minY) : lo - 1, hi + 1]);
  const x = [], y = [], z = [], pose = [];
  for (let i = 0; i <= steps; i++) {
    [x, y, z].forEach((axis, a) => axis.push(model.newIntVar(...reach[a], `${'xyz'[a]}_${i}`)));
    pose.push(model.newIntVar(0, POSES.length - 1, `pose_${i}`));
  }

  const active = activeSteps(model, steps);
  // Every step used, which turns "the most cubes you can spend" from something an
  // objective reaches for into something the model demands. One equation does it: the
  // active steps are a contiguous prefix, so pinning the last one on pins them all.
  //
  // With crossings off — the case this exists for — a step is a cube, so this is
  // exactly "spend the whole inventory". With crossings on it is weaker than that: a
  // revisit is a step that costs no cube, so a filled route could still leave one in
  // the box.
  if (fill) model.add(active[steps - 1].equals(1));
  const selectors = [];
  for (let i = 0; i < steps; i++) {
    const vars = stepSelectors(model, rows, i, active[i]);
    selectors.push(vars);
    // At most one selector is true, so each of these reads off that row — and
    // when the step is off every term is zero, which leaves the head exactly
    // where it was. No special case needed for the displacement.
    model.add(x[i + 1].equals(x[i].plus(pick(vars, rows, r => r.dx))));
    model.add(y[i + 1].equals(y[i].plus(pick(vars, rows, r => r.dy))));
    model.add(z[i + 1].equals(z[i].plus(pick(vars, rows, r => r.dz))));
    // Chaining: the row's own pose must be the head's pose, and the row's exit
    // pose must be the next head's. Sharing the pose variable between the two
    // equations is what makes consecutive pieces click together. The pose does
    // need the special case — a zero sum would mean pose index 0, not "unchanged".
    model.add(pose[i].equals(pick(vars, rows, r => r.pose))).onlyEnforceIf(active[i]);
    model.add(pose[i + 1].equals(pick(vars, rows, r => r.nextPose))).onlyEnforceIf(active[i]);
    model.add(pose[i + 1].equals(pose[i])).onlyEnforceIf(active[i].not());
  }

  // The loop closes on cell AND pose: coming home with the wrong face or heading
  // means the last piece cannot click into the first (coordinates.md:95-100).
  // Both ends are the train's cell above the start cube, which is the origin.
  const [hx, hy, hz] = startCell(startPose);
  for (const [v, want] of [[x[0], hx], [y[0], hy], [z[0], hz], [pose[0], start],
                           [x[steps], hx], [y[steps], hy], [z[steps], hz], [pose[steps], start]]) {
    model.add(v.equals(want));
  }

  // The box and the floor apply whether or not the collision rules are on, so
  // that switching a rule off changes exactly one thing.
  const material = boundMaterial({ model, rows, selectors, x, y, z, region });

  // How many crossings could there be at most? One per cross in the box; with no
  // inventory the only limit is that a crossing takes two steps.
  const crosses = inventory ? (inventory.cross ?? 0) : Math.floor(steps / 2);
  if (minCrossings) {
    if (!crossings) {
      throw new Error('minCrossings needs crossings: true — with the encoding off, '
        + 'no step can be a revisit and the model is infeasible for a reason that is not physical');
    }
    if (minCrossings > crosses) {
      throw new Error(`minCrossings ${minCrossings} but the inventory holds ${crosses} cross(es)`);
    }
  }
  // Without the encoding there is no crossing to bound, so the bound would be
  // silently ignored — which reads as "no loop was that small" when none was asked.
  if (minLoopLength !== null && !crossings) {
    throw new Error('minLoopLength needs crossings: true — with the encoding off there is no crossing to bound');
  }

  // Crossings first: whether a step is a revisit decides whether it claims.
  const revisit = crossings
    ? addCrossings({ model, rows, selectors, x, y, z, active, reach, crosses,
                     minCrossings, minLoopLength })
    : null;

  const g = grid(region);
  const slots = kind => claimSlots({
    model, rows, selectors, x, y, z, g, kind, revisit,
    sentinel: g.size + (kind === 'train' ? steps * MAX_FOOT : 0),
  });

  if (collisions) {
    const material = slots('material');
    model.addAllDifferent(material.map(c => c.claim));
    if (checkTrain) addClearance(model, material, slots('train'));
  }

  if (inventory) addInventory(model, rows, selectors, inventory, revisit);
  if (symmetryBreaking) breakMirrorSymmetry(model, rows, selectors);

  if (objective) {
    const apply = OBJECTIVES[objective];
    if (!apply) throw new Error(`unknown objective ${objective}`);
    // The metrics rank arrangements of one whole inventory. Leave the length free
    // and the best volume is a four-piece ring, and the wrap would read the
    // switched-off tail as track.
    if (objective !== 'maximiseScore' && !fill) {
      throw new Error(`the ${objective} objective needs fill: true — it compares full-length loops`);
    }
    if (direction === 'worst' && !twoWay(objective, ranges)) {
      throw new Error(`the ${objective} objective is sound only in its good direction, so its worst cannot be asked for`);
    }
    apply({ model, active, revisit, rows, selectors, material, region, ranges, direction, y });
  }

  if (limits) {
    if (!fill) throw new Error('limits need fill: true — the metrics compare full-length loops');
    addLimits({ model, active, revisit, rows, selectors, material, region, ranges, direction, y }, limits);
  }

  // A box per axis: the region only says where the material may be, which for a
  // span of n is 2n − 1 cells wide, so the extent itself is capped as well.
  if (spans) {
    materialExtent({ model, material, region })
      .forEach(({ at }, a) => model.add(at.le(spans[a])));
  }

  if (hint) hintRoute({ model, rows, selectors, active, route: hint, startPose });

  // Pin the route, for asking whether one particular track is feasible.
  if (forced) {
    forced.forEach((type, i) => {
      model.addBoolOr(rows.flatMap((row, r) =>
        (PIECE_TYPES[row.type] === type ? [selectors[i][r]] : [])));
    });
  }

  return { model, rows, selectors, active, revisit };
}

const STATUS = {
  [CpSolverStatus.OPTIMAL]: 'OPTIMAL',
  [CpSolverStatus.FEASIBLE]: 'FEASIBLE',
  [CpSolverStatus.INFEASIBLE]: 'INFEASIBLE',
  [CpSolverStatus.MODEL_INVALID]: 'MODEL_INVALID',
  [CpSolverStatus.UNKNOWN]: 'UNKNOWN',
};

/**
 * Which row each step chose, read back from the selector booleans. An inactive
 * step chose none, and shows up as -1 — dropped from the route, but kept in the
 * no-good cut so that "off" is part of what gets forbidden.
 */
const chosenRows = (result, selectors) =>
  selectors.map(vars => vars.findIndex(v => result.value(v) === 1));

/**
 * Solve for a closed track.
 *
 *   steps        the most pieces the loop may have. Always an upper bound: the
 *                loop uses a contiguous prefix of the steps and the tail is off,
 *                so a shorter loop is always available and this model can never
 *                be infeasible for want of somewhere to put a piece
 *   box          no material cell further than this from the origin on any axis
 *   minY         floor; null for none. 0 means nothing below the ground, neither
 *                material nor the train
 *   exclude      piece types to leave out
 *   collisions   enforce at most one piece per cell. Off is only useful for
 *                comparing against an oracle run with the rule off too
 *   checkTrain   enforce clearance as well: no cell both material and train
 *   inventory    pool counts the loop may spend, e.g. SET. Omit for a
 *                bottomless box of pieces
 *   objective    a key of OBJECTIVES, e.g. 'maximiseScore', or one of the metrics
 *                of src/metrics.js ('faces', 'volume', 'repeats', 'faceUp',
 *                'ceiling', 'height') or 'combined', each optimised in its good
 *                direction unless
 *                `direction` asks for the worst.
 *                The metric objectives need `fill`
 *   direction    'best' (the default) or 'worst': which end of the objective to
 *                ask for. Worst only for repeats, faceUp, ceiling and height,
 *                the encodings exact both ways, and a combined weighing only
 *                those; anything else throws
 *   ranges       each metric's [lo, hi], which `combined` rescales by — one of
 *                POPULATION_RANGES in src/metrics.js
 *   limits       metrics held at least this good, e.g. { faces: 6, combined: n },
 *                each in its good direction (SIGNS; combined is maximised, in the
 *                integers of combinedWeights), or at least this bad when
 *                `direction` is worst. Needs `fill`
 *   spans        [across, up, along]: the most cells the material may extend
 *                along each axis, wherever it sits inside `box`. The model is
 *                built over only the cells such a track could reach, since the
 *                start cube is at the origin: n − 1 either side of it, in the box
 *   symmetryBreaking  rule out mirror-image duplicates. Off by default, because
 *                enumerating every solution has to see them
 *   crossings    let the train pass twice over one cross. Off by default, because
 *                it is the most expensive part of the model and the starter set
 *                has no crosses to cross. Owen's set has one
 *   minCrossings require at least this many crossings. Needs `crossings`. Turns a
 *                crossing from something the objective may reach for into
 *                something the track must have — a different question, and the
 *                answer may spend fewer cubes than the unconstrained optimum
 *   require      pin the piece type at each step, to ask whether one particular
 *                track is feasible
 *   hint         a route to start the search from, as an array of piece types.
 *                Advisory only — it cannot change the optimum, and a wrong one
 *                costs search time and nothing else. Worth having because the
 *                first solution found is the first one there is to draw. Chained
 *                before it is used, so an illegal hint throws rather than solving
 *   onSolution   called for each improving solution the search finds, with
 *                `{ index, live, seconds, score, bound, route, pieces, dropped }`.
 *                The last four are exactly what this function returns, from the
 *                same code — so an incumbent and an answer can be drawn by one
 *                draw. `index` counts from 0, `seconds` is the solver's own wall
 *                clock, `bound` is the best objective bound at that moment (an
 *                upper bound under maximiseScore, so score <= bound), and `live`
 *                says whether it arrived during the search or was replayed at the
 *                end — see cpsat-js, which can only enter JS from the search when
 *                there is one worker. Watch-only: the return value is ignored
 *   minLoopLength
 *                the fewest steps either of the two loops a crossing makes may
 *                have, or null for no bound. A crossing splits the route in two,
 *                and this bounds the smaller. The tightest loop there is is six
 *                steps out and back — the figure eight, XSLLLSX — so anything up
 *                to 6 constrains nothing (loops are always even: the head returns
 *                to the cell it left and every piece moves it an odd number of
 *                cells). Left unbounded, a sweep piles up on the smallest loop it
 *                is allowed, which is what this is for. Needs `crossings`
 *   fill        demand that every step is used, rather than leaving the length to
 *                an objective. With crossings off that is "spend the whole
 *                inventory", so every solution is already as good as a loop can
 *                be — which is what makes enumeration worth watching, since a
 *                model with no objective has no way to report progress
 *   enumerateAllSolutions
 *                report every solution through onSolution as the search finds
 *                them, rather than stopping at the first. Needs no objective:
 *                CP-SAT enumerates only when there is nothing to optimise. Pair
 *                it with `fill` or the stream is mostly four-piece rings, since
 *                the step budget is an upper bound and short loops are plentiful.
 *                Not the same thing as `allSolutions` below — this is one solve
 *                streaming live, that is many solves with cuts between them, and
 *                only that one works with an objective
 *   allSolutions enumerate every solution instead of returning one, by adding a
 *                no-good cut for each and re-solving until infeasible. onSolution
 *                fires for every incumbent of every round, index counting on
 *   maxSolutions stop enumerating after this many and set `truncated` on the
 *                result, so a capped sweep can never be mistaken for a complete one
 *   engine       'wasm' (cpsat-js, the default and the only one in a browser) or
 *                'native' (OR-Tools in a child process, Node only, needs `uv`).
 *                The same model either way; native's onSolution is always live
 *
 * Returns `{ status, route, pieces, dropped, score }`, or `{ status, routes }`
 * when enumerating. `route` is the order the train travels — a crossed cross is
 * in it twice — while `pieces` is that route chained, each entry flagged
 * `revisit` or not, `dropped` counts cubes left in the box, and `score` is what
 * the route is worth under SCORES. With an objective it also carries `value` and
 * `bound`, the solver's own objective and best bound, for reporting a gap.
 */
export async function solveTrack({
  steps, box = 6, minY = null, exclude = [], startPose = 'DF',
  collisions = true, checkTrain = true, inventory,
  objective, symmetryBreaking = false, crossings = false, minCrossings,
  minLoopLength = null, require, hint,
  fill = false, ranges, limits, spans, enumerateAllSolutions = false,
  allSolutions = false, maxSolutions, maxTimeInSeconds, numWorkers, onSolution,
  engine = 'wasm', direction = 'best',
}) {
  // Check the numbers before handing them to the solver: a NaN reaches cpsat-js
  // as a BigInt conversion error several frames deep, which says nothing useful.
  for (const [name, value] of [['steps', steps], ['box', box]]) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer, got ${value}`);
    }
  }
  if (minY !== null && !Number.isInteger(minY)) {
    throw new Error(`minY must be an integer or null, got ${minY}`);
  }
  if (spans && !(spans.length === 3 && spans.every(n => Number.isInteger(n) && n >= 1))) {
    throw new Error(`spans must be three positive integers, got ${spans}`);
  }
  if (minLoopLength !== null && !(Number.isInteger(minLoopLength) && minLoopLength >= 1)) {
    throw new Error(`minLoopLength must be a positive integer or null, got ${minLoopLength}`);
  }

  if (!['best', 'worst'].includes(direction)) {
    throw new Error(`direction must be best or worst, got ${direction}`);
  }
  if (!(engine in ENGINES)) {
    throw new Error(`engine must be one of ${Object.keys(ENGINES).join(', ')}, got ${engine}`);
  }
  const solve = await ENGINES[engine]();
  const { model, rows, selectors, active } = buildModel({
    steps, box, minY, exclude, startPose, collisions, checkTrain,
    inventory, objective, symmetryBreaking, crossings, minCrossings, minLoopLength,
    require, hint, fill, ranges, limits, spans, direction,
  });
  const routeOf = chosen => chosen.filter(r => r >= 0).map(r => PIECE_TYPES[rows[r].type]);
  // An inactive step is forbidden by its active flag; an active one by its row.
  const noGood = chosen => chosen.map((r, i) => (r < 0 ? active[i] : selectors[i][r].not()));
  // Chain the route back through the model to find out what it really costs.
  // Not `steps - route.length`: a crossed cross is two steps and one cube, so
  // counting steps is precisely how a model mints pieces it does not own. And
  // not read off a solver variable either — chainTrack works the revisits out
  // from the geometry, so it is an independent count. If the route is illegal it
  // throws, which is the right thing to do with a bug of that kind.
  const report = route => {
    const pieces = chainTrack(route, startPose);
    const cubes = pieces.filter(p => !p.revisit).length;
    const held = inventory ? Object.values(inventory).reduce((a, b) => a + b, 0) : null;
    return {
      route, pieces, score: scoreOf(pieces),
      dropped: held === null ? null : held - cubes,
    };
  };

  // Each improving solution, read the same way an answer is read: through the
  // selectors and then through `report`, so it arrives chained, scored and counted
  // rather than as solver variables. That ordering is the point — an illegal
  // incumbent throws out of `chainTrack` at the moment it appears, before anything
  // can draw it. A live callback runs inside the solve, so that throw unwinds
  // through WASM and abandons the search, which is the right outcome for a model bug
  // and a poor one to catch and carry on from.
  let seen = 0;
  const observe = onSolution && (solution => onSolution({
    index: seen++,
    live: solution.live,
    seconds: solution.wallTime,
    bound: solution.bestObjectiveBound,
    ...report(routeOf(chosenRows(solution, selectors))),
  }));

  // numWorkers picks which subsolver portfolio runs, not just how much
  // parallelism: 1 or >= 6, never in between. Left unset it is 8 in Node, and
  // clamped to 1 in the browser, which has no threads — and that clamp is also what
  // decides whether onSolution is live, since only a single-worker search can enter
  // JS from inside itself.
  if (enumerateAllSolutions && objective) {
    throw new Error('enumerateAllSolutions needs a model with no objective — CP-SAT '
      + 'enumerates only when there is nothing to optimise, so this would silently '
      + `report improving solutions instead. Drop the objective, or use fill to demand `
      + 'the length that maximiseScore would have reached for');
  }

  const params = {
    ...(maxTimeInSeconds ? { maxTimeInSeconds } : {}),
    ...(numWorkers ? { numWorkers } : {}),
    ...(enumerateAllSolutions ? { enumerateAllSolutions } : {}),
    ...(observe ? { onSolution: observe } : {}),
  };

  if (!allSolutions) {
    const result = await solve(model, params);
    const status = STATUS[result.status];
    if (status !== 'OPTIMAL' && status !== 'FEASIBLE') {
      return { status, route: null, pieces: null, dropped: null, score: null };
    }
    // The solver's own objective and bound, for reporting how far from proved an
    // answer is. Never the number an answer is judged by — that is a recount.
    const solved = objective ? { value: result.objectiveValue, bound: result.bestObjectiveBound } : {};
    return { status, ...solved, ...report(routeOf(chosenRows(result, selectors))) };
  }

  // No-good cuts: forbid the exact set of selectors just used, and solve again.
  // Each round adds a clause, so this is quadratic in the number of solutions —
  // fine for the small cases, worth capping for the large ones.
  const routes = [];
  for (;;) {
    if (routes.length === maxSolutions) return { status: 'OPTIMAL', routes, truncated: true };
    const result = await solve(model, params);
    const status = STATUS[result.status];
    if (status !== 'OPTIMAL' && status !== 'FEASIBLE') {
      if (status !== 'INFEASIBLE') throw new Error(`enumeration stopped on ${status}`);
      return { status: 'OPTIMAL', routes, truncated: false };
    }
    const chosen = chosenRows(result, selectors);
    routes.push(routeOf(chosen));
    model.addBoolOr(noGood(chosen));
    // The hint told the solver where to start; from here on it points at a solution
    // the cuts have just forbidden, which is the one place it is worse than nothing.
    model.clearHints();
  }
}
