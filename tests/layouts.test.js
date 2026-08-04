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

import { LAYOUTS, routeOf, shapeOf, identify } from '../src/layouts.js';
import { chainTrack, countPieces, POOLS, POOL_OF } from '../src/track.js';

const entries = Object.entries(LAYOUTS);

test('there are layouts to check', () => {
  assert.ok(entries.length > 0);
});

for (const [name, layout] of entries) {
  test(`${name} is a legal closed track`, () => {
    const placed = chainTrack(routeOf(layout.shape));
    assert.equal(shapeOf(placed.map(p => p.type)), layout.shape, 'round-trips through the letters');
  });

  // The one that would have caught the bug. The inventory is carried by the entry
  // itself now, so there is no name to resolve and no map to fall out of date.
  test(`${name} can be built from the set it was solved against`, () => {
    const spent = countPieces(chainTrack(routeOf(layout.shape)));
    for (const pool of POOLS) {
      assert.ok(spent[pool] <= layout.set[pool],
        `${name} needs ${spent[pool]} ${pool} but its set holds ${layout.set[pool]}`);
    }
  });

  // An inventory that omits a pool it happens not to use — `cross: 0` left off,
  // say — passes every check above, because the route never asks about that pool.
  // It would then quietly permit a crossing the next time the shape changed.
  test(`${name} says which inventory it was solved against, in full`, () => {
    for (const pool of POOLS) {
      assert.equal(typeof layout.set[pool], 'number', `${name} has no ${pool} count`);
    }
  });

  // Piece IDs are what lets one layout be rearranged into another: `2L` in this
  // shape has to be the same cube as `2L` in the next one. So an ID has to name
  // exactly one cube, and the set of IDs has to be the inventory restated.
  test(`${name} names each of its cubes exactly once`, () => {
    const placed = chainTrack(routeOf(layout.shape));
    const ids = identify(placed);
    assert.equal(new Set(ids).size, ids.length, `${name} reuses an ID: ${ids}`);
    assert.equal(ids.length, placed.filter(p => !p.revisit).length, 'one ID per cube');

    // The IDs are the inventory written out, so counting the letters back has to
    // give what countPieces gives — which is what makes matching by ID the same
    // thing as matching cube for cube.
    const spent = countPieces(placed);
    for (const pool of POOLS) {
      const letter = shapeOf([pool]);
      const named = ids.filter(id => id.endsWith(letter));
      assert.equal(named.length, spent[pool], `${name} has ${named.length} ${pool} IDs`);
      assert.deepEqual(named.map(id => Number(id.slice(0, -1))).sort((a, b) => a - b),
        Array.from({ length: spent[pool] }, (_, i) => i + 1),
        `${name}'s ${pool} IDs are not 1..n`);
    }
    assert.equal(Object.keys(POOL_OF).length, POOLS.length, 'a pool holds more than one type');
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
