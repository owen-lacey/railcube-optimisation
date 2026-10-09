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

import { LAYOUTS, routeOf, shapeOf, identify, trackKey } from '../src/layouts.js';
import { chainOpen, chainTrack, countPieces, POOLS, POOL_OF } from '../src/track.js';
import { knotInput, knotOf, knotReader } from '../scripts/knot-curves.js';

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

// `trackKey` says when two shape strings are one physical track. What it has to
// get right, in both directions: every reading of a loop agrees, and nothing that
// is a different build does.
const mirrorOf = shape => [...shape].map(l => ({ L: 'R', R: 'L' }[l] ?? l)).join('');

test('a track is the same track entered at any piece', () => {
  // A shift of the route starts the same loop at another cube, which lands the
  // whole track somewhere else in space and turned — the key must not notice.
  for (const [name, { shape }] of entries) {
    const key = trackKey(shape);
    for (let i = 1; i < shape.length; i += 1) {
      assert.equal(trackKey(shape.slice(i) + shape.slice(0, i)), key, `${name} shifted by ${i}`);
    }
  }
});

test('different layouts are different tracks', () => {
  const keys = entries.map(([, { shape }]) => trackKey(shape));
  assert.equal(new Set(keys).size, keys.length);
});

test('a mirror is a different track, unless the track is its own mirror', () => {
  // A reflection is not a rotation, so it keeps a key of its own — except for a
  // track that is symmetric under reflection, where the mirror *is* the track
  // turned round. The figure eight is one; the rest are not.
  for (const [name, { shape }] of entries) {
    const same = trackKey(mirrorOf(shape)) === trackKey(shape);
    assert.equal(same, name === 'eight', `${name}'s mirror`);
  }
});

test('driving a track backwards is not a way of reading it', () => {
  // Reversed, every piece is entered through its male end. No relabelling of the
  // letters reproduces the same build, so the key keeps a piece's heading and a
  // reversal is not a duplicate of anything.
  const { shape } = LAYOUTS.set;
  const reversed = [...shape].reverse().join('');
  for (const swap of [{}, { L: 'R', R: 'L' }, { I: 'O', O: 'I' }, { L: 'R', R: 'L', I: 'O', O: 'I' }]) {
    const relabelled = [...reversed].map(l => swap[l] ?? l).join('');
    const { closed, faults } = chainOpen(routeOf(relabelled));
    if (!closed || faults.length) continue;   // not a legal track, so not this one
    assert.notEqual(trackKey(relabelled), trackKey(shape), `reversed with ${JSON.stringify(swap)}`);
  }
});

// Every entry's knot, read as a sweep's rows are read on the way in. This spawns
// `uv`. Every entry so far is an unknot, so on its own this would pass a reader
// that always answered unknot; the knotted controls are in tests/knots.test.js.
test('every layout is the knot it says it is', async () => {
  const reader = knotReader();
  try {
    const polys = await reader.read(entries.map(([, layout], id) => ({
      id, seed: id, ...knotInput(chainTrack(routeOf(layout.shape))),
    })));
    entries.forEach(([name, layout], i) => {
      assert.equal(knotOf(polys[i].over, polys[i].under), layout.knot, name);
    });
  } finally {
    await reader.close();
  }
});
