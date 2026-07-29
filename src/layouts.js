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

import { PIECE_TYPES } from './track.js';

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

if (Object.keys(LETTER_OF).length !== PIECE_TYPES.length) {
  throw new Error('the letter table has drifted from the piece catalogue');
}

/**
 * The inventories these answers were solved against.
 *
 * They live here, as data, rather than as exports from track.js, because that is
 * what they are: facts about runs that already happened. The model holds one set
 * — see `SET` in track.js — and none of these three is it. Two of the layouts
 * below cannot be built from the model's set at all, which is why each entry has
 * to say what it was solved against instead of naming a set the code still has.
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

/**
 * Each entry records the question that was asked, so a stale answer is obvious:
 *
 *   set     the inventory it was solved against, as data — not a name to look up
 *   box     no material cell further than this from the origin on any axis
 *   proved  whether the solver proved it optimal, or merely got that far in time
 */
export const LAYOUTS = {
  // Every cube the starter set ships, in one closed loop, nothing left over —
  // 16 straights, 4 of each curve, which is the set exactly. Proved optimal in
  // 200 s, filling 7×7×8 cells.
  32: {
    shape: 'RSISISRLOSOSRSLSOSOSSSISISSLSLSR',
    set: STARTER_SET, box: 6, proved: true,
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
    set: OWENS_36, box: 6, proved: true,
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
    set: STARTER_SET, box: 4, proved: false,
    note: 'a 4-cell box: two vertical arcs, crested at both ends',
  },
  // Three is the smallest box that holds any loop at all.
  cramped: {
    shape: 'SSRRIIRRLLIISSSLLS',
    set: STARTER_SET, box: 3, proved: false,
    note: 'a 3-cell box: two vertical rings threaded through each other',
  },
  // Twelve steps over eleven cubes: the train drives over the middle cube twice,
  // once on each of its two rails.
  eight: {
    shape: 'XSLLLSXSRRRS',
    set: DELUXE_SET, box: 5, proved: true,
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
    set: OWENS_36, box: 6, proved: true,
    note: 'Owen\'s set forced to cross itself — 35 cubes, one straight left over',
  },
};
