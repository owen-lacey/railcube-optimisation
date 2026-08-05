// A thousand answers to each of two questions.
//
// `src/layouts.js` holds layouts the way a paper holds witnesses: eight of them,
// each named, each with a note saying what it settles. This is the other kind of
// evidence — an inventory swept overnight, keeping every distinct layout found.
// Nothing here is more interesting than anything else in it, and that is the
// point: the post can say "a thousand of these" and show you.
//
// Two sweeps, two questions, so two files rather than one with a column saying
// which. `data/sweep-28.json` is 28 cubes in a box of 6 with no cross;
// `data/sweep-crossed.json` is 35 cubes over 36 steps in a box of 8, crossing
// itself once. Both are written by `scripts/extract-sweep.js` from logs that are
// not checked in. Every shape in them was chained through the model and counted
// against the inventory at extract time, and `tests/sweeps.test.js` does it again
// on every run — so a shape reaching a viewer from here has been past the
// geometry twice and the solver's word for it counts for nothing.
//
// **Within a sweep they all score the same, and that is the finding rather than a
// flaw.** Both sweeps spend their inventory in full, so every layout in a file
// holds the same cubes and differs only in their order; the objective sums the
// cubes, so all 1,042 of the first tie on 48 and all 1,306 of the second tie on
// 56. See "SCORES is inert" in CLAUDE.md. Sorting either list by score would sort
// nothing.

// The import attribute is not decoration: without it Node refuses the import
// outright (ERR_IMPORT_ATTRIBUTE_MISSING), and this module has to load under
// plain Node as well as Vite, because that is what puts it under test.
import sweep28 from './data/sweep-28.json' with { type: 'json' };
import sweepCrossed from './data/sweep-crossed.json' with { type: 'json' };

/** The 28-cube sweep: the question, the run, and every distinct layout it found. */
export const SWEEP_28 = sweep28;

/**
 * The crossed sweep: 35 cubes over 36 steps, so the train drives over one cube
 * twice. A different question from the 28 — a bigger inventory, a bigger box,
 * the cross allowed — which is why it is a second file rather than more rows.
 *
 * It was run with `tightCrossings: false`. Left free, the solver closes every
 * crossing the tightest way it can, and a sweep comes back holding one motif
 * over and over; forbidding the tight close is what makes it a sweep of shapes
 * rather than a sweep of one shape. See `minCrossingGap` in src/solver/index.js.
 */
export const SWEEP_CROSSED = sweepCrossed;

/** Both, for anything that wants to iterate rather than name one. */
export const SWEEPS = [SWEEP_28, SWEEP_CROSSED];

/** Just the shape strings, in the file's order — sorted, so it is stable. */
export const SHAPES_28 = sweep28.shapes.map(s => s.shape);
export const SHAPES_CROSSED = sweepCrossed.shapes.map(s => s.shape);

/**
 * The crossed sweep holds every layout twice: a mirror swaps left curves for
 * right ones, and the inventory holds four of each, so a reflection is a track
 * you could really build and not a duplicate row. It is still trivially derived
 * from its partner, though, so a post counting layouts has a choice to make —
 * 1,306 of them, or 653 and their reflections. This is that filter.
 *
 * Sweeps with no mirror in them are unaffected: nothing is flagged, so nothing
 * is dropped.
 */
export const withoutMirrors = ({ shapes }) => shapes.filter(s => !s.mirrored);

/** How many cells a layout fills, across, up and along. Its `span` multiplied out. */
export const volumeOf = ({ span }) => span[0] * span[1] * span[2];

/**
 * A sample of `count` layouts, the same one every time for a given `seed`.
 *
 * A figure showing twelve of a thousand layouts has to show the same twelve on
 * every render, or the post changes under the reader between a screenshot and a
 * scroll — and a plain `slice` would show twelve neighbours in sort order, which
 * are alphabetical neighbours and so all start alike. This spreads the pick over
 * the whole list without needing the list shuffled.
 */
export function sample(count, seed = 0, layouts = sweep28.shapes) {
  if (count > layouts.length) throw new Error(`only ${layouts.length} layouts to pick from`);

  // A full-cycle stride: any step coprime with the length visits every entry
  // before repeating, so the pick never collides with itself and never has to
  // check whether it has.
  let stride = Math.floor(layouts.length / (count + 1)) || 1;
  while (gcd(stride, layouts.length) !== 1) stride += 1;

  const start = Math.abs(seed) % layouts.length;
  return Array.from({ length: count },
    (_, i) => layouts[(start + i * stride) % layouts.length]);
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
