// The metric objectives, on both solvers, against the brute-force oracle.
//
// Each objective is solved on an instance small enough to enumerate, the answer
// is re-chained and recounted by metricsOf, and that recount must equal the best
// the oracle finds. A case first checks its metric actually varies over the
// oracle's loops, so a test cannot pass by every loop tying.
//
// The Python cases spawn `uv`, as tests/meet.test.js does — explore.py's own
// model, and the JS model on the native engine. The crossed cases are the slow
// tier: 6–31 s a solve, against 3–8 s for the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { solveTrack } from '../src/solver/index.js';
import { enumerateLoops } from '../src/enumerate.js';
import { chainTrack, countPieces, POOLS } from '../src/track.js';
import { routeOf, shapeOf } from '../src/layouts.js';
import {
  METRICS, POPULATION_RANGES, SIGNS, combinedOf, combinedWeights, metricsOf, spanOf,
} from '../src/metrics.js';

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

const total = inventory => Object.values(inventory).reduce((a, b) => a + b, 0);
const RANGES = POPULATION_RANGES.sweep28;
// The pair the post weighs. Its own case, since a combined over a range-less
// metric is the other combination.
const PAIR = POPULATION_RANGES.crossedCeilingHeight;

// Fourteen cubes in a 3-cell box, every one spent: 25 loops, and every metric
// takes more than one value across them.
const FULL = { straight: 2, leftCurve: 4, rightCurve: 0, insideCurve: 4, outsideCurve: 4, cross: 0 };
const FULL_BOX = 3;

// Sixteen steps through one crossed cross in a 4-cell box, the inventory a
// ceiling rather than a spend: 56 loops. Every fourteen-step crossed loop in a
// 4-cell box has exactly one run of three, so repeats needs the extra length.
const CROSSED = { straight: 6, leftCurve: 2, rightCurve: 3, insideCurve: 4, outsideCurve: 0, cross: 1 };
const CROSSED_BOX = 4;
const CROSSED_STEPS = 16;

const fullSpend = route => {
  const spent = countPieces(chainTrack(route));
  return POOLS.every(pool => spent[pool] === (FULL[pool] ?? 0));
};

const FULL_LOOPS = enumerateLoops({
  inventory: FULL, maxPieces: total(FULL), minPieces: total(FULL), box: FULL_BOX, minY: 0,
}).filter(fullSpend);

const ORACLE = {
  full: FULL_LOOPS.map(route => metricsOf(chainTrack(route))),
  crossed: enumerateLoops({
    inventory: CROSSED, maxPieces: CROSSED_STEPS, minPieces: CROSSED_STEPS, box: CROSSED_BOX, minY: 0,
  }).filter(route => chainTrack(route).some(p => p.revisit)).map(route => metricsOf(chainTrack(route))),
};

/** What an objective reads off a recount: one metric, or the combination. */
const reading = (objective, metrics, ranges = RANGES) =>
  (objective === 'combined' ? combinedOf(metrics, ranges) : metrics[objective]);
const sign = objective => (objective === 'combined' ? 1 : SIGNS[objective]);

function oracleBest(population, objective, ranges = RANGES) {
  const values = population.map(m => reading(objective, m, ranges));
  assert.ok(Math.min(...values) < Math.max(...values),
    `${objective} must vary over the oracle's loops, or this test proves nothing`);
  return sign(objective) > 0 ? Math.max(...values) : Math.min(...values);
}

const close = (got, want, what) => assert.ok(Math.abs(got - want) < 1e-9, `${what}: ${got}, want ${want}`);

const ENGINES = ['wasm', 'native'];

for (const engine of ENGINES) for (const objective of [...METRICS, 'combined']) {
  test(`${objective}: the solver's full-spend optimum is the oracle's, on ${engine}`, async () => {
    const best = oracleBest(ORACLE.full, objective);
    const result = await solveTrack({
      steps: total(FULL), box: FULL_BOX, minY: 0, exclude: ['cross'], inventory: FULL,
      fill: true, objective, ranges: RANGES, engine,
    });
    assert.equal(result.status, 'OPTIMAL');
    assert.ok(fullSpend(result.route), `${shapeOf(result.route)} does not spend the inventory`);
    close(reading(objective, metricsOf(chainTrack(result.route))), best, shapeOf(result.route));
  });
}

