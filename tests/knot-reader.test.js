// The knot reading in plain JavaScript (site/src/lib/knots.js), against the same
// controls and tracks tests/knots.test.js holds topoly to. Unlike that file this
// spawns nothing, so it is in the fast tier.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAYOUTS, routeOf } from '../src/layouts.js';
import { chainTrack } from '../src/track.js';
import { alexander, certified, knotType, readKnot } from '../site/src/lib/knots.js';

const around = (n, f) => Array.from({ length: n }, (_, i) => f(2 * Math.PI * i / n));
const trefoil = around(300, t => [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)]);
const figureEight = around(300, t => [(2 + Math.cos(2 * t)) * Math.cos(3 * t), (2 + Math.cos(2 * t)) * Math.sin(3 * t), Math.sin(4 * t)]);
const circle = around(300, t => [Math.cos(t), Math.sin(t), 0]);

/** Snapped to a grid, repeats dropped: axis-aligned, collinear and degenerate, like a rail. */
const gridded = curve => curve.map(p => p.map(v => Math.round(v * 8) * 5))
  .filter((p, i, all) => i === 0 || p.some((v, k) => v !== all[i - 1][k]));

/** Reflected through a plane: the other handedness, which the polynomial cannot tell apart. */
const mirrored = curve => curve.map(([x, y, z]) => [x, y, -z]);

test('the controls read as the knots they are, smooth, on a grid and mirrored', () => {
  const controls = {
    trefoil, figureEight, circle, gridTrefoil: gridded(trefoil), gridFigureEight: gridded(figureEight),
    mirrorTrefoil: mirrored(trefoil),
  };
  const read = Object.fromEntries(Object.entries(controls).map(([name, curve]) => [name, knotType(alexander(curve))]));
  assert.deepEqual(read, {
    trefoil: 'trefoil', figureEight: 'figure-eight', circle: 'unknot',
    gridTrefoil: 'trefoil', gridFigureEight: 'figure-eight', mirrorTrefoil: 'trefoil',
  });
});

// A control has no cross, so only the certificate's crossing count can clear it:
// the circle, never the knots.
test('the certificate clears the circle and never a knot', () => {
  const control = curve => certified(curve, Array(curve.length).fill('-A'));
  assert.equal(control(circle), true);
  for (const curve of [trefoil, figureEight, gridded(trefoil), gridded(figureEight)]) assert.equal(control(curve), false);
});

// Owen's two knotted tracks, row 14772602 (stored as a trefoil, which topoly read
// on one rotation in 42 and the certificate proves wrong), and the track topoly
// hung on.
const tracks = [
  ['SRISOIRSIRXILSIIOSLISSOSSLSLSSOSXRSI', 'trefoil'],
  ['LIISOOLSLXIISSSSISSILRSIORSSRSRXOSSI', 'figure-eight'],
  ['IOSSSXISIRSLISISOISLSIOSLLSXSRSSOIRR', 'unknot'],
  ['XIRSIOOIRISSRSRLSSXIOSSLILSSSLOIISSS', 'unknot'],
];
for (const [shape, knot] of tracks) {
  test(`${shape} reads as ${knot}`, () => {
    assert.equal(readKnot(chainTrack(routeOf(shape))), knot);
  });
}

for (const [name, { shape, knot }] of Object.entries(LAYOUTS)) {
  test(`${name} reads as its stored ${knot}`, () => {
    assert.equal(readKnot(chainTrack(routeOf(shape))), knot);
  });
}
