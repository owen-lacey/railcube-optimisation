// The native engine: the JS model's own CpModelProto, solved by OR-Tools in a
// child process (src/solver/native.js). It spawns `uv`, as tests/meet.test.js does.
//
// Native has no model of its own to drift, so what is under test is the engine:
// that the bytes reach OR-Tools intact and the answers come back readable through
// the same selectors. Enumerating against the oracle is the strictest form of
// that — every loop, so a mis-read variable cannot hide behind one lucky answer —
// and it re-solves after every cut, so the model is re-sent as it grows.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrack } from '../src/solver/index.js';
import { enumerateLoops } from '../src/enumerate.js';
import { chainTrack } from '../src/track.js';
import { shapeOf } from '../src/layouts.js';

const CROSSING_SET = { straight: 4, leftCurve: 3, rightCurve: 3, insideCurve: 0, outsideCurve: 0, cross: 1 };

test('an unknown engine is refused, not defaulted', async () => {
  await assert.rejects(() => solveTrack({ steps: 4, box: 3, engine: 'gpu' }), /engine must be one of/);
});

test('native and the oracle agree on every crossing loop in a small box', async () => {
  const oracle = enumerateLoops({ inventory: CROSSING_SET, maxPieces: 12, box: 3, minY: 0 })
    .map(shapeOf).sort();
  assert.ok(oracle.some(s => s.includes('X')), 'the oracle must actually be finding crossings');
  const { routes } = await solveTrack({
    steps: 12, box: 3, minY: 0, inventory: CROSSING_SET, crossings: true, allSolutions: true,
    engine: 'native',
  });
  assert.deepEqual(routes.map(shapeOf).sort(), oracle);
});

test('native refutes what wasm refutes, and proves what wasm proves', async () => {
  // A twelve-step loop needs a crossing here; a box of 2 has no room for one.
  const ask = (box, engine) => solveTrack({
    steps: 12, box, minY: 0, inventory: CROSSING_SET, crossings: true, minCrossings: 1,
    fill: true, engine,
  });
  const statuses = [];
  for (const box of [2, 3]) {
    const [wasm, native] = [await ask(box, 'wasm'), await ask(box, 'native')];
    assert.equal(native.status, wasm.status, `box ${box}`);
    if (native.route) assert.ok(chainTrack(native.route).some(p => p.revisit), shapeOf(native.route));
    statuses.push(native.status);
  }
  assert.deepEqual(statuses, ['INFEASIBLE', 'OPTIMAL'], 'one refutation and one proof, or this proves nothing');
});
