// Rung 6: you only have the pieces in the box. Inventory limits, the bounding
// box, and the ground.
//
// Steps become optional here — a loop shorter than the step count leaves the
// tail switched off — which is the machinery rung 7's objective needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrack } from '../src/solver/index.js';
import { enumerateLoops } from '../src/enumerate.js';
import { chainTrack, countPools, overflowingPool, STARTER, DELUXE } from '../src/track.js';

const LETTER = {
  leftCurve: 'L', rightCurve: 'R', insideCurve: 'I',
  outsideCurve: 'O', straight: 'S', cross: 'X',
};
const shape = route => route.map(t => LETTER[t]).join('');

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

// ---- Inventory -----------------------------------------------------------

// The four-curve ring needs four flat curves. Give the model three and it must
// say no — a control-and-treatment pair, so the refusal cannot be blamed on
// geometry.
test('a loop cannot use more pieces than the set ships', async () => {
  const ring = { steps: 4, box: 6, minY: 0, exclude: ['cross'], require: Array(4).fill('leftCurve') };
  const enough = { straight: 0, leftCurve: 4, rightCurve: 0, insideCurve: 0, outsideCurve: 0, cross: 0 };

  assert.equal((await solveTrack({ ...ring, inventory: enough })).status, 'OPTIMAL');
  assert.equal((await solveTrack({ ...ring, inventory: { ...enough, leftCurve: 3 } })).status,
    'INFEASIBLE');
});

// Counted in plain JavaScript from the returned route, never read off a solver
// variable. This is the same discipline the cross rung will need.
test('every solution fits the inventory it was given', async () => {
  for (const inventory of [STARTER, DELUXE]) {
    const found = await solveTrack({
      steps: 6, box: 6, minY: 0, exclude: ['cross'], inventory, allSolutions: true,
    });
    for (const route of found.routes) {
      assert.equal(overflowingPool(route, inventory), null,
        `${shape(route)} overflows: ${JSON.stringify(countPools(route))}`);
    }
  }
});

// The two colours are separate pools, so one colour's shortfall cannot be covered
// by the other's surplus. LRIIRLII is a real eight-piece loop spending two of
// each: it fits two-and-two, and it must fail when either colour drops to one,
// even with plenty of the other going spare.
test('one curve colour cannot cover for the other', async () => {
  const mixed = {
    steps: 8, box: 6, minY: 0, exclude: ['cross'],
    require: [...'LRIIRLII'].map(l => ({ L: 'leftCurve', R: 'rightCurve', I: 'insideCurve' }[l])),
  };
  const set = (l, r) => ({
    straight: 0, leftCurve: l, rightCurve: r, insideCurve: 4, outsideCurve: 0, cross: 0,
  });

  assert.equal((await solveTrack({ ...mixed, inventory: set(2, 2) })).status, 'OPTIMAL');
  assert.equal((await solveTrack({ ...mixed, inventory: set(1, 8) })).status, 'INFEASIBLE');
  assert.equal((await solveTrack({ ...mixed, inventory: set(8, 1) })).status, 'INFEASIBLE');
});

// ---- Optional steps ------------------------------------------------------

// With more steps than the loop needs, the tail switches off. The prefix has to
// be contiguous, or "which steps are off" becomes an enormous symmetry.
test('a shorter loop can be found in a longer step budget', async () => {
  const result = await solveTrack({
    steps: 10, box: 6, minY: 0, exclude: ['cross'], inventory: STARTER, optionalSteps: true,
  });
  assert.equal(result.status, 'OPTIMAL');
  assert.ok(result.route.length >= 4 && result.route.length <= 10, `got ${result.route.length}`);
  assert.doesNotThrow(() => chainTrack(result.route), shape(result.route));
});

test('an inactive tail claims no cells and no inventory', async () => {
  // Ten steps but only four inside curves available: the loop must be the
  // four-piece ring with six steps switched off, not a longer one.
  const result = await solveTrack({
    steps: 10, box: 6, minY: 0, exclude: ['cross'], optionalSteps: true,
    inventory: { straight: 0, leftCurve: 0, rightCurve: 0, insideCurve: 4, outsideCurve: 0, cross: 0 },
  });
  assert.equal(result.status, 'OPTIMAL');
  assert.deepEqual(shape(result.route), 'IIII');
});

// ---- The box and the floor -----------------------------------------------

test('nothing is ever placed below the ground', async () => {
  const found = await solveTrack({
    steps: 6, box: 6, minY: 0, exclude: ['cross'], inventory: STARTER, allSolutions: true,
  });
  for (const route of found.routes) {
    for (const piece of chainTrack(route)) {
      for (const cell of piece.material) {
        assert.ok(cell[1] >= 0, `${shape(route)} digs to y=${cell[1]}`);
      }
    }
  }
});

// Without the floor, the four-outside-curve ring from rung 2 becomes available.
// This is the test that proves minY is a real constraint and not decoration.
test('lifting the floor admits the ring that digs', async () => {
  const onGround = await solveTrack({
    steps: 4, box: 6, minY: 0, exclude: ['cross'], inventory: STARTER, allSolutions: true,
  });
  const floating = await solveTrack({
    steps: 4, box: 6, minY: null, exclude: ['cross'], inventory: STARTER, allSolutions: true,
  });
  assert.ok(!onGround.routes.map(shape).includes('OOOO'));
  assert.ok(floating.routes.map(shape).includes('OOOO'));
});

test('every solution stays inside the box', async () => {
  const box = 3;
  const found = await solveTrack({
    steps: 6, box, minY: 0, exclude: ['cross'], inventory: STARTER, allSolutions: true,
  });
  for (const route of found.routes) {
    for (const piece of chainTrack(route)) {
      for (const cell of piece.material) {
        assert.ok(cell.every(v => Math.abs(v) <= box), `${shape(route)} leaves the box at ${cell}`);
      }
    }
  }
});

// ---- Agreement with the oracle, now on equal terms -----------------------

// From this rung the two searches finally have the same rules, so they should
// agree exactly — including on the inventory that made them differ at rung 4.
test('solver and oracle agree with every rule switched on', async () => {
  for (const steps of [4, 6]) {
    const oracle = enumerateLoops({
      inventory: STARTER, maxPieces: steps, minPieces: steps, box: 6, minY: 0,
      checkTrain: true, exclude: ['cross'],
    }).map(shape).sort();
    const solved = await solveTrack({
      steps, box: 6, minY: 0, checkTrain: true, exclude: ['cross'],
      inventory: STARTER, allSolutions: true,
    });
    assert.deepEqual(solved.routes.map(shape).sort(), oracle, `${steps} pieces`);
  }
});

slow('solver and oracle agree at eight pieces under the full rules', async () => {
  const oracle = enumerateLoops({
    inventory: STARTER, maxPieces: 8, minPieces: 8, box: 6, minY: 0,
    checkTrain: true, exclude: ['cross'],
  }).map(shape).sort();
  const solved = await solveTrack({
    steps: 8, box: 6, minY: 0, checkTrain: true, exclude: ['cross'],
    inventory: STARTER, allSolutions: true,
  });
  assert.deepEqual(solved.routes.map(shape).sort(), oracle);
});
