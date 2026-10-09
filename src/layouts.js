// Layouts the solver found, kept here rather than in the spike so the tests can
// check them. Every one is re-derived by the tests: chained for legality and
// counted against the set it claims to be built from.
//
// That check exists because the first version of this table could not be built.
// The model pooled the green and blue flat curves into one allowance of eight, on
// the strength of the product listings counting them together — so the solver
// happily spent six right curves and two left ones. Owen's set has four of each
// and they are not interchangeable, so the layout was fiction. Nothing in the
// model caught it; it was spotted by eye, from a picture.
//
// Shapes are the letters used throughout: S straight, L left curve, R right
// curve, I inside curve, O outside curve, X cross.

import { chainTrack, cubeOf, PIECE_TYPES, PROJ } from './track.js';

const LETTER_OF = {
  straight: 'S', leftCurve: 'L', rightCurve: 'R',
  insideCurve: 'I', outsideCurve: 'O', cross: 'X',
};
const TYPE_OF = Object.fromEntries(Object.entries(LETTER_OF).map(([type, l]) => [l, type]));

/** A layout's shape string as a route of piece types. */
export const routeOf = shape => [...shape].map(l => {
  const type = TYPE_OF[l];
  if (!type) throw new Error(`unknown piece letter ${l}`);
  return type;
});

/** A route as its shape string. */
export const shapeOf = route => route.map(t => LETTER_OF[t]).join('');

/**
 * Which physical cube each placed piece is — `1L` is the first left curve, `2L`
 * the second, and so on per type.
 *
 * The model has no notion of one cube rather than another: an inventory is a
 * count, and any left curve will do. This names them anyway, because a viewer
 * showing one layout being rearranged into another has to know that the left
 * curve arriving here is the one that was over there. Given two shapes built
 * from the same set, matching IDs matches cubes.
 *
 * Revisits are skipped, as everywhere else: a crossed cross is two steps of the
 * route and one cube out of the box, so it holds one ID.
 *
 * Identity is relative to where the route starts, since that is what fixes the
 * counting order — a rotation of a shape renumbers its pieces. That is inherent
 * in naming them by position and not a thing to work around.
 */
export function identify(placed) {
  const seen = {};
  return placed.filter(p => !p.revisit).map(({ type }) => {
    seen[type] = (seen[type] ?? 0) + 1;
    return `${seen[type]}${LETTER_OF[type]}`;
  });
}

/**
 * The 24 rotations of a cube, as signed permutation matrices with determinant +1.
 * Generated rather than listed: all 48 signed permutations, keeping the proper
 * ones. The improper half are reflections, which is why a mirror is not a
 * rotation and keeps a key of its own.
 */
const ROTATIONS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
  .flatMap(perm => [1, -1].flatMap(a => [1, -1].flatMap(b => [1, -1].map(c => ({ perm, sign: [a, b, c] })))))
  .filter(({ perm, sign }) => {
    const parity = perm[0] > perm[1] ? 1 : 0;
    const swaps = parity + (perm[0] > perm[2] ? 1 : 0) + (perm[1] > perm[2] ? 1 : 0);
    return (swaps % 2 === 0 ? 1 : -1) * sign[0] * sign[1] * sign[2] === 1;
  });

/**
 * The same physical track, whatever route describes it.
 *
 * A shape string is one way of reading a track: entering the loop at a
 * different piece, or driving it the other way, reads the same pieces as a
 * different string. So two layouts are the same track when their placed pieces
 * coincide up to a rotation and a shift in space — which is what this compares,
 * off the chained geometry rather than any algebra on the letters. Material
 * cells say where a piece is, train cells which face its rail is on, and the
 * heading which way it points — the cubes click male-to-female along the
 * direction of travel, so a piece's direction is part of the build.
 *
 * That last part is why driving a track backwards is *not* another reading of
 * it. Reversed, every piece would be entered through its male end, and a left
 * curve entered backwards turns right — no route over the same mouldings says
 * that. Measured: no L/R or I/O relabelling of a reversed string reproduces
 * the 18-cube set's key. Only the start piece is free, so the duplicates this
 * catches are cyclic shifts, found wherever they were rotated to in space.
 *
 * The key is the smallest serialisation over the 24 rotations, each translated
 * so its lowest corner sits at the origin.
 */
