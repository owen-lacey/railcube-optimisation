// What a leaderboard submission is worth (site/src/lib/submission.js), which the
// Worker in worker/ trusts in place of anything a browser says. So it must score
// a track exactly as the post does, key it as sweeps.db does, and refuse anything
// that is not a track built from the crossed sweep's pieces.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assess, INVENTORY } from '../site/src/lib/submission.js';
import { SWEEP_CROSSED_RANKED as ranked } from '../site/src/lib/sweeps.js';
import { trackHash } from '../scripts/sweep-data.js';

test('scores the ranked layouts at their stored scores', async () => {
  for (const { shape, score } of [...ranked.best.slice(0, 10), ...ranked.worst.slice(0, 10)]) {
    assert.equal((await assess(shape)).score, score, shape);
  }
});

test('the inventory is the ranked question\'s', () => {
  assert.deepEqual(INVENTORY, ranked.question.inventory);
});

test('a track\'s hash is sweeps.db\'s, so a submission can be looked up there', async () => {
  const { shape } = ranked.best[0];
  assert.equal((await assess(shape)).hash, trackHash(shape).toString('hex'));
});

test('one physical track is one hash, wherever it is entered', async () => {
  assert.equal((await assess('SLLSLL')).hash, (await assess('LLSLLS')).hash);
  assert.notEqual((await assess('SLLSLL')).hash, (await assess('SSLLSSLL')).hash);
});

test('any closed loop counts, spent or not', async () => {
  // Four left curves of the four, and nothing else spent.
  const { readings } = await assess('LLLL');
  assert.equal(readings.poses, 4);
});

test('refuses an open route, a collision and an overspent pool', async () => {
  await assert.rejects(assess('SSS'), /does not close/);
  await assert.rejects(assess('LLLLLLLL'), /collision|collide/i);
  await assert.rejects(assess('SSSSSSSSLLSSSSSSSSLL'), /16 straight pieces, and there are only 14/);
});
