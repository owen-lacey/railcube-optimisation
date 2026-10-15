// The crossed sweep's weighted best and worst: every slider setting's ten best
// and ten worst combinations, and the ends read off them.
//
// The file is a claim about sweeps.db, which a fresh clone does not have, so what
// can be checked here is the file itself: every sample is re-chained and
// recounted to the row it stands for, and ranking the rows gives what a plain
// sort of them gives. That they are every setting's ends over the whole database
// is scripts/tally-weights.js's job, which reads every row. Knots are recounted in
// the slow tier only: it spawns `uv`, and the tally has already re-read each one.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chainTrack } from '../src/track.js';
import { routeOf } from '../src/layouts.js';
import { knotInput, knotReader } from '../scripts/knot-curves.js';
import { knotOf } from '../site/src/lib/knots.js';
import { readingsOf } from '../site/src/lib/readings.js';
import { SWEEP_CROSSED_WEIGHTS as table } from '../site/src/lib/sweeps.js';
import { DIRECTIONS, ends, weigher } from '../site/src/lib/weighting.js';

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

const NAMES = Object.keys(DIRECTIONS);

/** Every slider setting, all-zero included. */
function* settings() {
  const n = table.maxWeight + 1;
  for (let w = 0; w < n ** NAMES.length; w++) {
    yield Object.fromEntries(NAMES.map((name, i) => [name, Math.floor(w / n ** i) % n]));
  }
}

test('every sample recounts to its row, on the floor, its knot as filed', () => {
  assert.ok(table.rows.length > 0);
  for (const row of table.rows) {
    const values = readingsOf(row.shape);
    assert.deepEqual(NAMES.map(name => values[name]), NAMES.map(name => row[name]), row.shape);
    assert.equal(values.knot, row.knot, row.shape);
    assert.ok(chainTrack(routeOf(row.shape)).every(p => p.cell[1] >= 0), `${row.shape} goes below the floor`);
  }
});

slow('every sample\'s knot reads as filed', async () => {
  const reader = knotReader();
  const polys = await reader.read(table.rows.map(({ shape }, i) => ({
    id: i, seed: i, ...knotInput(chainTrack(routeOf(shape))) })));
  await reader.close();
  table.rows.forEach(({ shape, knot }, i) => assert.equal(knotOf(polys[i].over, polys[i].under), knot, shape));
});

test('the rows are distinct and set the ranges', () => {
  const keys = table.rows.map(r => NAMES.map(name => r[name]).join(','));
  assert.equal(new Set(keys).size, keys.length, 'a row appears twice');
  assert.equal(new Set(table.rows.map(r => r.shape)).size, table.rows.length, 'a sample appears twice');
  assert.ok(table.legal <= table.population);
  for (const name of NAMES) {
    const values = table.rows.map(r => r[name]);
    assert.deepEqual(table.ranges[name], [Math.min(...values), Math.max(...values)], name);
  }
});

test('ends are a sort of the rows by score, ties alphabetical, under every slider setting', () => {
  const { score, scale } = weigher(table.ranges);
  const alphabetical = (a, b) => (a.shape < b.shape ? -1 : 1);
  for (const weights of settings()) {
    const scored = table.rows.map(row => ({ row, score: score(row, weights) }));
    const best = scored.toSorted((a, b) => b.score - a.score || alphabetical(a.row, b.row));
    const worst = scored.toSorted((a, b) => a.score - b.score || alphabetical(a.row, b.row));
    const scaled = list => list.slice(0, table.count).map(({ row, score: s }) => ({ row, score: s / scale }));
    assert.deepEqual(ends(table, weights), { best: scaled(best), worst: scaled(worst) }, JSON.stringify(weights));
  }
});

test('every slider setting has its count at both ends', () => {
  for (const weights of settings()) {
    const { best, worst } = ends(table, weights);
    assert.equal(best.length, table.count, JSON.stringify(weights));
    assert.equal(worst.length, table.count, JSON.stringify(weights));
  }
});

test('one weight alone ranks by that metric, in its direction', () => {
  for (const name of NAMES) {
    const { best, worst } = ends(table, { [name]: 1 });
    const [low, high] = table.ranges[name];
    const [good, bad] = DIRECTIONS[name] > 0 ? [high, low] : [low, high];
    assert.equal(best[0].row[name], good, `${name} best`);
    assert.equal(worst[0].row[name], bad, `${name} worst`);
  }
});
