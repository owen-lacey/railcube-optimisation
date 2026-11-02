// A crossed layout's five readings, by the names `weighting.js` weighs them under:
// knotted, orientation count (`poses`), close calls, repeats and longest side.
// All but the knot are read off the chained track; the knot is looked up in the
// data files, since reading one takes topoly, unless it is handed over. The shape goes back through
// `chainTrack`, so an illegal one throws rather than reading as numbers.

import { chainTrack } from '../../../src/track.js';
import { routeOf } from '../../../src/layouts.js';
import { closeCallsOf, metricsOf, posesOf, spanOf } from '../../../src/metrics.js';
import { knotOf } from './sweeps.js';

/**
 * `{ knotted, poses, closeCalls, repeats, longestSide, knot }`, `knotted` 0 or 1.
 * `knot` is the shape's stored knot, for a file the lookup does not carry.
 */
export function readingsOf(shape, knot = knotOf(shape)) {
  const placed = chainTrack(routeOf(shape));
  return {
    knotted: Number(knot !== 'unknot'),
    poses: posesOf(placed),
    closeCalls: closeCallsOf(placed),
    repeats: metricsOf(placed).repeats,
    longestSide: Math.max(...spanOf(placed)),
    knot,
  };
}
