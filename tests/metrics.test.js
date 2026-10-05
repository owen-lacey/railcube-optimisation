// The aesthetic readings, checked against tracks small enough to count by hand,
// and against the one symmetry they are all claimed to have.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAYOUTS, routeOf } from '../src/layouts.js';
import { chainTrack } from '../src/track.js';
import { closeCallsOf, metricsOf, posesOf } from '../src/metrics.js';

const of = shape => metricsOf(chainTrack(routeOf(shape)));
const mirrorOf = shape => [...shape].map(l => ({ L: 'R', R: 'L' }[l] ?? l)).join('');

// A flat ring: four left curves, a 4×1×4 footprint, every step starting three of
// a kind (the wrap included), and all four steps riding on top, so on one face,
// never upside down, and the train one cell up throughout.
test('LLLL', () => {
  assert.deepEqual(of('LLLL'), { faces: 1, volume: 16, repeats: 4, faceUp: 4, ceiling: 0, height: 4 });
});

// The same ring stood on its end: floor, wall, ceiling, wall — four faces, and
// only the first step is face up, only the third upside down. The train is one
// up on the floor and the second wall, two on the first wall and the ceiling.
test('IIII', () => {
  assert.deepEqual(of('IIII'), { faces: 4, volume: 16, repeats: 4, faceUp: 1, ceiling: 1, height: 6 });
});

// Face up for the two floor straights and the curve that leaves them; the rest
// is wall and ceiling. The IIII ring lengthened, so the same four faces. Only
// pairs, never three in a row, the wrap included, so no repeats. Three steps on
// the ceiling: the curve that reaches it and the two straights along it. Height
// is three steps at one up, the wall and those three at two, the last wall at one.
test('SSIISSII', () => {
  assert.deepEqual(of('SSIISSII'), { faces: 4, volume: 24, repeats: 0, faceUp: 3, ceiling: 3, height: 12 });
});

// Flat, so every one of its twelve steps is face up, the cross's second pass
// included, and all on one face, at one up. Its runs of three are LLL and RRR.
test('the figure eight', () => {
  assert.deepEqual(of(LAYOUTS.eight.shape),
    { faces: 1, volume: 49, repeats: 2, faceUp: 12, ceiling: 0, height: 12 });
});

for (const [name, { shape }] of Object.entries(LAYOUTS)) {
  test(`${name} and its mirror read the same on every metric`, () => {
    assert.deepEqual(of(mirrorOf(shape)), of(shape));
  });
}

const readings = shape => {
  const placed = chainTrack(routeOf(shape));
  return { poses: posesOf(placed), closeCalls: closeCallsOf(placed) };
};

// Four steps, four poses: each curve turns the heading, the floor stays down.
// Nothing but the ring itself, so no other piece to come close to.
test('LLLL takes four poses and has no close calls', () => {
  assert.deepEqual(readings('LLLL'), { poses: 4, closeCalls: 0 });
});

// The figure eight's second pass rides over the cross's own cube, and the pieces
// either side of both passes are its neighbours, so the crossing is not a close call.
test('the figure eight takes four poses and has no close calls', () => {
  assert.deepEqual(readings(LAYOUTS.eight.shape), { poses: 4, closeCalls: 0 });
});

// Two near misses. Climbing the wall (step 5, at 0,4,2) the train passes the cube
// of the left curve it later rides upside down (step 19); and along the top (step
// 8, at -3,6,2) it passes the cube of the left curve at step 15. Not counted: the
// cell at 1,1,-2, which the train is in at steps 22 and 35 both, beside the cube
// of step 35 — that piece is ridden there, so it is no near miss.
test('owen has two close calls', () => {
  assert.deepEqual(readings(LAYOUTS.owen.shape), { poses: 14, closeCalls: 2 });
});

for (const [name, { shape }] of Object.entries(LAYOUTS)) {
  test(`${name} and its mirror take as many poses and close calls`, () => {
    assert.deepEqual(readings(mirrorOf(shape)), readings(shape));
  });
}
