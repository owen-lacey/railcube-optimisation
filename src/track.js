// The Rail Cube track model: poses, the piece catalogue, and the two hard
// constraints. This is docs/coordinates.md in executable form and the single
// source of truth — both the solver and the visualisation spike import it.
//
// Everything here is in the project frame from docs/coordinates.md: x = right,
// y = up, z = forwards (away from the viewer). No rendering, no PolyCSS.

/** Project-frame vector for each direction letter (coordinates.md:20-24). */
export const PROJ = {
  R: [1, 0, 0], L: [-1, 0, 0],
  U: [0, 1, 0], D: [0, -1, 0],
  F: [0, 0, 1], B: [0, 0, -1],
};

export const OPPOSITE = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L' };
export const FACES = ['U', 'D', 'F', 'B', 'L', 'R'];

const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const letterOf = v => FACES.find(k => PROJ[k].every((c, i) => c === v[i]));

/**
 * A pose is FACE + HEADING. The rail's direction of travel lies flat along the
 * face it is mounted on, so the heading can never be the face letter or its
 * opposite — 24 valid poses out of 36 (coordinates.md:63-82).
 */
export const isValidPose = pose =>
  typeof pose === 'string' && pose.length === 2 &&
  FACES.includes(pose[0]) && FACES.includes(pose[1]) &&
  pose[1] !== pose[0] && pose[1] !== OPPOSITE[pose[0]];

/** All 24 valid poses — one per cube rotation. */
export const POSES = FACES.flatMap(face =>
  FACES.filter(heading => isValidPose(face + heading)).map(heading => face + heading));

/**
 * A pose as a letter → letter substitution: where each direction of a piece
 * authored in the canonical UF pose ends up once the piece is turned. Letters
 * name physical directions, so rotating a move is pure substitution.
 *
 * The cross product needs care. The project frame is LEFT-handed — with x=right
 * and y=up, right × up points at the viewer, but z is forwards, away from them.
 * So the train's right hand is `face × heading` here. Write it the other way
 * round (as a right-handed frame would) and every pose's right becomes left:
 * all curves mirror, every route still closes, and nothing throws.
 */
export function poseLetters(pose) {
  if (!isValidPose(pose)) throw new Error(`invalid pose ${pose}: heading must be perpendicular to face`);
  const map = { U: pose[0], F: pose[1], R: letterOf(cross3(PROJ[pose[0]], PROJ[pose[1]])) };
  for (const k of ['U', 'F', 'R']) map[OPPOSITE[k]] = OPPOSITE[map[k]];
  return map;
}

/**
 * Sum a set of letter weights (e.g. {L: 2, F: 1}) into a project-frame offset,
 * rotating each letter through `map` on the way.
 */
export const delta = (map, weights) => Object.entries(weights).reduce(
  (acc, [letter, n]) => acc.map((v, i) => v + n * PROJ[map[letter]][i]), [0, 0, 0]);

/**
 * The piece catalogue (coordinates.md:114-121 and :155-162), every row given for
 * a piece entered at UF. Entered in any other pose the row is simply rotated.
 *
 *   disp  — where the next empty cell is; the head convention, not the last cell
 *   exit  — the pose the next piece enters with
 *   foot  — the cells the piece's material fills, as offsets from its own cell
 *   train — the cells the train needs, same offsets. The rule is that the train
 *           fills the whole cell on the rail's face side, never the cube's own.
 */
export const MOVES = {
  straight: {
    disp: { F: 1 }, exit: 'UF',
    foot: [{}],
    train: [{ U: 1 }],
  },
  cross: {
    // Two rails on one face, but one train: both traversals want the same cell.
    disp: { F: 1 }, exit: 'UF',
    foot: [{}],
    train: [{ U: 1 }],
  },
  leftCurve: {
    disp: { L: 2, F: 1 }, exit: 'UL',
    foot: [{}, { F: 1 }, { L: 1 }, { L: 1, F: 1 }],
    // All four cells of the layer above, not three: the body is wider than the
    // rail, so its inner flank passes over the inside of the bend.
    train: [{ U: 1 }, { U: 1, F: 1 }, { U: 1, L: 1 }, { U: 1, L: 1, F: 1 }],
  },
  rightCurve: {
    disp: { R: 2, F: 1 }, exit: 'UR',
    foot: [{}, { F: 1 }, { R: 1 }, { R: 1, F: 1 }],
    train: [{ U: 1 }, { U: 1, F: 1 }, { U: 1, R: 1 }, { U: 1, R: 1, F: 1 }],
  },
  insideCurve: {
    disp: { U: 2, F: 1 }, exit: 'BU',
    foot: [{}, { F: 1 }, { U: 1 }, { U: 1, F: 1 }],
    // Nothing extra: the rail is on the concave face, so the train runs through
    // the hollow the arc's own 2×2 already claims.
    train: [],
  },
  outsideCurve: {
    disp: { D: 1 }, exit: 'FD',
    foot: [{}],
    // The train wraps the outside of the edge, sweeping the rest of the 2×2
    // around it: above, in front, and diagonally across the corner between.
    train: [{ U: 1 }, { U: 1, F: 1 }, { F: 1 }],
  },
};