// The worst end, for the encodings exact both ways. The solver's own value must
// match the recount too: a term forced on but never off maximises to a number
// no track has, while the route it hands back can still recount to the oracle's.
for (const engine of ENGINES) for (const objective of ['repeats', 'faceUp', 'ceiling', 'height']) {
  test(`${objective}: the solver's full-spend worst is the oracle's, on ${engine}`, async () => {
    const values = ORACLE.full.map(m => m[objective]);
    assert.ok(Math.min(...values) < Math.max(...values),
      `${objective} must vary over the oracle's loops, or this test proves nothing`);
    const worst = sign(objective) > 0 ? Math.min(...values) : Math.max(...values);
    const result = await solveTrack({
      steps: total(FULL), box: FULL_BOX, minY: 0, exclude: ['cross'], inventory: FULL,
      fill: true, objective, direction: 'worst', engine,
    });
    assert.equal(result.status, 'OPTIMAL');
    assert.ok(fullSpend(result.route), `${shapeOf(result.route)} does not spend the inventory`);
    const recount = metricsOf(chainTrack(result.route))[objective];
    assert.equal(recount, worst, shapeOf(result.route));
    assert.equal(result.value, recount, `the solver reads ${result.value}, the recount ${recount}`);
  });
}

// The pair's combination, both ends: every metric it weighs is exact both ways,
// so its worst is a real question. The solver's value is in combinedWeights
// integers, so it is checked through the offset and scale.
for (const engine of ENGINES) for (const direction of ['best', 'worst']) {
  test(`the ceiling and height combination: the solver's full-spend ${direction} is the oracle's, on ${engine}`, async () => {
    const values = ORACLE.full.map(m => combinedOf(m, PAIR));
    assert.ok(Math.min(...values) < Math.max(...values),
      'the combination must vary over the oracle\'s loops, or this test proves nothing');
    const want = direction === 'best' ? Math.max(...values) : Math.min(...values);
    const result = await solveTrack({
      steps: total(FULL), box: FULL_BOX, minY: 0, exclude: ['cross'], inventory: FULL,
      fill: true, objective: 'combined', ranges: PAIR, direction, engine,
    });
    assert.equal(result.status, 'OPTIMAL');
    assert.ok(fullSpend(result.route), `${shapeOf(result.route)} does not spend the inventory`);
    const recount = combinedOf(metricsOf(chainTrack(result.route)), PAIR);
    close(recount, want, shapeOf(result.route));
    const { scale, offset } = combinedWeights(PAIR);
    close((result.value - offset) / scale, recount, 'the solver\'s value');
  });
}

// The floor binds the train as well as the material: a train riding under a cube
// on the ground would be inside the ground. Sixteen cubes in a 3-cell box is the
// smallest instance found where reading the floor as material only admits such a
// loop, IOLSOSOLOSIRSIIR and its mirror, and they are the worst height among the
// loops at least 5 steps face up. So asking for that worst finds them unless the
// floor holds the train up too, and both the oracle and the solver must. Asked
// for the worst, a limit holds a metric at least this bad, and faceUp's bad end is
// high, so the limit reads faceUp ≥ 5.
const FLOOR = { straight: 4, leftCurve: 2, rightCurve: 2, insideCurve: 4, outsideCurve: 4, cross: 0 };
const FLOOR_BOX = 3;
const FLOOR_FACE_UP = 5;

const floorLoops = minY => enumerateLoops({
  inventory: FLOOR, maxPieces: total(FLOOR), minPieces: total(FLOOR), box: FLOOR_BOX, minY,
}).map(route => chainTrack(route)).filter(placed => {
  const spent = countPieces(placed);
  return POOLS.every(pool => spent[pool] === FLOOR[pool])
    && placed.every(p => p.material.every(c => c[1] >= 0));
});
const lowestUnder = loops => Math.min(...loops.map(metricsOf)
  .filter(m => m.faceUp >= FLOOR_FACE_UP).map(m => m.height));

const FLOOR_ORACLE = { materialOnly: floorLoops(null), withTrain: floorLoops(0) };

test('a floor that held only the material would let the worst height go underground', () => {
  const underground = FLOOR_ORACLE.materialOnly.filter(placed => placed.some(p => p.cell[1] < 0));
  assert.ok(underground.length > 0, 'the instance must have a train under the floor to rule out');
  assert.ok(FLOOR_ORACLE.withTrain.every(placed => placed.every(p => p.cell[1] >= 0)));
  assert.ok(lowestUnder(FLOOR_ORACLE.materialOnly) < lowestUnder(FLOOR_ORACLE.withTrain),
    'ruling the train out must move the answer, or the solver case below proves nothing');
});

for (const engine of ENGINES) {
  test(`the worst height keeps the train above the floor, on ${engine}`, async () => {
    const result = await solveTrack({
      steps: total(FLOOR), box: FLOOR_BOX, minY: 0, exclude: ['cross'], inventory: FLOOR,
      fill: true, objective: 'height', direction: 'worst', limits: { faceUp: FLOOR_FACE_UP }, engine,
    });
    assert.equal(result.status, 'OPTIMAL');
    const placed = chainTrack(result.route);
    assert.ok(placed.every(p => p.cell[1] >= 0), `${shapeOf(result.route)} goes below the floor`);
    assert.equal(metricsOf(placed).height, lowestUnder(FLOOR_ORACLE.withTrain), shapeOf(result.route));
  });
}

