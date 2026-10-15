// A track's five readings as far as it has been built, by the names
// `weighting.js` weighs them under: knotted, orientation count (`poses`), close
// calls, repeats and longest side.
//
// An open track is read as open: repeats and close calls count only neighbours it
// has, with no last → first, and it is not knotted, since an open curve has no
// knot. The piece that closes it brings in the wrap and the knot at once, so the
// readings can jump there.

import { closeCallsOf, posesOf, repeatsOf, spanOf } from '../../../src/metrics.js';
import { readKnot } from './knots.js';

/**
 * `{ knotted, poses, closeCalls, repeats, longestSide }` for the pieces of a
 * track, `closed` or still being built, `knotted` 0 or 1. Null for no pieces.
 */
export function liveReadingsOf(placed, closed) {
  if (!placed.length) return null;
  const open = !closed;
  return {
    knotted: closed ? Number(readKnot(placed) !== 'unknot') : 0,
    poses: posesOf(placed),
    closeCalls: closeCallsOf(placed, { open }),
    repeats: repeatsOf(placed, { open }),
    longestSide: Math.max(...spanOf(placed)),
  };
}