export const PIECE_TYPES = Object.keys(MOVES);

/**
 * What each piece is worth to the objective. A straight is track; everything else
 * does something to the train, and a layout that does more is a better layout.
 *
 * One table, meant to be edited: these are a taste judgement, not a fact about
 * the pieces, and they are the knob to turn when the answers look dull.
 *
 * All positive on purpose. Scoring straights 0 or negative was considered and
 * rejected. The consequence to keep in mind is that inventory is only a cap, so
 * with every weight positive the solver still crams in every piece that fits —
 * what the weights actually decide is which pieces lose when something must be
 * dropped.
 */
export const SCORES = {
  straight: 1,
  cross: 2,
  leftCurve: 2,
  rightCurve: 2,
  insideCurve: 2,
  outsideCurve: 2,
};

if (PIECE_TYPES.some(type => !(type in SCORES))) {
  throw new Error('the score table has drifted from the piece catalogue');
}

/** The cells one placed piece claims: its material, and the clearance its train needs. */
export function cellsFor(type, pose, cell) {
  const move = MOVES[type];
  if (!move) throw new Error(`unknown piece type ${type}`);
  const map = poseLetters(pose);
  const at = offset => delta(map, offset).map((v, k) => v + cell[k]);
  return { material: move.foot.map(at), train: move.train.map(at) };
}

/** Where the head goes after clicking `type` into it: the next empty cell and its pose. */
export function step(cell, pose, type) {
  const move = MOVES[type];
  if (!move) throw new Error(`unknown piece type ${type}`);
  const map = poseLetters(pose);
  const d = delta(map, move.disp);
  return {
    cell: cell.map((v, k) => v + d[k]),
    pose: map[move.exit[0]] + map[move.exit[1]],
  };
}

/**
 * The second hard constraint, in full (coordinates.md:140-183):
 *
 *   - at most one piece per cell, and
 *   - no cell is ever both material and train.
 *
 * Train cells may freely coincide with each other — there is only one train, so
 * two pieces wanting the same clearance cell costs nothing. That asymmetry is
 * what makes the cross legal at all.
 */
export function assertNoCollisions(placed) {
  const claims = createClaims();
  for (const piece of placed) {
    const fault = claims.add(piece);
    if (fault) throw new Error(fault);
  }
}

/**
 * The same rule, accumulated one piece at a time, reporting rather than throwing.
 *
 * It is written this way round because "which piece broke it" is a question a
 * whole-list check cannot answer, and a track being *typed* has to answer it: the
 * letter just pressed is either one the toy can take or one it cannot, and the
 * viewer has to say which. `assertNoCollisions` is this plus a throw, so there is
 * one implementation of the rule and not two.
 *
 * Every pair of pieces is still tested exactly once — a piece is checked against
 * everything claimed before it, then claims its own cells. Within a piece the
 * material clash is looked for first, so a route that breaks both rules reports
 * the material one, as it always did.
 */
export function createClaims() {
  const solid = new Map();    // cell -> the piece whose material fills it
  const wanted = new Map();   // cell -> a piece whose train has to pass through it

  return {
    /** Claim this piece's cells, or say why it cannot have them. */
    add(piece) {
      for (const cell of piece.material) {
        const key = cell.join(',');
        const other = solid.get(key);
        if (other) return `collision at cell ${key}: ${other.type} and ${piece.type}`;
        solid.set(key, piece);
      }
      for (const cell of piece.material) {
        const key = cell.join(',');
        const other = wanted.get(key);
        if (other) {
          return `clearance conflict at cell ${key}: ${piece.type} blocks the train on ${other.type}`;
        }
      }
      for (const cell of piece.train) {
        const key = cell.join(',');
        const other = solid.get(key);
        if (other) {
          return `clearance conflict at cell ${key}: ${other.type} blocks the train on ${piece.type}`;
        }
        // Train cells may freely coincide, so the first claimant is kept and the
        // rest cost nothing — there is only one train.
        if (!wanted.has(key)) wanted.set(key, piece);
      }
      return null;
    },
  };
}

