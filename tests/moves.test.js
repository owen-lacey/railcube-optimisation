// What each piece does to the train, as the post words it and draws it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { step } from '../src/track.js';
import { describeMove, trainCell } from '../site/src/lib/catalogue.js';
import { pieceMove } from '../site/src/lib/scenes.js';

// Owen's wording, with his convention of digits and upwards/downwards.
const CAPTIONS = {
  straight: 'Train moves 1 forwards',
  cross: 'Train moves 1 forwards',
  leftCurve: 'Train moves 1 forwards and 2 left, facing left',
  rightCurve: 'Train moves 1 forwards and 2 right, facing right',
  insideCurve: 'Train moves 1 up, facing upwards',
  outsideCurve: 'Train moves 1 forwards and 2 down, facing downwards',
};

test('every piece\'s caption is read off the model in the post\'s words', () => {
  for (const [type, caption] of Object.entries(CAPTIONS)) assert.equal(describeMove(type), caption);
});

test('the ghosts stand on the piece and on the head it hands on', () => {
  for (const type of Object.keys(CAPTIONS)) {
    const [before, after] = pieceMove(type).ghosts;
    assert.deepEqual({ cell: before.cell, pose: before.pose }, { cell: [0, 0, 0], pose: 'UF' });
    assert.deepEqual({ cell: after.cell, pose: after.pose }, step([0, 0, 0], 'UF', type));
    assert.deepEqual([before.tint, after.tint], ['before', 'after']);
    // Before rides the piece itself; after, the straight that would click in next.
    assert.deepEqual([before.type, after.type], [type, 'straight']);
  }
});

test('the lattice holds the piece and both ghosts\' train cells', () => {
  for (const type of Object.keys(CAPTIONS)) {
    const { pieces, ghosts, grid } = pieceMove(type);
    const cells = [...pieces[0].material, ...ghosts.map(trainCell)];
    for (const cell of cells) {
      cell.forEach((v, a) => assert.ok(v >= grid.lo[a] && v <= grid.hi[a], `${type}: ${cell}`));
    }
  }
});
