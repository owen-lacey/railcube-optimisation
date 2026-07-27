// Rung 8: the cross.
//
// A cross is one piece, one cell, and two rails on the same face. The train can
// pass over it twice, so it appears in a route twice — but it is one cube out of
// the box, and only the starter set's successor ships any at all (0 in starter,
// 2 in deluxe), which is why everything here runs against deluxe or a synthetic
// set.
//
// The foot-gun, from next-session.md: "minimise dropped pieces" must count
// active NON-revisit steps. Get it wrong and the solver mints free pieces — the
// worst class of bug in a post about proving constraints. The tests that guard
// it never read the solver's own count; they re-derive it from the route.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrack } from '../src/solver/index.js';
import { chainTrack, countPieces, countPools, OPPOSITE, POOLS, DELUXE } from '../src/track.js';

const LETTER = {
  leftCurve: 'L', rightCurve: 'R', insideCurve: 'I',
  outsideCurve: 'O', straight: 'S', cross: 'X',
};
const shape = route => route.map(t => LETTER[t]).join('');
const total = inv => Object.values(inv).reduce((a, b) => a + b, 0);

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

// Small enough to reason about: two crosses and the curves needed to get back to
// them. Deliberately short on straights, so a cross is worth using as one.
const TWO_CROSSES = { straight: 4, flatCurve: 8, insideCurve: 4, outsideCurve: 0, cross: 2 };

// ---- The foot-gun --------------------------------------------------------

// The same accounting as the forced figure-of-eight below, but reached through a
// real optimisation rather than a pinned route — slower, and worth having,
// because it is the path the model will actually be used down.
slow('no solution spends more physical pieces than the inventory holds', async () => {
  const found = await solveTrack({
    steps: total(TWO_CROSSES), box: 5, minY: 0, inventory: TWO_CROSSES,
    optionalSteps: true, objective: 'minimiseDropped', crossings: true,
  });
  assert.equal(found.status, 'OPTIMAL');

  const spent = countPieces(chainTrack(found.route));
  for (const pool of POOLS) {
    assert.ok(spent[pool] <= TWO_CROSSES[pool],
      `${shape(found.route)} spends ${spent[pool]} ${pool}, set has ${TWO_CROSSES[pool]}`);
  }
});

// The other half of the same trap. If revisits were counted as pieces, `dropped`
// would be too small and the objective would be measuring the wrong thing.
slow('dropped counts cubes on the table, not steps in the route', async () => {
  const found = await solveTrack({
    steps: total(TWO_CROSSES), box: 5, minY: 0, inventory: TWO_CROSSES,
    optionalSteps: true, objective: 'minimiseDropped', crossings: true,
  });
  const placed = chainTrack(found.route);
  const cubes = placed.filter(p => !p.revisit).length;

  assert.equal(cubes + found.dropped, total(TWO_CROSSES));
  // And if the loop actually crosses itself, the route is longer than the pile
  // of cubes — which is the whole point of the piece.
  const revisits = placed.filter(p => p.revisit).length;
  assert.equal(found.route.length, cubes + revisits);
});

// ---- What a crossing is --------------------------------------------------

// The shortest closed loop that genuinely crosses itself: a figure of eight
// through one cross. Out along the front, round to the left, back through the
// origin at right angles to the first pass, then the mirror image of that.
// Found by search over the catalogue, not invented.
const FIGURE_EIGHT = [...'XSLLLSXSRRRS'].map(l =>
  ({ X: 'cross', S: 'straight', L: 'leftCurve', R: 'rightCurve' }[l]));

// A cross visited twice on the same face with perpendicular headings is one
// cube. Same or opposite headings would be the same rail, not a crossing, and
// the model must not accept that as an excuse to skip a claim.
test('the two passes must cross, not retrace', () => {
  const placed = chainTrack(FIGURE_EIGHT);
  const revisited = placed.filter(p => p.revisit);
  assert.equal(revisited.length, 1, 'expected exactly one revisit');
  assert.equal(revisited[0].type, 'cross');

  // The two passes share a cell and a face, and their headings are at right
  // angles — that is precisely what makes the second one free.
  const first = placed.find(p => p.type === 'cross' && !p.revisit);
  assert.deepEqual(revisited[0].cell, first.cell);
  assert.equal(revisited[0].pose[0], first.pose[0], 'same face');
  assert.notEqual(revisited[0].pose[1], first.pose[1], 'a different heading');
  assert.notEqual(revisited[0].pose[1], OPPOSITE[first.pose[1]], 'not merely the reverse');
});

// Retracing is not crossing. Four left curves bring the train back to the start
// cell on the same heading, so a cross there is the same rail twice — and the
// second pass must be refused a free ride. (It collides, because the first pass
// already claimed the cell.)
test('coming back on the same rail is not a crossing', () => {
  assert.throws(
    () => chainTrack(['cross', 'leftCurve', 'leftCurve', 'leftCurve', 'leftCurve']),
    /collision|does not close/,
  );
});

test('a cross placed but not crossed is just a straight', () => {
  const asCross = ['cross', 'leftCurve', 'straight', 'leftCurve', 'straight', 'leftCurve', 'straight', 'leftCurve'];
  const placed = chainTrack(asCross);
  assert.ok(placed.every(p => !p.revisit), 'nothing should be a revisit here');
  assert.equal(countPieces(placed).cross, 1);

  // It moves exactly like a straight, so swapping the two leaves a legal track:
  // "cross placed" is not "cross crossed".
  const asStraight = ['straight', ...asCross.slice(1)];
  assert.doesNotThrow(() => chainTrack(asStraight));
});

