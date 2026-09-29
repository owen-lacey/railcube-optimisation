// The swept layouts the site carries, re-derived from scratch.
//
// Same rule as tests/layouts.test.js, and the same reason: a shape that came out
// of a solver is a claim. These came out of a solver that is not the model —
// native OR-Tools via scripts/explore.py — and then through a merge script. So
// nothing here trusts the JSON. Every shape is chained, counted against the
// inventory the file says it was solved against, and its recorded span and
// crossing count recomputed.
//
// It is every layout in each file rather than a sample of them. Chaining all
// 2,042 takes well under a second, which is nothing beside the rest of the fast
// tier, and a sample would leave most of a checked-in data file unexamined.
//
// The checks are written once and run over every sweep the site carries. The
// crossed file is itself a sample of the gitignored sweeps.db, which a fresh
// clone does not have: what is checked here is the thousand it carries, and the
// database as a whole is `merge-sweeps.js --check`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chainTrack, countPieces, POOLS, SCORES } from '../src/track.js';
import { loopsOf, routeOf, shapeOf, trackKey } from '../src/layouts.js';
import {
  SWEEPS, SWEEP_28, SWEEP_CROSSED, SHAPES_28, SHAPES_CROSSED, sample, volumeOf,
} from '../site/src/lib/sweeps.js';

const spanOf = placed => {
  const cells = placed.flatMap(p => p.material);
  return [0, 1, 2].map(a =>
    Math.max(...cells.map(c => c[a])) - Math.min(...cells.map(c => c[a])) + 1);
};

test('there are sweeps to check', () => {
  assert.ok(SWEEPS.length > 0);
  assert.ok(SWEEPS.every(s => s.shapes.length > 0));
});

