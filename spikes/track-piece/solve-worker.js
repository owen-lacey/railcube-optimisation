// The solve, off the page's thread.
//
// This is not an optimisation. `solve()` blocks whichever thread it runs on for the
// entire search — it is one synchronous call into WASM — so on the main thread the
// page would freeze solid while it worked and paint none of the solutions it was
// handed. The callback only becomes visible if the thread it fires on is not the one
// doing the drawing.
//
// The browser gets cpsat-js's portable build, which is single-worker, and that is
// what makes the solutions live: only a one-worker search runs on the thread that
// called it, and only that thread can enter JS while the search is going.
//
// No objective. `enumerateAllSolutions` (report every solution of one search) cannot
// be capped by count — cpsat-js's onSolution return value is ignored and nothing can
// stop that search early, only maxTimeInSeconds bounds it. `allSolutions` (re-solve
// with a no-good cut per round) can: `maxSolutions` below stops it exactly there. Each
// round is a fresh feasibility search, no better guided than the last, which is why
// the inventory matters more than any solver setting: measured on the browser's build,
// the model's own 18-cube set (2 straights + 4 of each curve) took 16-70s *per*
// solution, while dropping the two straights — 16 cubes, 4 of each curve, nothing
// else — took 2-3s per round instead. `fill` still spends the whole inventory every
// round, so every layout below uses all 16 cubes; leaving it off was measured to be
// both slower (CP-SAT reaches for the cheapest feasible ring first) and less
// interesting to watch (a crawl from a 4-piece ring up, rather than a stream of
// distinct full layouts).

import { solveTrack } from '../../src/solver/index.js';
import { shapeOf } from '../../src/layouts.js';

const INVENTORY = { straight: 0, leftCurve: 4, rightCurve: 4, insideCurve: 4, outsideCurve: 4, cross: 0 };
const STEPS = Object.values(INVENTORY).reduce((a, b) => a + b, 0);

// Easily changed: how many distinct layouts the stream shows before stopping.
// Measured on the browser's build: a fresh layout roughly every 2-3s, ~2 minutes total.
const MAX_SOLUTIONS = 50;

self.onmessage = async ({ data: { maxTimeInSeconds } }) => {
  try {
    const result = await solveTrack({
      steps: STEPS, box: 6, minY: 0, exclude: ['cross'], inventory: INVENTORY,
      fill: true, allSolutions: true, maxSolutions: MAX_SOLUTIONS, maxTimeInSeconds,
      // The shape crosses the boundary, not the chained pieces. The page chains it
      // again itself, so there is one place that turns a route into geometry and no
      // way for a drawn layout to disagree with the route it came from. It also means
      // an illegal solution throws on both sides rather than being posted onward.
      onSolution: ({ index, live, seconds, score, route }) => self.postMessage({
        type: 'solution', index, live, seconds, score, total: MAX_SOLUTIONS, shape: shapeOf(route),
      }),
    });
    self.postMessage({
      type: 'done', status: result.status,
      count: result.routes.length, truncated: result.truncated, total: MAX_SOLUTIONS,
    });
  } catch (error) {
    // Including a chainTrack throw from a solution: an illegal layout is a bug in
    // the model, and the page should say so rather than quietly stop redrawing.
    self.postMessage({ type: 'error', message: error.message });
  }
};