// `combined` here is over RANGES, which weighs faces and volume; the pair's
// combination, which weighs only exact metrics, is asked for its worst above.
test('the worst is refused for an objective sound in its good direction only', async () => {
  for (const objective of ['faces', 'volume', 'combined', 'longestSide']) {
    await assert.rejects(() => solveTrack({
      steps: total(FULL), box: FULL_BOX, minY: 0, exclude: ['cross'], inventory: FULL,
      fill: true, objective, ranges: RANGES, direction: 'worst',
    }), /sound only in its good direction/, objective);
  }
});

// Longest side is volume's alternative, not a metric: the most cells the
// material extends along any one axis.
const longestSide = route => Math.max(...spanOf(chainTrack(route)));

for (const engine of ENGINES) {
  test(`longestSide: the solver's full-spend optimum is the oracle's, on ${engine}`, async () => {
    const sides = FULL_LOOPS.map(longestSide);
    assert.ok(Math.min(...sides) < Math.max(...sides),
      'longestSide must vary over the oracle\'s loops, or this test proves nothing');
    const result = await solveTrack({
      steps: total(FULL), box: FULL_BOX, minY: 0, exclude: ['cross'], inventory: FULL,
      fill: true, objective: 'longestSide', engine,
    });
    assert.equal(result.status, 'OPTIMAL');
    assert.ok(fullSpend(result.route), `${shapeOf(result.route)} does not spend the inventory`);
    assert.equal(longestSide(result.route), Math.min(...sides), shapeOf(result.route));
  });
}

for (const engine of ENGINES) for (const objective of METRICS) {
  slow(`${objective}: a crossed optimum, revisit and all, is the oracle's, on ${engine}`, async () => {
    const best = oracleBest(ORACLE.crossed, objective);
    const result = await solveTrack({
      steps: CROSSED_STEPS, box: CROSSED_BOX, minY: 0, inventory: CROSSED,
      crossings: true, minCrossings: 1, fill: true, objective, engine,
    });
    assert.equal(result.status, 'OPTIMAL');
    const placed = chainTrack(result.route);
    assert.ok(placed.some(p => p.revisit), `${shapeOf(result.route)} does not cross`);
    assert.equal(metricsOf(placed)[objective], best, shapeOf(result.route));
  });
}

test('the combined weights are the LCM of the population ranges, spread by range', () => {
  assert.equal(combinedWeights(POPULATION_RANGES.sweep28).scale, 13734);
  assert.equal(combinedWeights(POPULATION_RANGES.crossed).scale, 121212);
  assert.equal(combinedWeights(PAIR).scale, 5373);
  // Integer weights reproduce the 0–1 combination exactly, offset and scale off,
  // and weigh only the metrics the ranges name.
  for (const [ranges, metrics] of [[POPULATION_RANGES.sweep28, ORACLE.full[0]],
                                   [POPULATION_RANGES.crossed, ORACLE.crossed[0]],
                                   [PAIR, ORACLE.full[0]]]) {
    const { scale, weights, offset } = combinedWeights(ranges);
    assert.deepEqual(Object.keys(weights), Object.keys(ranges));
    const integer = Object.keys(weights).reduce((t, name) => t + weights[name] * metrics[name], 0);
    close((integer - offset) / scale, combinedOf(metrics, ranges), 'combined');
  }
});

// ---- limits and spans: the same terms as constraints, for proving ------------

const FULL_SOLVE = {
  steps: total(FULL), box: FULL_BOX, minY: 0, exclude: ['cross'], inventory: FULL, fill: true,
};
const FULL_SPANS = enumerateLoops({
  inventory: FULL, maxPieces: total(FULL), minPieces: total(FULL), box: FULL_BOX, minY: 0,
}).filter(fullSpend).map(route => spanOf(chainTrack(route)));
const fits = (span, cap) => span.every((n, a) => n <= cap[a]);

test('a combined limit one past the oracle\'s best is infeasible, and at it is met', async () => {
  const { weights } = combinedWeights(RANGES);
  const integer = m => Object.keys(weights).reduce((t, name) => t + weights[name] * m[name], 0);
  const best = Math.max(...ORACLE.full.map(integer));
  const past = await solveTrack({ ...FULL_SOLVE, ranges: RANGES, limits: { combined: best + 1 } });
  assert.equal(past.status, 'INFEASIBLE');
  const at = await solveTrack({ ...FULL_SOLVE, ranges: RANGES, limits: { combined: best } });
  assert.equal(integer(metricsOf(chainTrack(at.route))), best, shapeOf(at.route));
});

