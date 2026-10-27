// The crossed sweep's scores as a histogram (scripts/score-histogram.js), which a
// builder's closed loop is judged against. Its population is rank-tracks.js's, so
// its ends are the ranked file's best and worst, at the same weights.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SWEEP_CROSSED_RANKED as ranked, SWEEP_CROSSED_SCORES as scores } from '../site/src/lib/sweeps.js';

test('its counts are its population, one bar per score in order', () => {
  assert.equal(scores.counts.reduce((sum, [, n]) => sum + n, 0), scores.population);
  const at = scores.counts.map(([score]) => score);
  assert.deepEqual(at, [...new Set(at)].sort((a, b) => a - b));
  assert.ok(scores.counts.every(([score, n]) => Number.isInteger(score) && n > 0));
});

test('its ends are the ranked file\'s, at the same weights', () => {
  assert.deepEqual(scores.weights, ranked.weights);
  assert.equal(scores.counts[0][0], ranked.worst[0].score);
  assert.equal(scores.counts.at(-1)[0], ranked.best[0].score);
});

test('it holds every unmirrored legal layout, and no more than the legal ones', () => {
  assert.ok(scores.population <= ranked.legal);
  assert.ok(2 * scores.population >= ranked.legal);
});
