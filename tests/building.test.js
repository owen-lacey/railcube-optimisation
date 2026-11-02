// What a builder counts against its inventory, and which pieces that runs out.

import test from 'node:test';
import assert from 'node:assert/strict';
import { usedOf, spentOut, seed, keyAction } from '../site/src/lib/building.js';

const NONE = { straight: 0, cross: 0, leftCurve: 0, rightCurve: 0, insideCurve: 0, outsideCurve: 0 };

test('nothing is used before anything is built', () => {
  assert.deepEqual(usedOf(''), NONE);
});

test('a crossed cross is one cube, however many times the train goes over it', () => {
  assert.deepEqual(usedOf('XSLLLSX'), { ...NONE, cross: 1, straight: 2, leftCurve: 3 });
});

test('a piece with nowhere to go is not down, so it is not used', () => {
  const stuck = seed('LLLLL');
  assert.equal(stuck, 'LLLLL', 'the fifth left lands on the first');
  assert.deepEqual(usedOf(stuck), { ...NONE, leftCurve: 4 });
});

test('a piece runs out exactly when its count reaches the inventory', () => {
  const inventory = { straight: 2, leftCurve: 4, rightCurve: 4, insideCurve: 1, outsideCurve: 1, cross: 1 };
  assert.ok(!spentOut('LLL', inventory).has('L'));
  assert.ok(spentOut('LLLL', inventory).has('L'));
  assert.ok(!spentOut('LLLL', inventory).has('S'));
});

test('a piece the inventory lacks is out from the start', () => {
  assert.deepEqual([...spentOut('', { straight: 1 })].sort(), ['I', 'L', 'O', 'R', 'X']);
});

test('the letters are a builder\'s wherever focus is; the arrows and Backspace only with focus in it', () => {
  const key = (k, more = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...more });
  for (const focused of [true, false]) {
    assert.deepEqual(keyAction(key('l'), focused), { add: 'L' });
    assert.deepEqual(keyAction(key('X'), focused), { add: 'X' });
  }
  assert.deepEqual(keyAction(key('ArrowUp'), true), { add: 'S' });
  assert.deepEqual(keyAction(key('ArrowLeft'), true), { add: 'L' });
  assert.deepEqual(keyAction(key('Backspace'), true), { remove: true });
  for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Backspace']) {
    assert.equal(keyAction(key(k), false), null, `${k} without focus`);
  }
  assert.equal(keyAction(key('ArrowDown'), true), null, 'there is no piece behind');
  assert.equal(keyAction(key('s', { metaKey: true }), true), null, 'a modified key is not the builder\'s');
});
