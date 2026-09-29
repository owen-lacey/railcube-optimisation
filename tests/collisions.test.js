// Rung 4: material collisions — at most one piece per cell.
//
// The solver is never allowed to grade its own homework here. Every route it
// returns is re-validated by src/track.js, the same code the visualisation
// trusts, and cross-checked against the brute-force oracle.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrack } from '../src/solver/index.js';
import { enumerateLoops } from '../src/enumerate.js';
import { assertNoCollisions, cellsFor, startCell, step, chainTrack } from '../src/track.js';
import { STARTER, UNLIMITED } from './fixtures.js';

const LETTER = {
  leftCurve: 'L', rightCurve: 'R', insideCurve: 'I',
  outsideCurve: 'O', straight: 'S', cross: 'X',
};
const BY_LETTER = Object.fromEntries(Object.entries(LETTER).map(([type, l]) => [l, type]));
const shape = route => route.map(t => LETTER[t]).join('');
const unshape = s => [...s].map(l => BY_LETTER[l]);

// Material collisions only — clearance is rung 5, so blank the train lists out.
// Building this by hand rather than calling chainTrack keeps the check honest
// about which rule is under test.
function assertMaterialOnly(route) {
  let head = { cell: startCell('DF'), pose: 'DF' };
  const placed = route.map(type => {
    const piece = { type, material: cellsFor(type, head.pose, head.cell).material, train: [] };
    head = step(head.cell, head.pose, type);
    return piece;
  });
  assertNoCollisions(placed);
}

// ---- The solver obeys the rule -------------------------------------------

test('no solution puts two pieces in the same cell', async () => {
  for (const steps of [4, 5, 6]) {
    const found = await solveTrack({
      steps, box: 6, minY: 0, inventory: STARTER, exclude: ['cross'], allSolutions: true,
    });
    for (const route of found.routes) {
      assert.doesNotThrow(() => assertMaterialOnly(route), `${steps}: ${shape(route)}`);
    }
  }
});

// ---- Agreement with the oracle -------------------------------------------

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

// This rung is about collisions and nothing else, so both searches get a
// bottomless box of pieces. Handing one of them a real inventory would make them
// answer different questions — and quietly: it bites only from eight pieces up,
// where a loop first wants more than four inside curves.

// Up to n, not exactly n, on both sides: `steps` is an upper bound and the loop
// uses a prefix of it, so a six-step budget legitimately answers with a four-piece
// loop. The oracle has always searched up-to-N; it is `minPieces` that used to
// hide the shorter ones.
const oracleShapes = (n, opts) => enumerateLoops({
  inventory: UNLIMITED, maxPieces: n, box: 6, minY: 0,
  checkTrain: false, exclude: ['cross'], ...opts,
}).map(shape).sort();

const solverShapes = async (n, opts) => (await solveTrack({
  steps: n, box: 6, minY: 0, inventory: UNLIMITED, exclude: ['cross'],
  checkTrain: false, allSolutions: true, ...opts,
})).routes.map(shape).sort();

test('solver and oracle agree on every loop up to six pieces', async () => {
  for (const steps of [4, 5, 6]) {
    assert.deepEqual(await solverShapes(steps), oracleShapes(steps), `${steps} pieces`);
  }
});

// Odd lengths never happen. Not derived from anything — just what both searches
// say — but it is a cheap trap for a model that has quietly stopped enforcing
// closure, since a broken closure check would find plenty.
//
// Said as "nothing odd comes back" rather than "an odd budget comes back empty",
// because a budget is an upper bound: five steps legitimately answers with a
// four-piece loop. Three still comes back empty, and that is worth pinning —
// it is the one budget too small to hold any loop at all.
test('no closed loop has an odd number of pieces', async () => {
  assert.deepEqual(await solverShapes(3), [], 'three steps hold no loop');
  assert.deepEqual(oracleShapes(3), [], 'three steps hold no loop, oracle');

  for (const steps of [5, 7]) {
    const solved = await solverShapes(steps);
    assert.ok(solved.length > 0, `${steps} steps found nothing at all`);
    for (const found of [solved, oracleShapes(steps)]) {
      assert.deepEqual(found.filter(s => s.length % 2), [], `${steps} steps`);
    }
  }
});

// ---- The rule actually costs something -----------------------------------

// A constraint you cannot see working might not be there. Loops only start
// passing through themselves at eight pieces — below that the collision rule is
// free, which is worth knowing in itself: the four-piece agreement tests above
// would pass with the rule missing entirely.
// ~70 s: enumerating 141 solutions means 141 solves, each with one more no-good
// cut than the last.
slow('at eight pieces the collision rule removes loops, and the right ones', async () => {
  const withRule = await solverShapes(8);
  const without = await solverShapes(8, { collisions: false });
  assert.ok(without.length > withRule.length,
    `collisions cost nothing at 8 pieces: ${without.length} either way`);
  assert.deepEqual(without, oracleShapes(8, { collisions: false }));

  // Every loop the rule removes really does overlap itself.
  const removed = without.filter(s => !withRule.includes(s));
  assert.ok(removed.length > 0);
  for (const s of removed) {
    assert.throws(() => assertMaterialOnly(unshape(s)), `${s} was dropped but does not collide`);
  }
});

// ---- Regression: the solver's own claim is not evidence -------------------

// chainTrack enforces closure and both collision rules. At this rung the model
// only knows about material, so a solution may still fail clearance — but it
// must never fail closure or material.
test('every solution is a legal chain under the material rule', async () => {
  const found = await solveTrack({
    steps: 6, box: 6, minY: 0, inventory: STARTER, exclude: ['cross'], allSolutions: true,
  });
  assert.ok(found.routes.length > 0);
  for (const route of found.routes) {
    try {
      chainTrack(route);
    } catch (error) {
      // Clearance failures are expected until rung 5; anything else is a bug.
      assert.match(error.message, /clearance conflict/, `${shape(route)}: ${error.message}`);
    }
  }
});