/**
 * Is this step the train coming back through a cross it has already been
 * through — the same cross, on the same face, crossing its own path?
 *
 * A cross is one piece with two rails, so the train passes over it twice. The
 * second pass places nothing: it is the same cube. The headings must be
 * perpendicular, because two visits on the same or opposite headings would be
 * the same rail, not a crossing.
 *
 * Worked out from the geometry rather than declared by the caller, so that a
 * route cannot claim a revisit it has not earned. That is what makes chainTrack
 * an independent check on the solver's piece count.
 *
 * Exported so the brute-force oracle applies the very same rule rather than its
 * own reading of it.
 */
export function isRevisit(type, cell, pose, placedAt) {
  if (type !== 'cross') return false;
  const already = placedAt.get(cell.join(','));
  return Boolean(already)
    && already.type === 'cross'
    && already.pose[0] === pose[0]
    && already.pose[1] !== pose[1]
    && already.pose[1] !== OPPOSITE[pose[1]];
}

/**
 * Unroll a route into placed pieces, throwing unless it is a legal track. The
 * loop closes exactly when the head comes back to the start cell *and* pose —
 * returning with the wrong face or heading means the last piece cannot click
 * into the first.
 *
 * A route is the order the train travels, so a crossed cross appears in it
 * twice. The second appearance is marked `revisit` and claims nothing — no
 * material, and no clearance beyond what the first pass already asked for.
 *
 * Twice and no more. A third pass would be perpendicular to the placement and so
 * would satisfy isRevisit, but it is necessarily along the *same rail* as the
 * second pass — and a rail's two ends already click into two neighbours, so the
 * train cannot run it again.
 */
export function chainTrack(route, startPose = 'UF') {
  const { placed, head, closed, faults } = chainOpen(route, startPose);
  // The order is the one this has always had, and it is not the route's order.
  //
  // A cross traversed a third time outranks everything, because that rule has to
  // bite while the route is still being unrolled: the route in tests/cross.test.js
  // that proves it neither closes nor is collision-free, and the crossing is the
  // point of it. Closure comes next, and a collision last, because a collision used
  // to be looked for only once the whole route was down.
  const overCrossed = faults.find(f => f.kind === 'overCrossed');
  if (overCrossed) throw new Error(overCrossed.message);
  if (!closed) {
    throw new Error(
      `route does not close: head at ${head.cell.join(',')} pose ${head.pose}, wanted 0,0,0 ${startPose}`);
  }
  if (faults.length) throw new Error(faults[0].message);
  return placed;
}

/**
 * The same walk with the closure requirement lifted: what a route *would* build,
 * legal or not, along with everything wrong with it.
 *
 * `chainTrack` asks "is this a track?" and refuses to answer anything else, which
 * is right for a solver's output and useless for one being built by hand — a track
 * being typed is open at every keystroke but the last. So closure is a fact this
 * reports rather than a precondition it enforces:
 *
 *   placed   every piece the route lays down, in order
 *   head     where the route has got to: the next cell and pose
 *   closed   whether that head is back at the start, cell *and* pose
 *   faults   what is wrong with it, in route order — empty if nothing is
 *
 * A fault is `{ index, kind, message }`, `kind` being 'collision' or 'overCrossed',
 * and there is at most one of each: the first collision, and the first cross
 * traversed a third time. `faults[0]` is therefore the first piece that cannot
 * legally go down, which is the one a builder has to be shown. `chainTrack` picks
 * differently, and says why.
 *
 * Chaining continues past a fault — the geometry of the pieces after a bad one is
 * still perfectly well defined, and it is the caller's business how much of the
 * route to keep.
 */
export function chainOpen(route, startPose = 'UF') {
  let cell = [0, 0, 0], pose = startPose;
  const placedAt = new Map();
  const crossedAt = new Set();
  const claims = createClaims();
  let collided = false;
  const faults = [];
  const note = (index, kind, message) => faults.push({ index, kind, message });

  const placed = route.map((type, index) => {
    const at = cell.join(',');
    const revisit = isRevisit(type, cell, pose, placedAt);
    const claimed = revisit ? { material: [], train: [] } : cellsFor(type, pose, cell);
    const piece = { cell, pose, type, revisit, ...claimed };
    if (revisit) {
      if (crossedAt.has(at) && !faults.some(f => f.kind === 'overCrossed')) {
        note(index, 'overCrossed',
          `cross at cell ${at} is traversed more than twice: it has two rails, not three`);
      }
      crossedAt.add(at);
    } else {
      placedAt.set(at, piece);
      // Nothing more is claimed once the route has collided: the cells behind a
      // clash are no longer a description of anything buildable.
      const clash = collided ? null : claims.add(piece);
      if (clash) {
        collided = true;
        note(index, 'collision', clash);
      }
    }
    ({ cell, pose } = step(cell, pose, type));
    return piece;
  });

  return {
    placed,
    head: { cell, pose },
    closed: cell.every(v => v === 0) && pose === startPose,
    faults: faults.sort((a, b) => a.index - b.index),
  };
}

