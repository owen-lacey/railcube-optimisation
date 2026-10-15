// The live readings (site/src/lib/score.js): a closed track reads what its chain
// gives, and a track still being built is read as open.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAYOUTS, routeOf } from '../src/layouts.js';
import { chainOpen, chainTrack } from '../src/track.js';
import { closeCallsOf, metricsOf, posesOf, spanOf } from '../src/metrics.js';
import { liveReadingsOf } from '../site/src/lib/score.js';

test('no pieces, no readings', () => {
  assert.equal(liveReadingsOf([], false), null);
});

for (const [name, { shape, knot }] of Object.entries(LAYOUTS)) {
  test(`${name}, closed, reads as its chain`, () => {
    const placed = chainTrack(routeOf(shape));
    assert.deepEqual(liveReadingsOf(placed, true), {
      knotted: Number(knot !== 'unknot'),
      poses: posesOf(placed),
      closeCalls: closeCallsOf(placed),
      repeats: metricsOf(placed).repeats,
      longestSide: Math.max(...spanOf(placed)),
    });
  });
}

// Four straights: one orientation, a longest side of four, two steps starting
// three of a kind, nothing to come close to, and no knot while open.
test('an open run of straights reads by hand', () => {
  const { placed, closed } = chainOpen(routeOf('SSSS'));
  assert.equal(closed, false);
  assert.deepEqual(liveReadingsOf(placed, closed),
    { knotted: 0, poses: 1, closeCalls: 0, repeats: 2, longestSide: 4 });
});

// Owen's knotted track: never knotted while it is being built, knotted on the
// piece that closes it.
test('a track is knotted only once it closes', () => {
  const shape = 'SRISOIRSIRXILSIIOSLISSOSSLSLSSOSXRSI';
  const knotted = Array.from({ length: shape.length }, (_, n) => {
    const { placed, closed } = chainOpen(routeOf(shape.slice(0, n + 1)));
    return liveReadingsOf(placed, closed).knotted;
  });
  assert.deepEqual(knotted, [...Array(shape.length - 1).fill(0), 1]);
});
