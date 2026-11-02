// A uniform sample of the crossed sweep: 35 cubes over 36 steps in a box of 8,
// crossing itself once. The sweep itself is millions of layouts in the gitignored
// `sweeps.db`, far more than a page can import whole, so `scripts/sample-sweep.js`
// draws a thousand uniformly from it, re-derives each through the model, and
// writes them to `data/sweep-crossed.json`. Uniform means it is skewed the way the
// database is, to big loops: a crossing whose smaller loop is 6 or 8 cubes is all
// but absent. `population` is how many it was drawn from. `tests/sweeps.test.js`
// re-chains every shape in it.
//
// Every layout in it spends the inventory in full, so they all hold the same cubes
// and tie on the objective, 56. That is the finding rather than a flaw: see
// "SCORES is inert" in CLAUDE.md.
//
// One module per data file, here and beside it, so a page pulls in only the data
// it shows. The import attribute is not decoration: without it Node refuses the
// import outright (ERR_IMPORT_ATTRIBUTE_MISSING), and these modules load under
// plain Node as well as Vite, because that is what puts them under test.
import sweepCrossed from '../data/sweep-crossed.json' with { type: 'json' };

/** A uniform sample of the crossed sweep: 35 cubes over 36 steps, so the train drives over one cube twice. */
export const SWEEP_CROSSED = sweepCrossed;
