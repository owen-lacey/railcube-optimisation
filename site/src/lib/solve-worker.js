// The live enumeration, off the main thread.
//
// It has to be a worker: solve() blocks whichever thread it is on for the whole
// search, and the browser build is always single-worker, so the calling thread
// is the solving thread.
//
// `allSolutions` + `maxSolutions` rather than `enumerateAllSolutions`: the
// latter is one solve streaming every solution live, and cpsat-js ignores
// onSolution's return value, so nothing can stop it by count — only by a
// deadline. This one re-solves with a no-good cut per round from plain JS, so
// it can stop at an exact number, and `stop` below can end it at a round
// boundary.

import { solveTrack } from '../../../src/solver/index.js';
import { shapeOf } from '../../../src/layouts.js';

// Sixteen cubes: four of every curve, no straights. Deliberately not the
// model's own 18-cube SET — dropping in the two straights turns "find one more
// way to spend the inventory" back into a search almost as hard as finding the
// optimum, and measured at 16-70 s per layout instead of 2-3 s. Four of one
// handedness is the geometric floor a loop can close at, so this is as small as
// a curves-only set gets. Easy to change if the pace is wrong.
const INVENTORY = { straight: 0, leftCurve: 4, rightCurve: 4, insideCurve: 4, outsideCurve: 4, cross: 0 };
const STEPS = Object.values(INVENTORY).reduce((a, b) => a + b, 0);
const MAX_SOLUTIONS = 50;

// Set by a `stop` message. The enumeration loop cannot be interrupted mid-solve,
// so this is checked when a solution arrives: from then on nothing is posted,
// and the page treats the sweep as finished.
let stopped = false;

self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { stopped = true; return; }
  if (data.type !== 'start') return;

  stopped = false;
  const total = data.maxSolutions ?? MAX_SOLUTIONS;
  try {
    self.postMessage({ type: 'loading' });
    const result = await solveTrack({
      steps: STEPS, box: 6, minY: 0, exclude: ['cross'], inventory: INVENTORY,
      // `fill` forces every solution to spend the whole inventory. Without it
      // CP-SAT reaches for the cheapest satisfying assignment first — a
      // four-piece ring, dropping twelve of sixteen cubes — and grows the loop
      // by a cube or two per cut after that: slower per round AND a worse thing
      // to watch. Every full-inventory loop also ties on score, which is the
      // finding this scene exists to show.
      fill: true, allSolutions: true, maxSolutions: total,
      maxTimeInSeconds: data.maxTimeInSeconds ?? 300,
      onSolution: ({ index, live, seconds, score, route }) => {
        if (stopped) return;
        // Only the shape string crosses the boundary. The page re-chains it, so
        // there is exactly one route-to-geometry path and an illegal layout
        // throws rather than drawing.
        self.postMessage({
          type: 'solution', index, live, seconds, score, total, shape: shapeOf(route),
        });
      },
    });
    self.postMessage({
      type: 'done', status: result.status,
      count: result.routes.length, truncated: result.truncated, total,
      stopped,
    });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