export function trackKey(shape) {
  // A crossed cross is one cube driven over twice, and which pass comes first
  // depends on where the route starts — so its headings are both passes, unordered.
  const byCube = new Map();
  for (const p of chainTrack(routeOf(shape))) {
    const at = cubeOf(p.cell, p.pose).join(',');
    if (!byCube.has(at)) byCube.set(at, { ...p, headings: [] });
    byCube.get(at).headings.push(PROJ[p.pose[1]]);
  }
  const pieces = [...byCube.values()];
  const cells = pieces.flatMap(p => [...p.material, ...p.train]);

  let best = null;
  for (const { perm, sign } of ROTATIONS) {
    const turn = c => [sign[0] * c[perm[0]], sign[1] * c[perm[1]], sign[2] * c[perm[2]]];
    const low = [Infinity, Infinity, Infinity];
    for (const c of cells) turn(c).forEach((v, a) => { low[a] = Math.min(low[a], v); });
    // Spans stay well under 64 cells, so a cell packs into one sortable number.
    const pack = c => { const t = turn(c); return ((t[0] - low[0]) * 64 + t[1] - low[1]) * 64 + t[2] - low[2]; };
    const aim = h => turn(h).join('');
    const key = pieces
      .map(p => `${LETTER_OF[p.type]}${p.material.map(pack).sort((a, b) => a - b)}`
        + `|${p.train.map(pack).sort((a, b) => a - b)}>${p.headings.map(aim).sort()}`)
      .sort().join(' ');
    if (best === null || key < best) best = key;
  }
  return best;
}

/**
 * The two loops a crossing splits a route into, smaller first, in steps — or
 * null when nothing is crossed. The cross's two passes cut the route in two, and
 * the loops always sum to its length, so only the split says anything.
 */
export function loopsOf(placed) {
  const at = placed.flatMap((piece, i) => (piece.type === 'cross' ? [i] : []));
  if (at.length !== 2) return null;
  const gap = at[1] - at[0];
  return [Math.min(gap, placed.length - gap), Math.max(gap, placed.length - gap)];
}

if (Object.keys(LETTER_OF).length !== PIECE_TYPES.length) {
  throw new Error('the letter table has drifted from the piece catalogue');
}

/**
 * The inventories these answers were solved against.
 *
 * They live here, as data, rather than as exports from track.js, because that is
 * what they are: facts about runs that already happened. Two of the layouts below
 * cannot be built from the model's set at all, which is why each entry has to say
 * what it was solved against instead of naming a set the code still has.
 *
 * That applies to the model's own set too, which is why `MODEL_SET` restates its
 * counts rather than importing `SET`. An entry records the inventory a run really
 * used; a name is free to change meaning afterwards, and then the entry would be
 * claiming something that never happened.
 *
 * The published product counts are documented, with sources, in docs/pieces.md.
 */
const STARTER_SET = {
  straight: 16, leftCurve: 4, rightCurve: 4, insideCurve: 4, outsideCurve: 4, cross: 0,
};
const DELUXE_SET = {
  straight: 32, leftCurve: 8, rightCurve: 8, insideCurve: 8, outsideCurve: 8, cross: 2,
};
/** What Owen owns: the starter set plus four inside curves, one straight swapped
 * for a cross. Derived rather than restated, so the differences stay visible. */
const OWENS_36 = { ...STARTER_SET, insideCurve: 8, straight: STARTER_SET.straight - 1, cross: 1 };
/** The set the model itself holds — `SET` in track.js, as it stood when these two
 * were solved: four of every curve, which is the floor a loop can close at, plus two
 * straights. Small enough that the browser's single worker can prove it optimal. */
const MODEL_SET = {
  straight: 2, leftCurve: 4, rightCurve: 4, insideCurve: 4, outsideCurve: 4, cross: 0,
};

/**
 * Each entry records the question that was asked, so a stale answer is obvious:
 *
 *   set     the inventory it was solved against, as data — not a name to look up
 *   box     no material cell further than this from the origin on any axis
 *   proved  whether the solver proved it optimal, or merely got that far in time
 *   knot    what the rail is, by scripts/knot-curves.js; every one so far is an unknot
 */
