// A thousand answers to each of two questions.
//
// `src/layouts.js` holds layouts the way a paper holds witnesses: eight of them,
// each named, each with a note saying what it settles. This is the other kind of
// evidence — an inventory swept overnight, keeping every distinct layout found.
// Nothing here is more interesting than anything else in it, and that is the
// point: the post can say "a thousand of these" and show you.
//
// `data/sweep-28.json` is 28 cubes in a box of 6 with no cross: a finished sweep,
// and frozen — nothing writes to it any more. Every shape in it was chained
// through the model and counted against the inventory on the way in, and
// `tests/sweeps.test.js` does it again on every run — so a shape reaching a
// viewer from here has been past the geometry twice and the solver's word for it
// counts for nothing.
//
// `data/sweep-crossed.json` is 35 cubes over 36 steps in a box of 8, crossing
// itself once — and it is a *sample*. The sweep itself is millions of layouts in
// the gitignored `sweeps.db`, far more than a page can import whole, so
// `scripts/sample-sweep.js` draws a thousand uniformly from it, re-derives each
// through the model, and writes them here. Uniform means it is skewed the way
// the database is, to big loops: a crossing whose smaller loop is 6 or 8 cubes is
// all but absent. `population` is how many it was drawn from.
//
// **Within a sweep they all score the same, and that is the finding rather than a
// flaw.** Both sweeps spend their inventory in full, so every layout in a file
// holds the same cubes and differs only in their order; the objective sums the
// cubes, so all of the first tie on 48 and all of the second on 56. See "SCORES
// is inert" in CLAUDE.md. Sorting either list by score would sort nothing.

// The import attribute is not decoration: without it Node refuses the import
// outright (ERR_IMPORT_ATTRIBUTE_MISSING), and this module has to load under
// plain Node as well as Vite, because that is what puts it under test.
import sweep28 from './data/sweep-28.json' with { type: 'json' };
import sweepCrossed from './data/sweep-crossed.json' with { type: 'json' };

/** The 28-cube sweep: the question, the run, and every distinct layout it found. */
export const SWEEP_28 = sweep28;

/** A uniform sample of the crossed sweep: 35 cubes over 36 steps, so the train drives over one cube twice. */
export const SWEEP_CROSSED = sweepCrossed;

/** Every sweep the site carries, for anything that wants to iterate rather than name one. */
export const SWEEPS = [SWEEP_28, SWEEP_CROSSED];

/** Just the shape strings, in the file's order — sorted, so it is stable. */
export const SHAPES_28 = sweep28.shapes.map(s => s.shape);
export const SHAPES_CROSSED = sweepCrossed.shapes.map(s => s.shape);

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