// coordinates.md:176-177 — both traversals want the same cell above the cross,
// and there is only one train, so a crossing costs no extra clearance.
test('a crossing needs no clearance beyond the first pass', () => {
  const placed = chainTrack(FIGURE_EIGHT);
  const revisit = placed.find(p => p.revisit);
  assert.deepEqual(revisit.material, []);
  assert.deepEqual(revisit.train, []);
});


// ---- The foot-gun, at the solver ------------------------------------------

// A crossing is never worth choosing under this objective — it spends a cross
// and places no extra cube — so the accounting has to be tested by forcing one.
// That is the point: a bug here would not show up in an ordinary optimal run.
const eight = extra => solveTrack({
  steps: FIGURE_EIGHT.length, box: 5, minY: 0, require: FIGURE_EIGHT, ...extra,
});

// Eleven cubes, twelve steps. If the model counted steps, one cross would not be
// enough and this would come back INFEASIBLE.
test('a crossed cross is charged once, not twice', async () => {
  const oneCross = { straight: 4, flatCurve: 6, insideCurve: 0, outsideCurve: 0, cross: 1 };
  const result = await eight({ crossings: true, inventory: oneCross });
  assert.equal(result.status, 'OPTIMAL', 'one cross should be enough to cross once');

  const cubes = result.pieces.filter(p => !p.revisit).length;
  assert.equal(cubes, 11);
  assert.equal(result.route.length, 12);
  assert.equal(result.dropped, total(oneCross) - cubes);
  assert.equal(countPieces(result.pieces).cross, 1);
});

// ...and it still has to be paid for at all. Zero crosses, no crossing.
test('a crossing still costs one cross', async () => {
  const noCross = { straight: 4, flatCurve: 6, insideCurve: 0, outsideCurve: 0, cross: 0 };
  assert.equal((await eight({ crossings: true, inventory: noCross })).status, 'INFEASIBLE');
});

// Without crossings enabled the second pass is an ordinary piece landing on an
// occupied cell, so the same route is a collision.
test('the same route is illegal when crossings are switched off', async () => {
  assert.equal((await eight({ crossings: false })).status, 'INFEASIBLE');
});

// ---- The solver cannot invent a revisit ----------------------------------

// The exploit this rung guards against is not over-counting, it is under-
// claiming: label an awkward step a "revisit" and the collision rules stop
// looking at it. chainTrack derives revisits from the geometry independently, so
// if the solver ever claims one it has not earned, chaining the route throws.
// Capped rather than exhaustive: with crossings on there are hundreds of
// eight-piece loops, and each no-good cut makes the next solve slower. Forty is
// a sample, and `truncated` says so out loud — a capped sweep must never read as
// a complete one.
test('no solution can invent a revisit it has not earned', async () => {
  const found = await solveTrack({
    steps: 8, box: 4, minY: 0, inventory: DELUXE, crossings: true,
    allSolutions: true, maxSolutions: 12,
  });
  assert.ok(found.routes.length > 0);
  assert.equal(found.truncated, true, 'expected more solutions than the cap');
  for (const route of found.routes) {
    assert.doesNotThrow(() => chainTrack(route), shape(route));
  }
});

// ---- What the objective actually does with a cross -----------------------

// next-session.md predicted half of this: under "minimise dropped", a cross is
// worth having as a spare straight. Crossing puts no extra cube on the table, so
// where the set already closes comfortably the optimum places its crosses and
// drives straight over them — as here. It is not that crossings are never
// chosen, though; see the test below.
slow('a crossing is not chosen when the set closes without one', async () => {
  const set = { straight: 0, flatCurve: 8, insideCurve: 4, outsideCurve: 0, cross: 2 };
  const result = await solveTrack({
    steps: total(set), box: 5, minY: 0, inventory: set,
    optionalSteps: true, objective: 'minimiseDropped', crossings: true,
  });
  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.pieces.filter(p => p.revisit).length, 0, 'crossing should not pay here');
  assert.ok(countPools(result.route).cross > 0, 'but the crosses should still get used');
});

// The other half. Give the solver an inventory that only closes into a
// full-length loop by crossing, and it finds the crossing itself — no pinned
// route, no hint. Twelve steps over eleven cubes, nothing dropped, which is only
// possible with a revisit.
slow('a crossing IS chosen when it is the only way to spend every cube', async () => {
  const set = { straight: 4, flatCurve: 6, insideCurve: 0, outsideCurve: 0, cross: 1 };
  const result = await solveTrack({
    steps: 12, box: 5, minY: 0, inventory: set,
    optionalSteps: true, objective: 'minimiseDropped', crossings: true,
  });
  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.dropped, 0, `left pieces in the box: ${shape(result.route)}`);
  assert.equal(result.pieces.filter(p => p.revisit).length, 1);
  assert.equal(result.route.length, 12);
  assert.equal(countPieces(result.pieces).cross, 1);
});

// ---- Counting, one last time ---------------------------------------------

// countPools counts the traversal; countPieces counts the table. On a crossing
// route they must differ, or the distinction the whole rung rests on is fake.
test('the two counts differ exactly on crossings', () => {
  const placed = chainTrack(FIGURE_EIGHT);
  const route = placed.map(p => p.type);
  assert.equal(countPools(route).cross, 2, 'the route passes a cross twice');
  assert.equal(countPieces(placed).cross, 1, 'but there is one cube on the table');
});
