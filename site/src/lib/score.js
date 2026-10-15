// A track's weighted score as far as it has been built: the five readings the
// crossed sweep is weighed by (`weighting.js`), at equal weights, over the
// sweep's ranges.
//
// An open track is read as open: repeats and close calls count only neighbours it
// has, with no last → first, and it is not knotted, since an open curve has no
// knot. The piece that closes it brings in the wrap and the knot at once, so the
// score can jump there. A short track sits outside the sweep's ranges — shorter
// than any swept layout, fewer orientations — and is scored outside 0–1 on those
// metrics rather than clamped.

import { closeCallsOf, posesOf, repeatsOf, spanOf } from '../../../src/metrics.js';
import { readKnot } from './knots.js';
import { SWEEP_CROSSED_WEIGHTS } from './sweeps.js';
import { DIRECTIONS, weigher } from './weighting.js';

const EQUAL = Object.fromEntries(Object.keys(DIRECTIONS).map(name => [name, 1]));
const { score, scale } = weigher(SWEEP_CROSSED_WEIGHTS.ranges);

/**
 * `{ readings, score }` for the pieces of a track, `closed` or still being built:
 * readings `{ knotted, poses, closeCalls, repeats, longestSide }`, and their
 * equal-weights score. Null for no pieces.
 */
export function weightedScoreOf(placed, closed) {
  if (!placed.length) return null;
  const open = !closed;
  const readings = {
    knotted: closed ? Number(readKnot(placed) !== 'unknot') : 0,
    poses: posesOf(placed),
    closeCalls: closeCallsOf(placed, { open }),
    repeats: repeatsOf(placed, { open }),
    longestSide: Math.max(...spanOf(placed)),
  };
  return { readings, score: score(readings, EQUAL) / scale };
}
