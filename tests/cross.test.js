// Rung 8: the cross.
//
// A cross is one piece, one cell, and two rails on the same face. The train can
// pass over it twice, so it appears in a route twice — but it is one cube out of
// the box. The starter set ships none and the deluxe two, so the sets here are
// deluxe or synthetic; Owen's own set has one, which is what took this rung from
// theory to something he can build.
//
// The foot-gun, from next-session.md: "minimise dropped pieces" must count
// active NON-revisit steps. Get it wrong and the solver mints free pieces — the
// worst class of bug in a post about proving constraints. The tests that guard
// it never read the solver's own count; they re-derive it from the route.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrack } from '../src/solver/index.js';
import { enumerateLoops } from '../src/enumerate.js';
import { chainTrack, countPieces, countPools, OPPOSITE, POOLS } from '../src/track.js';
import { DELUXE } from './fixtures.js';

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
const TWO_CROSSES = { straight: 4, leftCurve: 4, rightCurve: 4, insideCurve: 4, outsideCurve: 0, cross: 2 };

// ---- The foot-gun --------------------------------------------------------

// The same accounting as the forced figure-of-eight below, but reached through a
// real optimisation rather than a pinned route — slower, and worth having,
// because it is the path the model will actually be used down.
slow('no solution spends more physical pieces than the inventory holds', async () => {
  const found = await solveTrack({
    steps: total(TWO_CROSSES), box: 5, minY: 0, inventory: TWO_CROSSES,
    objective: 'maximiseScore', crossings: true,
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
    objective: 'maximiseScore', crossings: true,
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

// Pinning the route rather than optimising for it, so the accounting is tested
// in isolation from whether the objective happens to want a crossing.
const eight = extra => solveTrack({
  steps: FIGURE_EIGHT.length, box: 5, minY: 0, require: FIGURE_EIGHT, ...extra,
});

// Eleven cubes, twelve steps. If the model counted steps, one cross would not be
// enough and this would come back INFEASIBLE.
test('a crossed cross is charged once, not twice', async () => {
  const oneCross = { straight: 4, leftCurve: 3, rightCurve: 3, insideCurve: 0, outsideCurve: 0, cross: 1 };
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
  const noCross = { straight: 4, leftCurve: 3, rightCurve: 3, insideCurve: 0, outsideCurve: 0, cross: 0 };
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
  const set = { straight: 0, leftCurve: 4, rightCurve: 4, insideCurve: 4, outsideCurve: 0, cross: 2 };
  const result = await solveTrack({
    steps: total(set), box: 5, minY: 0, inventory: set,
    objective: 'maximiseScore', crossings: true,
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
  const set = { straight: 4, leftCurve: 3, rightCurve: 3, insideCurve: 0, outsideCurve: 0, cross: 1 };
  const result = await solveTrack({
    steps: 12, box: 5, minY: 0, inventory: set,
    objective: 'maximiseScore', crossings: true,
  });
  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.dropped, 0, `left pieces in the box: ${shape(result.route)}`);
  assert.equal(result.pieces.filter(p => p.revisit).length, 1);
  assert.equal(result.route.length, 12);
  assert.equal(countPieces(result.pieces).cross, 1);
});

// ---- Twice, and no more --------------------------------------------------

// A cross has two rails, so the train runs it twice and no more. A third pass is
// perpendicular to the placement and so *looks* like a revisit, which is exactly
// the trap: it is necessarily the same rail as the second pass, and a rail's two
// ends already click into their neighbours.
//
// Found by walking the head back to the same cell at each of three perpendicular
// poses in turn. It does not close, and it does not need to — the rule has to
// bite while the route is still being unrolled.
const THRICE = [...'XSLLLSXSSSLLLRX'].map(l =>
  ({ X: 'cross', S: 'straight', L: 'leftCurve', R: 'rightCurve' }[l]));

test('a cross cannot be traversed three times', () => {
  assert.throws(() => chainTrack(THRICE), /two rails, not three/);
});

// The solver's version of the same rule is that a step holds at most one role
// across all crossing slots, so no cube can be the placement for two of them.
test('the solver refuses a third pass as well', async () => {
  const plenty = { straight: 9, leftCurve: 4, rightCurve: 4, insideCurve: 0, outsideCurve: 0, cross: 1 };
  const result = await solveTrack({
    steps: THRICE.length, box: 5, minY: 0, inventory: plenty, crossings: true, require: THRICE,
  });
  assert.equal(result.status, 'INFEASIBLE');
});

// ---- Agreement with the oracle -------------------------------------------

// Rung 8's missing piece. Every other rung is cross-checked against the
// brute-force enumerator, and until it understood revisits this one could not be:
// asked for twelve-piece loops with a cross available it used to answer 0 while
// chainTrack happily accepted the figure of eight.
const CROSSING_SET = { straight: 4, leftCurve: 3, rightCurve: 3, insideCurve: 0, outsideCurve: 0, cross: 1 };

// Up to twelve on both sides — `steps` is an upper bound and the loop uses a
// prefix of it, so the shorter non-crossing loops are part of the answer now.
const oracleShapes = box => enumerateLoops({
  inventory: CROSSING_SET, maxPieces: 12, box, minY: 0,
}).map(shape).sort();

const solverShapes = async box => (await solveTrack({
  steps: 12, box, minY: 0, inventory: CROSSING_SET, crossings: true, allSolutions: true,
})).routes.map(shape).sort();

// A small box on purpose: the two searches must agree exactly, and each no-good
// cut makes the next solve slower, so the cheap case is the one worth running
// every time. The big box is the same check with nothing held back.
test('solver and oracle agree on every crossing loop in a small box', async () => {
  const oracle = oracleShapes(3);
  assert.ok(oracle.length > 0, 'the oracle must actually be finding crossings');
  assert.deepEqual(await solverShapes(3), oracle);
});

slow('solver and oracle agree on every crossing loop in a box that holds them all', async () => {
  assert.deepEqual(await solverShapes(6), oracleShapes(6));
});

// Twelve is the floor, and it is the oracle that can say so: a crossing needs the
// loop to come back to the cross at right angles, and nothing shorter manages it.
test('twelve steps is the shortest a loop can cross itself in', () => {
  const shorter = enumerateLoops({ inventory: CROSSING_SET, maxPieces: 11, minPieces: 1, minY: 0 })
    .filter(route => countPools(route).cross > 1);
  assert.deepEqual(shorter.map(shape), []);
  assert.ok(oracleShapes(6).length > 0, 'but twelve manages it');
});

// ---- Mandating a crossing ------------------------------------------------

// A crossing puts no extra cube on the table, so minimise-dropped reaches for one
// only when it is the only way to spend everything. `minCrossings` asks the other
// question outright: the best track that *must* cross itself.
//
// The control carries the test. XLSLSLSL is a legal loop that places its cross
// and drives straight over it — precisely what the model does when left to
// choose — and the mandate is what rules it out.
test('a mandated crossing rules out placing a cross and driving over it', async () => {
  const set = { straight: 4, leftCurve: 4, rightCurve: 3, insideCurve: 0, outsideCurve: 0, cross: 1 };
  const pinned = extra => solveTrack({
    steps: 8, box: 5, minY: 0, inventory: set, crossings: true,
    require: [...'XLSLSLSL'].map(l => ({ X: 'cross', L: 'leftCurve', S: 'straight' }[l])),
    ...extra,
  });
  assert.equal((await pinned({})).status, 'OPTIMAL', 'legal with the cross merely placed');
  assert.equal((await pinned({ minCrossings: 1 })).status, 'INFEASIBLE');
});

test('a mandated crossing is met by a route that actually crosses', async () => {
  const result = await eight({ crossings: true, minCrossings: 1, inventory: CROSSING_SET });
  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.pieces.filter(p => p.revisit).length, 1);
});

// Both of these are modelling mistakes rather than infeasibilities, and saying so
// beats an INFEASIBLE that looks like a fact about the pieces.
test('mandating a crossing without the encoding is refused, not silently infeasible', async () => {
  await assert.rejects(
    () => eight({ crossings: false, minCrossings: 1, inventory: CROSSING_SET }),
    /needs crossings/,
  );
});

test('mandating more crossings than the box holds crosses is refused', async () => {
  await assert.rejects(
    () => eight({ crossings: true, minCrossings: 2, inventory: CROSSING_SET }),
    /inventory holds 1 cross/,
  );
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

// ---- How wide a crossing is, as opposed to whether it is legal ------------

// Left free, every crossing closes as tightly as it can: the two passes six
// steps apart, which spells XSLLLSX — the figure eight above. That is fine as
// geometry and dull as output, and a sweep of the 35-cube crossing set came back
// 32 layouts in 38 carrying exactly that motif. `minCrossingGap` is the knob for
// it, and this pins what it does: keep every loop whose passes are far enough
// apart, drop the rest, invent nothing.
//
// Measured off the chained route rather than off `firstAt`/`secondAt`, because a
// constraint that silently fails to bind is the failure mode this whole file
// exists to catch — see the notEquals bug in tests/library.test.js.
const crossingGap = placed => {
  const at = placed.flatMap((piece, i) => (piece.type === 'cross' ? [i] : []));
  return at.length === 2 ? at[1] - at[0] : null;   // one appearance means uncrossed
};

test('minCrossingGap keeps exactly the crossings wide enough to pass it', async () => {
  const every = extra => solveTrack({
    steps: 12, box: 4, minY: 0, inventory: CROSSING_SET, crossings: true,
    allSolutions: true, ...extra,
  });
  const loose = (await every({})).routes;
  const wide = (await every({ minCrossingGap: 8 })).routes;
  const gaps = routes => routes.map(route => crossingGap(chainTrack(route)));

  assert.ok(gaps(loose).includes(6), 'unconstrained, the tight figure eight is reachable');
  assert.deepEqual(gaps(wide).filter(g => g !== null && g < 8), [],
    'nothing narrower than the demanded gap survives');
  // Not merely "narrow ones are gone": the wide set is the loose set filtered,
  // so the constraint has removed loops rather than moved the search somewhere
  // else. Uncrossed loops are in both — the gap says nothing about them.
  assert.deepEqual(
    wide.map(shape).sort(),
    loose.filter(route => {
      const g = crossingGap(chainTrack(route));
      return g === null || g >= 8;
    }).map(shape).sort(),
  );
});