test('a worst repeats limit one past the oracle\'s most is infeasible, and at it is met', async () => {
  const most = Math.max(...ORACLE.full.map(m => m.repeats));
  const past = await solveTrack({ ...FULL_SOLVE, direction: 'worst', limits: { repeats: most + 1 } });
  assert.equal(past.status, 'INFEASIBLE');
  const at = await solveTrack({ ...FULL_SOLVE, direction: 'worst', limits: { repeats: most } });
  assert.equal(metricsOf(chainTrack(at.route)).repeats, most, shapeOf(at.route));
});

test('a worst limit is refused for a metric sound in its good direction only', async () => {
  await assert.rejects(() => solveTrack({ ...FULL_SOLVE, direction: 'worst', limits: { faces: 2 } }),
    /sound only in its good direction/);
});

test('a span cap admits exactly the oracle\'s loops that fit it', async () => {
  const smallest = FULL_SPANS.reduce((a, b) => (a[0] * a[1] * a[2] <= b[0] * b[1] * b[2] ? a : b));
  // Each axis of the smallest box, one shorter: some of these fit no loop at all.
  const caps = [smallest, ...smallest.map((_, a) => smallest.map((n, k) => n - (k === a ? 1 : 0)))]
    .filter(cap => cap.every(n => n >= 1));
  assert.ok(caps.some(cap => !FULL_SPANS.some(span => fits(span, cap))),
    'some cap must fit no loop, or this test proves nothing');
  for (const cap of caps) {
    const result = await solveTrack({ ...FULL_SOLVE, spans: cap });
    if (FULL_SPANS.some(span => fits(span, cap))) {
      assert.ok(fits(spanOf(chainTrack(result.route)), cap), `${cap}: ${shapeOf(result.route)}`);
    } else {
      assert.equal(result.status, 'INFEASIBLE', `${cap}`);
    }
  }
});

// In a 3-cell box no cap narrows the region the model is built over: every loop
// spans at least 4, and 4 either way of the origin reaches past 3. In a 5-cell
// box these do, so the model really is smaller than the box, and must still
// find every loop that fits — each cap's set, exactly, by route. Enumerating by
// no-good cuts costs ~4 s a loop here, so the caps are ones few loops fit.
const WIDE_BOX = 5;
const WIDE = enumerateLoops({
  inventory: FULL, maxPieces: total(FULL), minPieces: total(FULL), box: WIDE_BOX, minY: 0,
}).filter(fullSpend);

test('a span narrows the region the model is built over, and loses no loop that fits', async () => {
  const caps = [[5, 3, 8], [4, 3, 8]];
  const fitting = cap => WIDE.filter(route => fits(spanOf(chainTrack(route)), cap)).map(shapeOf).sort();
  assert.ok(caps.some(cap => !fitting(cap).length), 'some cap must fit no loop, or this test proves nothing');
  for (const cap of caps) {
    assert.ok(cap.some(n => n - 1 < WIDE_BOX), `${cap} does not narrow the region`);
    const result = await solveTrack({ ...FULL_SOLVE, box: WIDE_BOX, spans: cap, allSolutions: true });
    assert.deepEqual(result.routes.map(shapeOf).sort(), fitting(cap), `${cap}`);
  }
});

test('a metric objective refuses a free length, which would rank loops of different sizes', async () => {
  await assert.rejects(
    () => solveTrack({ steps: 8, box: 3, minY: 0, exclude: ['cross'], objective: 'volume' }),
    /needs fill/);
});

// ---- the same objectives on native CP-SAT -------------------------------------

function explore(objective, ranges = 'sweep28') {
  const out = execFileSync('uv', [
    'run', '--quiet', 'scripts/explore.py', '--set', JSON.stringify(FULL),
    '--box', String(FULL_BOX), '--objective', objective, '--ranges', ranges, '--time', '60',
  ], { encoding: 'utf8' });
  const shapes = out.split('\n').filter(line => /^ {2}[A-Z]+$/.test(line)).map(line => line.trim());
  assert.equal(shapes.length, 1, `expected one answer line in:\n${out}`);
  return shapes[0];
}

for (const objective of [...METRICS, 'combined']) {
  test(`${objective}: explore.py's full-spend optimum is the oracle's`, () => {
    const best = oracleBest(ORACLE.full, objective);
    const shape = explore(objective);
    assert.ok(fullSpend(routeOf(shape)), `${shape} does not spend the inventory`);
    close(reading(objective, metricsOf(chainTrack(routeOf(shape)))), best, shape);
  });
}

test('the ceiling and height combination: explore.py\'s full-spend optimum is the oracle\'s', () => {
  const best = oracleBest(ORACLE.full, 'combined', PAIR);
  const shape = explore('combined', 'crossedCeilingHeight');
  assert.ok(fullSpend(routeOf(shape)), `${shape} does not spend the inventory`);
  close(combinedOf(metricsOf(chainTrack(routeOf(shape))), PAIR), best, shape);
});
