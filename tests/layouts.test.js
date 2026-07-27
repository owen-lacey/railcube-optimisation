// The layouts the spike draws must be layouts you could actually build.
//
// This file exists because one of them was not. The model pooled the two flat
// curve colours into a single allowance of eight, so the solver spent six right
// curves and two left ones — and the starter set has four of each, which are
// separate mouldings. Every other test passed. It was caught by looking at a
// picture and counting the blue pieces.
//
// So: nothing here trusts the solver, the spike, or the comment next to the
// shape. Each layout is chained from scratch and counted against the set it
// claims.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAYOUTS, routeOf, shapeOf } from '../src/layouts.js';
import { chainTrack, countPieces, POOLS, STARTER, DELUXE } from '../src/track.js';

const SETS = { STARTER, DELUXE };
const entries = Object.entries(LAYOUTS);

test('there are layouts to check', () => {
  assert.ok(entries.length > 0);
});

for (const [name, layout] of entries) {
  test(`${name} is a legal closed track`, () => {
    const placed = chainTrack(routeOf(layout.shape));
    assert.equal(shapeOf(placed.map(p => p.type)), layout.shape, 'round-trips through the letters');
  });

  // The one that would have caught the bug.
  test(`${name} can be built from the ${layout.set} set`, () => {
    const inventory = SETS[layout.set];
    assert.ok(inventory, `unknown set ${layout.set}`);
    const spent = countPieces(chainTrack(routeOf(layout.shape)));
    for (const pool of POOLS) {
      assert.ok(spent[pool] <= inventory[pool],
        `${name} needs ${spent[pool]} ${pool} but ${layout.set} ships ${inventory[pool]}`);
    }
  });

  test(`${name} fits the box it claims`, () => {
    const cells = chainTrack(routeOf(layout.shape)).flatMap(p => p.material);
    for (const cell of cells) {
      assert.ok(cell.every(v => Math.abs(v) <= layout.box),
        `${name} leaves its ${layout.box}-cell box at ${cell}`);
      assert.ok(cell[1] >= 0, `${name} digs below the ground at ${cell}`);
    }
  });
}

// A layout claiming to be proved optimal is a stronger claim than one that is
// merely the best found in the time allowed, and the difference should be
// recorded rather than blurred.
test('every layout says whether it was proved optimal', () => {
  for (const [name, layout] of entries) {
    assert.equal(typeof layout.proved, 'boolean', `${name} does not say`);
  }
});