for (const sweep of SWEEPS) {
  const { name } = sweep;
  const { question, shapes } = sweep;

  test(`${name} holds the layouts it says it holds`, () => {
    assert.equal(shapes.length, sweep.distinct);
    assert.equal(new Set(shapes.map(s => s.shape)).size, shapes.length, 'a shape appears twice');
    assert.equal(shapes.filter(s => s.mirrored).length, sweep.mirrors);
  });

  test(`${name} states its question in full`, () => {
    // A layout is only meaningful against the inventory it was solved for, and
    // an inventory that omits a pool it did not use would quietly permit that
    // pool the next time something read this file. Same check as layouts.test.js.
    for (const pool of POOLS) {
      assert.equal(typeof (question.inventory[pool] ?? 0), 'number', `no ${pool} count`);
    }
    assert.equal(sweep.cubes, Object.values(question.inventory).reduce((a, b) => a + b, 0),
      'the cube count is not the inventory summed');
  });

  test(`${name} holds each physical track once`, () => {
    // Distinct strings are not distinct tracks: the same loop entered at another
    // piece is another string. scripts/merge-sweeps.js refuses those on the way
    // in; this is the audit that it did, over every row.
    const seen = new Map();
    for (const { shape } of shapes) {
      const key = trackKey(shape);
      assert.ok(!seen.has(key), `${shape} is the same track as ${seen.get(key)}`);
      seen.set(key, shape);
    }
  });

  test(`${name} is all legal closed track`, () => {
    for (const { shape } of shapes) {
      // chainTrack throws unless the route closes on its start pose and nothing
      // collides, so this is the bulk of the check.
      const placed = chainTrack(routeOf(shape));
      assert.equal(shapeOf(placed.map(p => p.type)), shape, `${shape} does not round-trip`);
    }
  });

  test(`${name} spends its inventory exactly`, () => {
    // Sweeps are full-spend, so these are equalities. A layout spending
    // fewer cubes would still chain, and would still be an answer to a different
    // question than the one at the top of the file.
    for (const { shape } of shapes) {
      const spent = countPieces(chainTrack(routeOf(shape)));
      for (const pool of POOLS) {
        assert.equal(spent[pool], question.inventory[pool] ?? 0,
          `${shape} spends ${spent[pool]} ${pool}`);
      }
    }
  });

  test(`${name} records each layout's real size and crossings`, () => {
    for (const { shape, span, revisits } of shapes) {
      const placed = chainTrack(routeOf(shape));
      const cubes = placed.filter(p => !p.revisit).length;
      assert.equal(cubes, sweep.cubes, `${shape} is not ${sweep.cubes} cubes`);
      assert.deepEqual(spanOf(placed), span, `${shape} spans ${spanOf(placed)}`);
      // A crossing spends a step without spending a cube, so this is also the
      // check that a sweep asking for a crossing actually got one.
      assert.equal(placed.length - cubes, revisits, `${shape} crosses itself ${revisits} times`);
    }
  });

  test(`${name} fits the box it was solved in`, () => {
    // `box` is the solver's own constraint — no material cell further than this
    // from the origin on any axis. The site's fixed camera frame is sized against
    // it, so a layout breaking it would be silently cropped.
    for (const { shape } of shapes) {
      const cells = chainTrack(routeOf(shape)).flatMap(p => p.material);
      const reach = Math.max(...cells.flatMap(c => c.map(Math.abs)));
      assert.ok(reach <= question.box, `${shape} reaches ${reach}, past a box of ${question.box}`);
      if (question.minY === 0) {
        assert.ok(cells.every(c => c[1] >= 0), `${shape} goes below the floor`);
      }
    }
  });

  test(`${name} scores the same throughout, which is why the score is stored once`, () => {
    // Full spend means every layout holds the same cubes, so the objective — a
    // sum over the cubes placed — cannot tell them apart. If this ever fails,
    // the score has become a property of the arrangement and belongs per shape.
    const scored = Object.entries(question.inventory)
      .reduce((total, [type, n]) => total + (SCORES[type] ?? 0) * n, 0);
    assert.equal(scored, sweep.score);
  });

  test(`${name} gives a stable, distinct, spread sample`, () => {
    const twelve = sample(12, 0, shapes);
    assert.equal(twelve.length, 12);
    assert.equal(new Set(twelve.map(s => s.shape)).size, 12, 'the sample repeats a layout');
    assert.deepEqual(sample(12, 0, shapes), twelve, 'the same seed gives a different sample');
    assert.notDeepEqual(sample(12, 7, shapes), twelve, 'a different seed gives the same sample');

    // The point of striding rather than slicing: alphabetical neighbours all
    // start with the same letters, so a slice of twelve would look like one
    // layout twelve times.
    assert.ok(new Set(twelve.map(s => s.shape[0])).size > 1, 'the sample is one alphabetical run');
  });
}

test('no 28-cube layout crosses, and none holds a cross', () => {
  assert.ok(SWEEP_28.shapes.every(s => s.revisits === 0));
  assert.ok(SHAPES_28.every(s => !s.includes('X')));
});

test('every crossed layout crosses itself exactly once', () => {
  // A 36-step route over 35 cubes has one step that spends no cube; the checks
  // above count each layout's own, this checks the file holds no uncrossed one.
  assert.ok(SWEEP_CROSSED.shapes.every(s => s.revisits === 1));
  assert.ok(SHAPES_CROSSED.every(s => s.includes('X')));
});

test('every crossed layout records the two loops its crossing makes', () => {
  for (const { shape, loops } of SWEEP_CROSSED.shapes) {
    assert.deepEqual(loopsOf(chainTrack(routeOf(shape))), loops, `${shape} loops`);
  }
});

test('the crossed file is a sample of a bigger population', () => {
  assert.ok(SWEEP_CROSSED.population > SWEEP_CROSSED.distinct);
});

test('a sample cannot ask for more layouts than there are', () => {
  assert.throws(() => sample(SWEEP_28.shapes.length + 1, 0, SWEEP_28.shapes), /only 1042 layouts/);
});

test('volumeOf multiplies the span out', () => {
  assert.equal(volumeOf({ span: [9, 6, 8] }), 432);
});
