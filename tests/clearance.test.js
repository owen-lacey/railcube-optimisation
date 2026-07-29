// Rung 5: train clearance. No cell is ever both material and train, but train
// cells may freely coincide with each other — there is only one train
// (coordinates.md:140-183).
//
// This is also where the encoding question gets settled. AllDifferent covers
// material against material and nothing else, so clearance is a separate
// mechanism whatever we do; the benchmark at the bottom is what says whether the
// one we picked is fast enough to keep.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrack } from '../src/solver/index.js';
import { enumerateLoops } from '../src/enumerate.js';
import { chainTrack } from '../src/track.js';
import { STARTER, UNLIMITED } from './fixtures.js';
import { inversionRoute } from '../src/routes.js';

const LETTER = {
  leftCurve: 'L', rightCurve: 'R', insideCurve: 'I',
  outsideCurve: 'O', straight: 'S', cross: 'X',
};
const shape = route => route.map(t => LETTER[t]).join('');

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);


// Up to n on both sides — `steps` is an upper bound and the loop uses a prefix.
const oracleShapes = (n, opts) => enumerateLoops({
  inventory: UNLIMITED, maxPieces: n, box: 6, minY: 0,
  checkTrain: true, exclude: ['cross'], ...opts,
}).map(shape).sort();

const solverShapes = async (n, opts) => (await solveTrack({
  steps: n, box: 6, minY: 0, exclude: ['cross'],
  checkTrain: true, allSolutions: true, ...opts,
})).routes.map(shape).sort();

// ---- The solver obeys the full rule --------------------------------------

// chainTrack enforces closure, material collisions AND clearance. From this rung
// on, every solution must survive it whole — no expected failures left.
// Exhaustive sweeps stop at six here. Enumerating every eight-piece loop by
// no-good cuts costs about 80 seconds, and the DFS oracle does the same job in
// one — CP-SAT is the wrong tool for enumeration, and the slow tier is where
// the eight-piece cross-check lives.
test('every solution is a legal track under both collision rules', async () => {
  for (const steps of [4, 6]) {
    const found = await solveTrack({
      steps, box: 6, minY: 0, exclude: ['cross'], checkTrain: true, allSolutions: true,
    });
    for (const route of found.routes) {
      assert.doesNotThrow(() => chainTrack(route), `${steps}: ${shape(route)}`);
    }
  }
});

test('solver and oracle agree once clearance is on', async () => {
  for (const steps of [4, 6]) {
    assert.deepEqual(await solverShapes(steps), oracleShapes(steps), `${steps} pieces`);
  }
});

// ---- Clearance costs something the material rule does not ----------------

// The two rules must be distinguishable. At eight pieces, material collisions
// alone leave loops that clearance then removes — if these two numbers were
// equal, clearance could be absent and every other test would still pass.
slow('clearance removes loops that the material rule allows', async () => {
  const material = await solverShapes(8, { checkTrain: false });
  const full = await solverShapes(8);
  assert.ok(full.length < material.length,
    `clearance cost nothing at 8 pieces: ${full.length} either way`);
  assert.deepEqual(full, oracleShapes(8));

  // And every loop it removes really does put a cube in the train's way.
  for (const s of material.filter(x => !full.includes(x))) {
    assert.throws(() => chainTrack([...s].map(l =>
      Object.keys(LETTER).find(t => LETTER[t] === l))), /clearance conflict/, s);
  }
});

// coordinates.md:180-183 — two pieces wanting the same train cell is legal, and
// the model must not quietly forbid it. The flat ring is the case: four left
// curves claim the whole 4×4 layer above, and nothing may object.
test('pieces may share train cells', async () => {
  const found = await solverShapes(4);
  assert.ok(found.includes('LLLL'), 'the flat ring should survive clearance');
  assert.ok(found.includes('IIII'));
});

// The scene in the spike is a real 14-piece loop that passes clearance, so the
// model must accept it. Forcing the solver onto exactly this route and getting
// INFEASIBLE would mean the constraints are too strong somewhere.
test('the committed inversion route is feasible for the model', async () => {
  const result = await solveTrack({
    steps: inversionRoute.length, box: 6, minY: 0, checkTrain: true,
    exclude: ['cross'], require: inversionRoute,
  });
  assert.equal(result.status, 'OPTIMAL');
  assert.deepEqual(result.route, inversionRoute);
});

// ---- The measurement -----------------------------------------------------

// Implement the cheaper encoding, measure, and only swap to a boolean occupancy
// grid if the measurement says so. These are wall-clock assertions on purpose:
// the numbers are the decision, and they are deliberately loose, because a
// budget that trips on a slow laptop teaches nothing.
//
// Both of these need the objective, and that is not decoration. The step count is
// an upper bound and the used steps are a prefix, so a solve with nothing to
// maximise answers a 32-step question with a four-piece ring — instantly, and
// while appearing to pass. These two tests did exactly that for a while: they
// claimed to time a twelve- and a thirty-two-piece solve and were timing a
// four-piece one. The objective is what forces the budget to be filled, and the
// length assertions below are what would catch it happening again.
//
// Measured on this machine, with the objective, both collision rules on, no
// symmetry breaking:
//
//   12 steps, starter inventory     2.7s
//   18 steps, SET                  18.4s
//   32 steps, bottomless box       32.2s   (fills all 32, 64 pts)
//
// Symmetry breaking is worth roughly 2.4x on top of that — the same 18-step solve
// runs in 7.8s with it on — so these numbers are the pessimistic end.
const timed = async fn => {
  const started = process.hrtime.bigint();
  const result = await fn();
  return { result, seconds: Number(process.hrtime.bigint() - started) / 1e9 };
};

test('a twelve-piece solve stays quick', async () => {
  const { result, seconds } = await timed(() => solveTrack({
    steps: 12, box: 6, minY: 0, checkTrain: true, exclude: ['cross'],
    inventory: STARTER, objective: 'maximiseScore',
  }));
  assert.equal(result.status, 'OPTIMAL');
  // Twelve pieces, or this is not the solve it claims to be timing.
  assert.equal(result.route.length, 12, `only placed ${result.route.length}`);
  assert.ok(seconds < 20, `12-piece solve took ${seconds.toFixed(1)}s — consider the grid encoding`);
});

slow('a thirty-two-piece solve is still tractable', async () => {
  const { result, seconds } = await timed(() => solveTrack({
    steps: 32, box: 6, minY: 0, checkTrain: true, exclude: ['cross'],
    objective: 'maximiseScore',
  }));
  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.route.length, 32, `only placed ${result.route.length}`);
  assert.ok(seconds < 180, `32-step solve took ${seconds.toFixed(1)}s — the pairwise clearance `
    + 'encoding has stopped scaling; build src/solver/collisions-grid.js');
});
