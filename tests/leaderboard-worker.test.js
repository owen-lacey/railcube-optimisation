// The leaderboard Worker (worker/index.js), run by wrangler over a throwaway local
// D1 that the real migrations are applied to. What it must do beyond `assess` (tests/submission.test.js):
// keep one row per physical track for its first submitter, rank by strictly higher
// scores, never serve the notes, and answer only the pages it lists.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unstable_startWorker } from 'wrangler';

import { SWEEP_CROSSED_RANKED as ranked } from '../site/src/lib/sweeps.js';

const CONFIG = 'worker/wrangler.jsonc';
const ORIGIN = 'http://localhost:5173';
const persist = mkdtempSync(join(tmpdir(), 'leaderboard-'));
let worker;

before(async () => {
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'railcube-leaderboard',
    '--local', '--persist-to', persist, '--config', CONFIG], { stdio: 'ignore' });
  worker = await unstable_startWorker({
    config: CONFIG,
    dev: { persist, server: { port: 0 }, inspector: false, watch: false },
  });
  await worker.ready;
});

after(async () => {
  await worker.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const post = async body => {
  const response = await worker.fetch('http://worker/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const board = async id => (await worker.fetch(`http://worker/leaderboard?id=${id}`)).json();

test('scores a submission itself, ignoring any score sent', async () => {
  const { shape, score } = ranked.best[0];
  const { status, body } = await post({ shape, notes: 'first', score: 999 });
  assert.equal(status, 200);
  assert.equal(body.score, score);
  assert.equal(body.rank, 1);
  assert.equal(body.duplicate, false);
});

test('a track already on the board stays its first submitter\'s', async () => {
  const first = await post({ shape: 'SLLSLL' });
  const again = await post({ shape: 'LLSLLS', notes: 'mine now' });
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.id, first.body.id);
  assert.equal(again.body.shape, 'SLLSLL');
});

test('ranks by strictly higher scores, earlier first within a tie, notes never served', async () => {
  await post({ shape: 'LLLL' });
  await post({ shape: 'RRRR' });
  const { body: entry } = await post({ shape: 'SSLLSSLL' });
  const { total, top, entry: served } = await board(entry.id);
  assert.equal(total, 5);
  assert.deepEqual(top.map(row => row.score), [...top.map(row => row.score)].sort((a, b) => b - a));
  for (const row of top) {
    assert.equal(row.rank, 1 + top.filter(other => other.score > row.score).length);
    assert.equal('notes' in row, false);
  }
  const ties = top.filter(row => row.shape === 'LLLL' || row.shape === 'RRRR');
  assert.deepEqual(ties.map(row => row.shape), ['LLLL', 'RRRR']);
  assert.deepEqual(served, top.find(row => row.id === entry.id));
});

test('refuses what is not a track, and notes past the limit', async () => {
  assert.equal((await post({ shape: 'SSS' })).status, 422);
  assert.equal((await post({ shape: 'SSSSSSSSLLSSSSSSSSLL' })).status, 422);
  assert.equal((await post({ shape: 'LLLL', notes: 'x'.repeat(1001) })).status, 422);
  assert.equal((await post({ shape: 42 })).status, 400);
});

test('answers only the pages it lists', async () => {
  const asked = origin => worker.fetch('http://worker/submissions', { method: 'OPTIONS', headers: { Origin: origin } });
  const allowed = await asked(ORIGIN);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const refused = await asked('https://elsewhere.example');
  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get('Access-Control-Allow-Origin'), null);
});
