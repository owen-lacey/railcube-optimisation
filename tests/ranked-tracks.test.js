// The crossed sweep's best and worst layouts under the post's weights, as the post's
// opening of Optimising shows them; and its best thousand, as the front page's
// leaderboard of the model's layouts lists them.
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

import { chainTrack, countPieces, PIECE_TYPES } from '../src/track.js';
import { routeOf } from '../src/layouts.js';
import { readingsOf } from '../site/src/lib/readings.js';
import { SWEEP_CROSSED_RANKED as ranked } from '../site/src/lib/sweeps/ranked.js';
import { SWEEP_CROSSED_WEIGHTS as table } from '../site/src/lib/sweeps/weights.js';
import { ends, scoreOf, termsOf, WEIGHTS } from '../site/src/lib/weighting.js';
import { rankRows } from '../site/src/lib/ranks.js';
import top from '../site/src/lib/data/sweep-crossed-top.json' with { type: 'json' };

/**
 * Every layout re-chained, spending the inventory, on the floor, and scoring what
 * it says, its knot looked up in the site's files unless `ownKnots` says to take
 * the list's own (the best thousand are loaded lazily, so no lookup carries them).
 */
function assertLegal(list, { ownKnots = false } = {}) {
  for (const { shape, knot, score: expected } of list) {
    const placed = chainTrack(routeOf(shape));
    const spent = countPieces(placed);
    for (const pool of PIECE_TYPES) assert.equal(spent[pool], ranked.question.inventory[pool], `${shape} ${pool}`);
    assert.ok(placed.every(p => p.cell[1] >= 0), `${shape} goes below the floor`);
    const values = ownKnots ? readingsOf(shape, knot) : readingsOf(shape);
    assert.equal(values.knot, knot, shape);
    assert.equal(scoreOf(values, ranked.weights), expected, shape);
    assert.equal(termsOf(values, ranked.weights).total, expected, shape);
  }
}

test('ranked over the weights file\'s question, at the post\'s weights', () => {
  assert.deepEqual(ranked.question, table.question);
  assert.deepEqual(ranked.weights, WEIGHTS);
  assert.equal(ranked.best.length, 100);
  assert.equal(ranked.worst.length, 100);
});

test('every layout is legal, spends the inventory, and scores what it says', () => {
  assertLegal([...ranked.best, ...ranked.worst]);
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
  const { best, worst } = ends(table, ranked.weights);
  assert.equal(ranked.best[0].score, best[0].score);
  assert.equal(ranked.worst[0].score, worst[0].score);
});

test('no layout twice', () => {
  const all = [...ranked.best, ...ranked.worst];
  assert.equal(new Set(all.map(t => t.id)).size, all.length);
  assert.equal(new Set(all.map(t => t.shape)).size, all.length);
});

test('the best thousand: the ranked file\'s question and weights, best end only', () => {
  assert.deepEqual(top.question, ranked.question);
  assert.deepEqual(top.weights, ranked.weights);
  assert.equal(top.legal, ranked.legal);
  assert.equal(top.best.length, 1000);
  assert.equal(top.worst, undefined);
});

test('the best thousand are legal, in order, and never twice', () => {
  assertLegal(top.best, { ownKnots: true });
  top.best.slice(1).forEach((t, i) => assert.ok(t.score <= top.best[i].score, `top ${i + 1} out of order`));
  assert.equal(new Set(top.best.map(t => t.id)).size, top.best.length);
  assert.equal(new Set(top.best.map(t => t.shape)).size, top.best.length);
});

test('the best thousand start with the ranked file\'s best hundred', () => {
  assert.deepEqual(top.best.slice(0, ranked.best.length), ranked.best);
});

test('the model\'s leaderboard ranks ties together, as the Worker does', () => {
  const rows = rankRows(top.best);
  rows.forEach((row, i) => {
    assert.equal(row.rank, 1 + top.best.filter(t => t.score > row.score).length, `row ${i}`);
    assert.equal(row.shape, top.best[i].shape);
  });
  assert.equal(new Set(rows.map(r => r.name)).size, rows.length);
  assert.ok(rows.every(r => r.name.length === rows[0].name.length));
});
