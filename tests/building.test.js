// What a builder counts against its inventory, and which pieces that runs out.

import test from 'node:test';
import assert from 'node:assert/strict';
import { usedOf, spentOut, seed } from '../site/src/lib/building.js';

test('nothing is used before anything is built', () => {
  assert.deepEqual(usedOf(''), {});
});

test('a crossed cross is one cube, however many times the train goes over it', () => {
  assert.deepEqual(usedOf('XSLLLSX'), { cross: 1, straight: 2, leftCurve: 3 });
});

test('a piece with nowhere to go is not down, so it is not used', () => {
  const stuck = seed('LLLLL');
  assert.equal(stuck, 'LLLLL', 'the fifth left lands on the first');
  assert.deepEqual(usedOf(stuck), { leftCurve: 4 });
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