/**
 * What the sets ship (pieces.md:144-156). The white start cube is geometrically a
 * straight and is counted as one.
 *
 * Green and blue flat curves are counted separately, half the listed total each.
 * The product listings give them combined ("8/16"), and on paper they could share
 * one pool: a right curve fills the same cells and moves the head the same way as
 * a left curve, differing only in which face the rail ends on — so a reversible
 * piece could serve as either. Owen's set is not reversible. They are two
 * mouldings and you cannot spend one as the other.
 *
 * This matters to the answers, not just the bookkeeping: pooled, the solver spent
 * six right curves and two left ones on a layout that set cannot build.
 */
export const POOL_OF = {
  straight: 'straight',
  cross: 'cross',
  leftCurve: 'leftCurve',
  rightCurve: 'rightCurve',
  insideCurve: 'insideCurve',
  outsideCurve: 'outsideCurve',
};

export const POOLS = [...new Set(Object.values(POOL_OF))];

/**
 * The set. One inventory, not a catalogue of products — everything that asks
 * "what have I got to build with" asks this.
 *
 * Eighteen cubes: two straights and four of every curve. Chosen by measurement,
 * not by taste (`scripts/benchmark-sets.js`), against one requirement — the
 * browser has to solve it while somebody is watching.
 *
 * Why this shape rather than a scaled-down copy of a real product:
 *
 *   - Four of every curve is the floor, not a preference. A loop turns through a
 *     full circle, so it needs four turns of the same handedness; at three of each
 *     the solver slows by 50% and at two the set cannot close at all.
 *   - The straights are what cost time, not the cube count. Sixteen cubes with
 *     four straights and three of each curve is *smaller* than this and slower
 *     (51 s against 34 s on one worker), because straights are interchangeable
 *     filler and multiply the search without helping the loop close.
 *   - Two straights, not none. A set of pure elbows solves fastest of all, but a
 *     Rail Cube set without a single straight is not a Rail Cube set — and with no
 *     straights the SCORES table has nothing to weigh.
 *
 * `src/routes.js`'s six-face inversion route fits this exactly: both straights and
 * every left, inside and outside curve.
 *
 * No cross. A crossing needs a cube with two rails and the set holds none, so
 * crossings are exercised by test fixtures rather than by this set — the encoding
 * stays, and `src/layouts.js` keeps the figure-of-eight it found when there was a
 * cross to spend.
 */
export const SET = {
  straight: 2, leftCurve: 4, rightCurve: 4, insideCurve: 4, outsideCurve: 4, cross: 0,
};

/**
 * Count entries in a route by inventory pool. Counts the traversal, so a crossed
 * cross counts twice — use countPieces for what is actually spent out of the box.
 */
export function countPools(route) {
  const used = Object.fromEntries(POOLS.map(p => [p, 0]));
  for (const type of route) used[POOL_OF[type]] += 1;
  return used;
}

/**
 * Count the physical pieces a chained track spends, by inventory pool. This is
 * the count an inventory limit or a "dropped pieces" objective must use: a
 * crossed cross is in the route twice and in the box once, and counting the
 * route instead is how a model mints pieces it does not own.
 */
export function countPieces(placed) {
  const used = Object.fromEntries(POOLS.map(p => [p, 0]));
  for (const piece of placed) if (!piece.revisit) used[POOL_OF[piece.type]] += 1;
  return used;
}

/**
 * Does this route fit in this inventory? Returns the pool that overflows, or
 * null. Counts physical pieces, so it chains the route — which means the route
 * has to be a legal closed track.
 */
export function overflowingPool(route, inventory, startPose = 'UF') {
  const used = countPieces(chainTrack(route, startPose));
  return POOLS.find(pool => used[pool] > (inventory[pool] ?? 0)) ?? null;
}

/** The same question for a list of piece types that need not close. */
export function overflowingPoolByType(route, inventory) {
  const used = countPools(route);
  return POOLS.find(pool => used[pool] > (inventory[pool] ?? 0)) ?? null;
}
