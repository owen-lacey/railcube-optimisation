// The running weighted score (site/src/lib/score.js): a closed track scores what
// the weighting gives its five readings, and a track still being built is read
// as open.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAYOUTS, routeOf } from '../src/layouts.js';
import { chainOpen, chainTrack } from '../src/track.js';
import { closeCallsOf, metricsOf, posesOf, spanOf } from '../src/metrics.js';
import { weightedScoreOf } from '../site/src/lib/score.js';
import { SWEEP_CROSSED_WEIGHTS as table } from '../site/src/lib/sweeps.js';
import { DIRECTIONS, weigher } from '../site/src/lib/weighting.js';

const EQUAL = Object.fromEntries(Object.keys(DIRECTIONS).map(name => [name, 1]));

test('no pieces, no score', () => {
  assert.equal(weightedScoreOf([], false), null);
});

for (const [name, { shape, knot }] of Object.entries(LAYOUTS)) {
  test(`${name}, closed, scores its readings at equal weights`, () => {
    const placed = chainTrack(routeOf(shape));
    const readings = {
      knotted: Number(knot !== 'unknot'),
      poses: posesOf(placed),
      closeCalls: closeCallsOf(placed),
      repeats: metricsOf(placed).repeats,
      longestSide: Math.max(...spanOf(placed)),
    };
    const { score, scale } = weigher(table.ranges);
    assert.deepEqual(weightedScoreOf(placed, true), { readings, score: score(readings, EQUAL) / scale });
  });
}

// Four straights: one orientation, a longest side of four, two steps starting
// three of a kind, nothing to come close to, and no knot while open.
test('an open run of straights reads by hand', () => {
  const { placed, closed } = chainOpen(routeOf('SSSS'));
  assert.equal(closed, false);
  assert.deepEqual(weightedScoreOf(placed, closed).readings,
    { knotted: 0, poses: 1, closeCalls: 0, repeats: 2, longestSide: 4 });
});

// Owen's knotted track: never knotted while it is being built, knotted on the
// piece that closes it.
test('a track is knotted only once it closes', () => {
  const shape = 'SRISOIRSIRXILSIIOSLISSOSSLSLSSOSXRSI';
  const knotted = Array.from({ length: shape.length }, (_, n) => {
    const { placed, closed } = chainOpen(routeOf(shape.slice(0, n + 1)));
    return weightedScoreOf(placed, closed).readings.knotted;
  });
  assert.deepEqual(knotted, [...Array(shape.length - 1).fill(0), 1]);
});
