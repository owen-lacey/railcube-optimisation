// The crossed sweep's tally by the weighted metrics, and the weighted best and
// worst read off it.
//
// The tally is a claim about sweeps.db, which a fresh clone does not have, so what
// can be checked here is the file itself: every example is re-chained and
// recounted to the row it is filed under, and the counts and ranges agree with
// each other. That the counts are right of the whole database is
// scripts/tally-weights.js's job, which reads every row. Knots are recounted in
// the slow tier only: it spawns `uv`, and the tally has already re-read each one.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chainTrack } from '../src/track.js';
import { routeOf } from '../src/layouts.js';
import { closeCallsOf, metricsOf, posesOf, spanOf } from '../src/metrics.js';
import { knotInput, knotOf, knotReader } from '../scripts/knot-curves.js';
import { SWEEP_CROSSED_WEIGHTS as table } from '../site/src/lib/sweeps.js';
import { DIRECTIONS, extremes, weigher } from '../site/src/lib/weighting.js';

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

const NAMES = Object.keys(DIRECTIONS);
const valuesOf = r => NAMES.map(name => r[name]);
const examples = table.rows.flatMap(row => row.examples.map(example => ({ row, ...example })));

/** Every weighting with each weight from `lo` to `hi`. */
function* weightings(lo, hi) {
  const n = hi - lo + 1;
  for (let w = 0; w < n ** NAMES.length; w++) {
    yield Object.fromEntries(NAMES.map((name, i) => [name, lo + Math.floor(w / n ** i) % n]));
  }
}

test('every example recounts to its row, on the floor, its knot as filed or unread', () => {
  assert.ok(examples.length > 0);
  for (const { row, shape, knot } of examples) {
    const placed = chainTrack(routeOf(shape));
    assert.deepEqual(
      [posesOf(placed), closeCallsOf(placed), metricsOf(placed).repeats, Math.max(...spanOf(placed))],
      [row.poses, row.closeCalls, row.repeats, row.longestSide], shape);
    assert.equal(row.knotted, knot === null ? null : Number(knot !== 'unknot'), shape);
    assert.ok(placed.every(p => p.cell[1] >= 0), `${shape} goes below the floor`);
  }
});

slow('every example\'s read knot reads as filed', async () => {
  const reader = knotReader();
  const read = examples.filter(({ knot }) => knot !== null);
  const polys = await reader.read(read.map(({ shape }, i) => ({
    id: i, seed: i, ...knotInput(chainTrack(routeOf(shape))) })));
  await reader.close();
  read.forEach(({ shape, knot }, i) => assert.equal(knotOf(polys[i].over, polys[i].under), knot, shape));
});

test('the rows are distinct, count every legal layout, and set the ranges', () => {
  const keys = table.rows.map(r => valuesOf(r).join(','));
  assert.equal(new Set(keys).size, keys.length, 'a row appears twice');
  assert.equal(table.rows.reduce((n, r) => n + r.count, 0), table.legal);
  assert.ok(table.legal <= table.population);
  for (const name of NAMES) {
    const values = table.rows.map(r => r[name]).filter(v => v !== null);
    assert.deepEqual(table.ranges[name], [Math.min(...values), Math.max(...values)], name);
  }
});

test('extremes are the brute-force best and worst over a grid of weights', () => {
  const { score, scale } = weigher(table.ranges);
  for (const weights of weightings(0, 2)) {
    // A row is sure of its score if its knot is read or knotted weighs nothing.
    const sure = table.rows.filter(r => r.knotted !== null || !weights.knotted);
    const scores = sure.map(r => score(r, weights, r.knotted ?? 0));
    const { best, worst } = extremes(table, weights);
    for (const [end, at] of [[best, Math.max(...scores)], [worst, Math.min(...scores)]]) {
      const tied = sure.filter((_, i) => scores[i] === at);
      assert.equal(end.score, at / scale);
      assert.deepEqual(end.rows, tied, JSON.stringify(weights));
      assert.equal(end.count, tied.reduce((n, r) => n + r.count, 0));
    }
  }
});

test('with knotted weighing nothing, no unread knot leaves an end unsure', () => {
  for (const weights of weightings(0, 2)) {
    if (weights.knotted) continue;
    const { best, worst } = extremes(table, weights);
    assert.equal(best.unsure + worst.unsure, 0, JSON.stringify(weights));
  }
});

// What hydrate-sweeps.js --front promises: with every weight positive, every
// layout that could reach either end has had its knot read.
test('with every weight positive, no unread knot can reach either end, and both ends have examples', () => {
  for (const weights of weightings(1, table.maxWeight)) {
    const { best, worst } = extremes(table, weights);
    assert.equal(best.unsure + worst.unsure, 0, JSON.stringify(weights));
    assert.ok(best.examples.length && worst.examples.length, JSON.stringify(weights));
  }
});

// The sliders run 0 to maxWeight, and the tally keeps examples for every end
// they can reach, so no setting but all-zero leaves an end with nothing to show.
test('every slider setting has examples at both ends', () => {
  for (const weights of weightings(0, table.maxWeight)) {
    if (Object.values(weights).every(w => w === 0)) continue;
    const { best, worst } = extremes(table, weights);
    assert.ok(best.examples.length && worst.examples.length, JSON.stringify(weights));
  }
});

test('one weight alone ranks by that metric, in its direction', () => {
  for (const name of NAMES) {
    const { best, worst } = extremes(table, { [name]: 1 });
    const [low, high] = table.ranges[name];
    const [good, bad] = DIRECTIONS[name] > 0 ? [high, low] : [low, high];
    assert.ok(best.rows.every(r => r[name] === good), `${name} best`);
    assert.ok(worst.rows.every(r => r[name] === bad), `${name} worst`);
    assert.ok(best.examples.length && worst.examples.length, name);
  }
});

test('with no weight at all, everything ties, read or not', () => {
  const { best, worst } = extremes(table, {});
  assert.equal(best.count, table.legal);
  assert.equal(worst.count, table.legal);
});
