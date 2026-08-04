// The swept layouts the site carries, re-derived from scratch.
//
// Same rule as tests/layouts.test.js, and the same reason: a shape that came out
// of a solver is a claim. These came out of a *second* solver — native OR-Tools,
// via scripts/explore.py — and then through an extract script, and neither is
// the model. So nothing here trusts the JSON. Every shape is chained, counted
// against the inventory the file says it was solved against, and its recorded
// span recomputed.
//
// It is the whole file rather than a sample. Chaining all 1,042 takes about
// 150 ms, which is nothing beside the rest of the fast tier, and a sample would
// leave most of a checked-in data file unexamined.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chainTrack, countPieces, POOLS, SCORES } from '../src/track.js';
import { routeOf, shapeOf } from '../src/layouts.js';
import { SWEEP_28, SHAPES_28, sample, volumeOf } from '../site/src/lib/sweeps.js';

const { question, shapes } = SWEEP_28;

const spanOf = placed => {
  const cells = placed.flatMap(p => p.material);
  return [0, 1, 2].map(a =>
    Math.max(...cells.map(c => c[a])) - Math.min(...cells.map(c => c[a])) + 1);
};

test('the file holds the layouts it says it holds', () => {
  assert.equal(shapes.length, SWEEP_28.distinct);
  assert.equal(new Set(SHAPES_28).size, shapes.length, 'a shape appears twice');
  assert.ok(SWEEP_28.solved <= SWEEP_28.rounds);
  assert.ok(SWEEP_28.distinct <= SWEEP_28.solved);
});

test('the question is stated in full', () => {
  // A layout is only meaningful against the inventory it was solved for, and an
  // inventory that omits a pool it did not use would quietly permit that pool
  // the next time something read this file. Same check as layouts.test.js.
  for (const pool of POOLS) {
    assert.equal(typeof (question.inventory[pool] ?? 0), 'number', `no ${pool} count`);
  }
  assert.equal(question.inventory.cross ?? 0, 0, 'the sweep excluded the cross');
  assert.equal(SWEEP_28.cubes, Object.values(question.inventory).reduce((a, b) => a + b, 0));
});

test('every layout is a legal closed track', () => {
  for (const { shape } of shapes) {
    // chainTrack throws unless the route closes on its start pose and nothing
    // collides, so this is the bulk of the check.
    const placed = chainTrack(routeOf(shape));
    assert.equal(shapeOf(placed.map(p => p.type)), shape, `${shape} does not round-trip`);
  }
});

test('every layout spends the inventory exactly', () => {
  // The sweep's only mode is full spend, so these are equalities. A layout
  // spending fewer cubes would still chain, and would still be an answer to a
  // different question than the one at the top of the file.
  for (const { shape } of shapes) {
    const spent = countPieces(chainTrack(routeOf(shape)));
    for (const pool of POOLS) {
      assert.equal(spent[pool], question.inventory[pool] ?? 0,
        `${shape} spends ${spent[pool]} ${pool}`);
    }
  }
});

test('every layout is 28 cubes and the recorded span is its real one', () => {
  for (const { shape, span } of shapes) {
    const placed = chainTrack(routeOf(shape));
    assert.equal(placed.filter(p => !p.revisit).length, SWEEP_28.cubes, `${shape} is not 28 cubes`);
    assert.deepEqual(spanOf(placed), span, `${shape} spans ${spanOf(placed)}`);
  }
});

test('every layout fits the box it was solved in', () => {
  // `box` is the solver's own constraint — no material cell further than this
  // from the origin on any axis — and it is what the site's fixed camera frame
  // is sized against, so a layout breaking it would be silently cropped.
  for (const { shape } of shapes) {
    const cells = chainTrack(routeOf(shape)).flatMap(p => p.material);
    const reach = Math.max(...cells.flatMap(c => c.map(Math.abs)));
    assert.ok(reach <= question.box, `${shape} reaches ${reach}, past the box of ${question.box}`);
    if (question.minY === 0) {
      assert.ok(cells.every(c => c[1] >= 0), `${shape} goes below the floor`);
    }
  }
});

test('the score is the same for all of them, which is why it is stored once', () => {
  // Full spend means every layout holds the same 28 cubes, so the objective —
  // a sum over the cubes placed — cannot tell them apart. If this ever fails,
  // the score has become a property of the arrangement and belongs per shape.
  const scored = Object.entries(question.inventory)
    .reduce((total, [type, n]) => total + (SCORES[type] ?? 0) * n, 0);
  assert.equal(scored, SWEEP_28.score);
});

test('a sample is stable, distinct, and spread across the file', () => {
  const twelve = sample(12);
  assert.equal(twelve.length, 12);
  assert.equal(new Set(twelve.map(s => s.shape)).size, 12, 'the sample repeats a layout');
  assert.deepEqual(sample(12), twelve, 'the same seed gives a different sample');
  assert.notDeepEqual(sample(12, 7), twelve, 'a different seed gives the same sample');

  // The point of striding rather than slicing: alphabetical neighbours all
  // start with the same letters, so a slice of twelve would look like one
  // layout twelve times.
  assert.ok(new Set(twelve.map(s => s.shape[0])).size > 1, 'the sample is one alphabetical run');
});

test('a sample cannot ask for more layouts than there are', () => {
  assert.throws(() => sample(shapes.length + 1), /only 1042 layouts/);
});

test('volumeOf multiplies the span out', () => {
  assert.equal(volumeOf({ span: [9, 6, 8] }), 432);
});
