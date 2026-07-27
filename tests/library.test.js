// What we assume about cpsat-js, asserted rather than trusted.
//
// One of these assumptions is a bug we are working around. Owen owns the port,
// so when it is fixed this file is where that shows up: the "is still broken"
// test starts failing, and src/solver/index.js can drop its workaround.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CpModel, CpSolver, CpSolverStatus } from 'cpsat-js';

const solver = await CpSolver.create();

/** Build a tiny model, solve it, and report the status as a string. */
function statusOf(build) {
  const model = new CpModel();
  build(model);
  return CpSolverStatus[solver.solve(model).status];
}

const pinned = (model, name, value) => {
  const v = model.newIntVar(0, 2, name);
  model.add(v.equals(value));
  return v;
};

// ---- The bug ------------------------------------------------------------

// cpsat-js 1.0.0: IntVar.notEquals produces a constraint that does nothing. Two
// variables pinned to the same value plus `a != b` should be INFEASIBLE, and it
// solves instead. src/solver/index.js therefore never calls notEquals — see
// `differ` there. When this test fails, the library has been fixed.
test('notEquals is still a no-op, so the solver must not use it', () => {
  const status = statusOf(model => {
    const a = pinned(model, 'a', 1);
    const b = pinned(model, 'b', 1);
    model.add(a.notEquals(b));
  });
  assert.equal(status, 'OPTIMAL',
    'notEquals now works — drop the `differ` workaround in src/solver/index.js');
});

// ---- What we rely on instead --------------------------------------------

test('a reified pair of strict inequalities does enforce difference', () => {
  const status = statusOf(model => {
    const a = pinned(model, 'a', 1);
    const b = pinned(model, 'b', 1);
    const below = model.newBoolVar('below');
    model.add(a.lt(b)).onlyEnforceIf(below);
    model.add(a.gt(b)).onlyEnforceIf(below.not());
  });
  assert.equal(status, 'INFEASIBLE');
});

test('addAllDifferent enforces difference', () => {
  assert.equal(statusOf(model => {
    model.addAllDifferent([pinned(model, 'a', 1), pinned(model, 'b', 1)]);
  }), 'INFEASIBLE');

  // And it is not merely pairwise-on-constants: three variables cannot fit in
  // two values.
  assert.equal(statusOf(model => {
    model.addAllDifferent([0, 1, 2].map(i => model.newIntVar(0, 1, `v${i}`)));
  }), 'INFEASIBLE');
});

test('onlyEnforceIf really does gate a constraint', () => {
  assert.equal(statusOf(model => {
    const a = pinned(model, 'a', 1);
    const off = model.newBoolVar('off');
    model.add(off.equals(0));
    model.add(a.equals(2)).onlyEnforceIf(off); // unenforced, so harmless
  }), 'OPTIMAL');

  assert.equal(statusOf(model => {
    const a = pinned(model, 'a', 1);
    const on = model.newBoolVar('on');
    model.add(on.equals(1));
    model.add(a.equals(2)).onlyEnforceIf(on);
  }), 'INFEASIBLE');
});

// The whole transition encoding rests on this: LinearExpr.plus rejects an IntVar
// even though IntVar.plus accepts a LinearExpr.
test('LinearExpr.plus does not accept a bare IntVar', () => {
  const model = new CpModel();
  const a = model.newIntVar(0, 2, 'a');
  const b = model.newIntVar(0, 2, 'b');
  assert.throws(() => a.times(1).plus(b), TypeError);
  assert.doesNotThrow(() => a.times(1).plus(b.toLinearExpr()));
});
