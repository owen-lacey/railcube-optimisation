// Rung 3: the CP-SAT model, walking skeleton — the transition table and loop
// closure, nothing else. No collisions, no inventory, no objective yet.
//
// Tests talk only to the solveTrack facade. Nothing here names a variable, a
// cell id or a grid bool, so the encoding underneath can be swapped on a
// benchmark result without a single test moving.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrack } from '../src/solver/index.js';
import { transitionTable } from '../src/solver/transitions.js';
import { enumerateLoops } from '../src/enumerate.js';
import { POSES, PIECE_TYPES, startCell, step, chainTrack } from '../src/track.js';
import { STARTER } from './fixtures.js';

const LETTER = {
  leftCurve: 'L', rightCurve: 'R', insideCurve: 'I',
  outsideCurve: 'O', straight: 'S', cross: 'X',
};
const shape = route => route.map(t => LETTER[t]).join('');

// ---- The transition table ------------------------------------------------

// The table is generated from MOVES rather than written out, so the risk is not
// that a row is wrong but that the generator is. chainTrack is the check: it is
// the code the visualisation already trusts.
test('the transition table has one row per pose and piece', () => {
  assert.equal(transitionTable().length, POSES.length * PIECE_TYPES.length);
  assert.equal(transitionTable().length, 144);
});

test('every transition row agrees with chainTrack stepping', () => {
  for (const row of transitionTable()) {
    const head = step([0, 0, 0], POSES[row.pose], PIECE_TYPES[row.type]);
    assert.deepEqual([row.dx, row.dy, row.dz], head.cell,
      `${PIECE_TYPES[row.type]} from ${POSES[row.pose]}`);
    assert.equal(POSES[row.nextPose], head.pose,
      `${PIECE_TYPES[row.type]} from ${POSES[row.pose]}`);
  }
});

// ---- Closure -------------------------------------------------------------

test('the solver finds a closed loop of four pieces', async () => {
  const result = await solveTrack({ steps: 4, box: 6, inventory: STARTER });
  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.route.length, 4);
  // Trusting the solver's own claim that this closes would be circular: chain it.
  assert.doesNotThrow(() => chainTrack(result.route), shape(result.route));
});

test('the solver proves no loop closes in three pieces', async () => {
  const result = await solveTrack({ steps: 3, box: 6, inventory: STARTER });
  assert.equal(result.status, 'INFEASIBLE');
});

// Closure is cell AND pose (coordinates.md:95-100). Two straights return the
// head to... nowhere near the start, but the sharper case is a route that comes
// home to the right cell wearing the wrong pose. If the model only checked the
// cell, some 4-step solution would use one.
test('every solution returns to the start pose, not just the start cell', async () => {
  const all = await solveTrack({ steps: 4, box: 6, inventory: STARTER, allSolutions: true });
  for (const route of all.routes) {
    let head = { cell: startCell('DF'), pose: 'DF' };
    for (const type of route) head = step(head.cell, head.pose, type);
    assert.deepEqual(head.cell, startCell('DF'), shape(route));
    assert.equal(head.pose, 'DF', shape(route));
  }
});

// ---- Agreement with the oracle -------------------------------------------

// The whole point of rung 2. At this rung the solver has no collision rules, so
// it is compared against an oracle run with none either — but the oracle does
// have the ground floor and the box, so the solver must too.
// `steps` is an upper bound, so both searches are asked for loops of *up to* four
// pieces. Nothing closes in fewer than four, so the answer is the same either way
// — but the two sides have to be asking the same question, not agree by luck.
test('all four-piece solutions are exactly the ones the oracle finds', async () => {
  const oracle = enumerateLoops({
    inventory: STARTER, maxPieces: 4, box: 6, minY: 0,
    checkTrain: false, collisions: false, exclude: ['cross'],
  });
  const solved = await solveTrack({
    steps: 4, box: 6, minY: 0, inventory: STARTER, exclude: ['cross'],
    collisions: false, allSolutions: true,
  });
  assert.deepEqual(solved.routes.map(shape).sort(), oracle.map(shape).sort());
});
