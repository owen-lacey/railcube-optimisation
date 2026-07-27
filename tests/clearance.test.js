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
import { chainTrack, STARTER } from '../src/track.js';
import { inversionRoute } from '../src/routes.js';

const LETTER = {
  leftCurve: 'L', rightCurve: 'R', insideCurve: 'I',
  outsideCurve: 'O', straight: 'S', cross: 'X',
};
const shape = route => route.map(t => LETTER[t]).join('');

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

const UNLIMITED = { straight: 99, leftCurve: 99, rightCurve: 99, insideCurve: 99, outsideCurve: 99, cross: 0 };

const oracleShapes = (n, opts) => enumerateLoops({
  inventory: UNLIMITED, maxPieces: n, minPieces: n, box: 6, minY: 0,
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
// Measured on this machine, feasibility only, no objective:
//
//            closure   +material   +clearance
//   22 steps    1.9s        2.5s         7.1s
//   32 steps    2.6s       12.9s        30.1s
//
// Model building is 0.4s of that at 32 steps, so it is all search. Clearance
// roughly doubles the material-only time; both collision rules cost real money
// at full inventory. Whether that matters is rung 7's question, not this one —
// with a contiguous prefix most of those 32 steps will be switched off, so 32
// *active* steps overstates the real workload.
const timed = async fn => {
  const started = process.hrtime.bigint();
  const result = await fn();
  return { result, seconds: Number(process.hrtime.bigint() - started) / 1e9 };
};

test('a twelve-piece solve stays quick', async () => {
  const { result, seconds } = await timed(() => solveTrack({
    steps: 12, box: 6, minY: 0, checkTrain: true, exclude: ['cross'], inventory: STARTER,
  }));
  assert.equal(result.status, 'OPTIMAL');
  assert.ok(seconds < 20, `12-piece solve took ${seconds.toFixed(1)}s — consider the grid encoding`);
});

slow('a full-inventory solve is still tractable', async () => {
  const { result, seconds } = await timed(() => solveTrack({
    steps: 32, box: 6, minY: 0, checkTrain: true, exclude: ['cross'],
  }));
  assert.equal(result.status, 'OPTIMAL');
  assert.ok(seconds < 180, `32-step solve took ${seconds.toFixed(1)}s — the pairwise clearance `
    + 'encoding has stopped scaling; build src/solver/collisions-grid.js');
});