export const LAYOUTS = {
  // The model's own set, spent in full: 18 cubes, 34 points, nothing left in the box.
  // Proved optimal in 34 s on the browser's single worker, 7.8 s at eight workers with
  // symmetry breaking. This is the layout `solveTrack`'s `hint` starts a search from.
  set: {
    shape: 'LIRIROSOLORLLSORII',
    set: MODEL_SET, box: 6, proved: true, knot: 'unknot',
    note: "the model's set — 18 cubes, nothing dropped",
  },
  // The same question put to a different solver: native OR-Tools 9.14, driven by a
  // separately written Python model, answered with this instead — a different layout
  // spending the same 18 cubes for the same 34 points. Two implementations, two
  // optima, one value, which is evidence the model is right rather than merely
  // self-consistent.
  //
  // That Python model has since been deleted, so this shape is the only thing left of
  // it. It lives here rather than in a comment because a witness under test keeps
  // being a witness, and a witness in prose stops the moment something drifts.
  setOnNativeOrTools: {
    shape: 'LRRIIOOSRLLOOLSRII',
    set: MODEL_SET, box: 6, proved: true, knot: 'unknot',
    note: 'the same set and the same score, found independently on native OR-Tools',
  },
  // Every cube the starter set ships, in one closed loop, nothing left over —
  // 16 straights, 4 of each curve, which is the set exactly. Proved optimal in
  // 200 s, filling 7×7×8 cells.
  32: {
    shape: 'RSISISRLOSOSRSLSOSOSSSISISSLSLSR',
    set: STARTER_SET, box: 6, proved: true, knot: 'unknot',
    note: 'the whole starter set — 32 cubes, nothing dropped',
  },
  // Owen's own set — all 36 cubes in one loop with nothing left over. Proved
  // optimal in 3546 s, filling 13×7×10 cells.
  //
  // Nothing dropped is the strongest possible answer, and it settles the box
  // question for free: no larger box can beat spending every piece, so 6 was not
  // the binding constraint.
  //
  // Re-solved when the inventory was corrected: the set has one straight swapped
  // for a cross, and the previous shape here spent 16 straights against the 15 he
  // owns. The cross is placed and driven straight over, not crossed: crossing
  // spends no extra cube, so nothing-dropped never has to reach for it.
  owen: {
    shape: 'SSISSSLSSXISSIILOSSLSIOOROIISRSIRSLR',
    set: OWENS_36, box: 6, proved: true, knot: 'unknot',
    note: "Owen's own set — all 36 cubes, nothing dropped",
  },
  // The same set told to fit a smaller box. Twelve cubes will not fit.
  //
  // These two were found while the model still pooled the curve colours, so the
  // solver had more freedom than the real set allows. They survive the correction
  // because neither actually leans on it — this one spends four right curves and
  // no left ones, the next spends four of each — and the tests below re-check
  // them against the split inventory. Re-running under the stricter model did not
  // beat them, so they stand.
  tight: {
    shape: 'SSRRSSIIOORROOSSIISS',
    set: STARTER_SET, box: 4, proved: false, knot: 'unknot',
    note: 'a 4-cell box: two vertical arcs, crested at both ends',
  },
  // Three is the smallest box that holds any loop at all.
  cramped: {
    shape: 'SSRRIIRRLLIISSSLLS',
    set: STARTER_SET, box: 3, proved: false, knot: 'unknot',
    note: 'a 3-cell box: two vertical rings threaded through each other',
  },
  // Twelve steps over eleven cubes: the train drives over the middle cube twice,
  // once on each of its two rails.
  eight: {
    shape: 'XSLLLSXSRRRS',
    set: DELUXE_SET, box: 5, proved: true, knot: 'unknot',
    note: 'a figure of eight through a single cross',
  },
  // Owen's set again, but told it must cross itself — `minCrossings: 1` rather
  // than leaving it to the objective, which never reaches for a crossing because
  // crossing spends no extra cube.
  //
  // Proved optimal in 342 s — but optimal *for a 36-step budget*, which is a
  // weaker claim than it looks. A crossing spends a step without spending a cube,
  // so within 36 steps one revisit leaves only 35 steps placing cubes: 35 is the
  // ceiling by arithmetic, and the solver proved it reaches it.
  //
  // Whether all 36 cubes can be spent while crossing is a different question and
  // is open. It needs a 37-step route, and 37 steps is past what this model can
  // optimise — it found nothing at all in 25 minutes.
  //
  // The one piece left in the box is a straight.
  crossed: {
    shape: 'LIXSRRRSXROLLOILSSSISISIOOIISSSISSSS',
    set: OWENS_36, box: 6, proved: true, knot: 'unknot',
    note: 'Owen\'s set forced to cross itself — 35 cubes, one straight left over',
  },
};
