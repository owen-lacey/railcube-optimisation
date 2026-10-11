// The crossed sweep's best and worst layouts under equal weights, as the post's
// opening of Optimising shows them.
//
// The ranking is a claim about sweeps.db, which a fresh clone does not have, so
// what can be checked here is the file itself: every layout re-chained, spending
// the inventory, on the floor, its score recomputed from its own readings, and
// the two lists in order. That nothing in the database beats them is
// scripts/rank-tracks.js's job, which reads every row. The knots are taken as
// stored here; the script re-read each on a fresh rotation, and re-reading them
// spawns `uv`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chainTrack, countPieces, POOLS } from '../src/track.js';
import { routeOf } from '../src/layouts.js';
import { closeCallsOf, metricsOf, posesOf, spanOf } from '../src/metrics.js';
import { SWEEP_CROSSED_RANKED as ranked, SWEEP_CROSSED_WEIGHTS as table } from '../site/src/lib/sweeps.js';
import { DIRECTIONS, extremes, weigher } from '../site/src/lib/weighting.js';

const NAMES = Object.keys(DIRECTIONS);
const { score, scale } = weigher(ranked.ranges);

test('ranked over the weights file, at equal weights', () => {
  assert.deepEqual(ranked.ranges, table.ranges);
  assert.deepEqual(ranked.question, table.question);
  assert.deepEqual(ranked.weights, Object.fromEntries(NAMES.map(name => [name, 1])));
  assert.equal(ranked.best.length, 10);
  assert.equal(ranked.worst.length, 10);
});

test('every layout is legal, spends the inventory, and scores what it says', () => {
  for (const { shape, knot, score: stored } of [...ranked.best, ...ranked.worst]) {
    const placed = chainTrack(routeOf(shape));
    const spent = countPieces(placed);
    for (const pool of POOLS) assert.equal(spent[pool], ranked.question.inventory[pool], `${shape} ${pool}`);
    assert.ok(placed.every(p => p.cell[1] >= 0), `${shape} goes below the floor`);
    const values = {
      knotted: Number(knot !== 'unknot'),
      poses: posesOf(placed),
      closeCalls: closeCallsOf(placed),
      repeats: metricsOf(placed).repeats,
      longestSide: Math.max(...spanOf(placed)),
    };
    assert.equal(score(values, ranked.weights) / scale, stored, shape);
  }
});

test('the best are in order, the worst are in order, and every best beats every worst', () => {
  const scores = list => list.map(t => t.score);
  const best = scores(ranked.best);
  const worst = scores(ranked.worst);
  best.slice(1).forEach((s, i) => assert.ok(s <= best[i], `best ${i + 1} out of order`));
  worst.slice(1).forEach((s, i) => assert.ok(s >= worst[i], `worst ${i + 1} out of order`));
  assert.ok(Math.min(...best) > Math.max(...worst));
});

test('the ends are the weighted tracks\' ends at their default sliders', () => {
  const ends = extremes(table, ranked.weights);
  assert.equal(ranked.best[0].score, ends.best.score);
  assert.equal(ranked.worst[0].score, ends.worst.score);
});

test('no layout twice', () => {
  const all = [...ranked.best, ...ranked.worst];
  assert.equal(new Set(all.map(t => t.id)).size, all.length);
  assert.equal(new Set(all.map(t => t.shape)).size, all.length);
});
