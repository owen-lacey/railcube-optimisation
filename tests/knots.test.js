// The knot reading: scripts/knot-curves.js's curves, scripts/knots.py's
// polynomials. Positive controls first — curves whose knot is known, smooth and
// snapped to a grid the way a track's rail is — then tracks end to end.
//
// This spawns `uv`, which the rest of the suite does not need.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import { LAYOUTS, routeOf } from '../src/layouts.js';
import { chainTrack } from '../src/track.js';
import { curvesOf, knotOf, knotReader, knotType } from '../scripts/knot-curves.js';

const reader = knotReader();
after(() => reader.close());

const polysOf = async curves => (await reader.read([{ id: 1, seed: 1, curves }]))[0];

const around = (n, f) => Array.from({ length: n }, (_, i) => f(2 * Math.PI * i / n));
const trefoil = around(300, t => [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)]);
const figureEight = around(300, t => [(2 + Math.cos(2 * t)) * Math.cos(3 * t), (2 + Math.cos(2 * t)) * Math.sin(3 * t), Math.sin(4 * t)]);
const circle = around(300, t => [Math.cos(t), Math.sin(t), 0]);

/**
 * Snapped to a grid, repeats dropped: axis-aligned, collinear and degenerate, like
 * a rail. An eighth of a unit: at a quarter the figure-eight gave ErrTMC on all
 * four rotations tried, which says nothing about the reading but fails the test.
 */
const gridded = curve => curve.map(p => p.map(v => Math.round(v * 8) * 5))
  .filter((p, i, all) => i === 0 || p.some((v, k) => v !== all[i - 1][k]));

test('the controls read as the knots they are, smooth and on a grid', async () => {
  const polys = await polysOf({
    trefoil, figureEight, circle, gridTrefoil: gridded(trefoil), gridFigureEight: gridded(figureEight),
  });
  assert.deepEqual(Object.fromEntries(Object.entries(polys).map(([name, p]) => [name, knotType(p)])), {
    trefoil: 'trefoil', figureEight: 'figure-eight', circle: 'unknot',
    gridTrefoil: 'trefoil', gridFigureEight: 'figure-eight',
  });
});

// Owen's two, from the prototype's scan: each knotted with the second pass over
// the first, and not under it.
const tracks = [
  ['SRISOIRSIRXILSIIOSLISSOSSLSLSSOSXRSI', { over: 'trefoil', under: 'unknot' }],
  ['LIISOOLSLXIISSSSISSILRSIORSSRSRXOSSI', { over: 'figure-eight', under: 'unknot' }],
  [LAYOUTS.crossed.shape, { over: 'unknot', under: 'unknot' }],
];
for (const [shape, expected] of tracks) {
  test(`${shape} reads ${expected.over} over, ${expected.under} under`, async () => {
    const polys = await polysOf(curvesOf(chainTrack(routeOf(shape))));
    assert.deepEqual({ over: knotType(polys.over), under: knotType(polys.under) }, expected);
  });
}

test('a track is knotted if either reading is', () => {
  assert.equal(knotOf('1', '1'), 'unknot');
  assert.equal(knotOf('1 -1 1', '1'), 'trefoil');
  assert.equal(knotOf('1', '1 -3 1'), 'figure-eight');
  assert.equal(knotOf('1 -1 1', '1 -1 1'), 'trefoil');
  assert.equal(knotOf('1', '1 -1 3 -1 1'), 'other:1 -1 3 -1 1');
  assert.throws(() => knotOf('1 -1 1', '1 -3 1'), /trefoil and figure-eight/);
});

test('an uncrossed track reads the same over and under', () => {
  const { over, under } = curvesOf(chainTrack(routeOf(LAYOUTS.set.shape)));
  assert.deepEqual(over, under);
});

// topoly never returns on this track's first rotation over the cross: it is the
// curve one of twelve overnight scans sat on for ten hours. knots.py must give up
// on that rotation and read another. Seeded as the scan seeds it, by row id.
test('a rotation topoly hangs on is abandoned for another', async () => {
  const hung = knotReader({ timeout: 2 });
  const curves = curvesOf(chainTrack(routeOf('XIRSIOOIRISSRSRLSSXIOSSLILSSSLOIISSS')));
  const [polys] = await hung.read([{ id: 8507057, seed: 8507057, curves }]);
  await hung.close();
  assert.equal(knotOf(polys.over, polys.under), 'unknot');
});
