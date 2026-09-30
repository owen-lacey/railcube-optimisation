// What each piece does to the train, as the post words it and draws it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { POSES, isValidPose, startCell, step } from '../src/track.js';
import { describeMove, describePose } from '../site/src/lib/catalogue.js';
import { pieceMove, poseCycle, poseGhost } from '../site/src/lib/scenes.js';

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
    assert.deepEqual({ cell: before.cell, pose: before.pose }, { cell: startCell('DF'), pose: 'DF' });
    assert.deepEqual({ cell: after.cell, pose: after.pose }, step(startCell('DF'), 'DF', type));
    assert.deepEqual([before.tint, after.tint], ['before', 'after']);
    // Before rides the piece itself; after, the straight that would click in next.
    assert.deepEqual([before.type, after.type], [type, 'straight']);
  }
});

test('the lattice holds the piece and both ghosts\' train cells', () => {
  for (const type of Object.keys(CAPTIONS)) {
    const { pieces, ghosts, grid } = pieceMove(type);
    const cells = [...pieces[0].material, ...ghosts.map(g => g.cell)];
    for (const cell of cells) {
      cell.forEach((v, a) => assert.ok(v >= grid.lo[a] && v <= grid.hi[a], `${type}: ${cell}`));
    }
  }
});

test('the pose cycle stands the train in one cell in every pose, floor by floor', () => {
  const ghosts = POSES.map(poseGhost);
  const { grid } = poseCycle();
  assert.equal(new Set(ghosts.map(g => g.pose)).size, 24);
  for (const ghost of ghosts) {
    assert.ok(isValidPose(ghost.pose), ghost.pose);
        assert.deepEqual([grid.lo, grid.hi], [ghost.cell, ghost.cell]);
  }
  // Four headings on each floor before moving on to the next.
  assert.deepEqual(POSES.slice(0, 4).map(p => p[0]), ['U', 'U', 'U', 'U']);
});

test('a pose is worded as its face and heading, with its code', () => {
  assert.equal(describePose('DF'), 'down face, heading forwards (DF)');
  assert.equal(describePose('UR'), 'up face, heading right (UR)');
  assert.equal(describePose('BD'), 'back face, heading down (BD)');
  assert.equal(describePose('LU'), 'left face, heading up (LU)');
});
