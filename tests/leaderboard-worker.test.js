// The leaderboard Worker (worker/index.js), run by wrangler over a throwaway local
// D1 that the real migrations are applied to. What it must do beyond `assess` (tests/submission.test.js):
// keep one row per physical track for its first submitter, let only that submitter
// sign it, rank by strictly higher scores, never serve the notes, and answer only
// the pages it lists.

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
const patch = async (id, body) => {
  const response = await worker.fetch(`http://worker/submissions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const board = async (id, limit) => (await worker.fetch(
  `http://worker/leaderboard?id=${id}${limit ? `&limit=${limit}` : ''}`)).json();

test('scores a submission itself, ignoring any score sent', async () => {
  const { shape, score } = ranked.best[0];
  const { status, body } = await post({ shape, score: 999 });
  assert.equal(status, 200);
  assert.equal(body.score, score);
  assert.equal(body.rank, 1);
  assert.equal(body.duplicate, false);
  assert.equal(body.name, null);
  assert.equal(typeof body.token, 'string');
});

test('a track already on the board stays its first submitter\'s', async () => {
  const first = await post({ shape: 'SLLSLL' });
  const again = await post({ shape: 'LLSLLS' });
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.id, first.body.id);
  assert.equal(again.body.shape, 'SLLSLL');
  assert.equal('token' in again.body, false);
});

test('only the token a submission was handed signs it, and a name is required', async () => {
  const { body: { id, token } } = await post({ shape: 'RSRRSR' });
  assert.equal((await patch(id, { token: 'not it', name: 'Mallory' })).status, 403);
  assert.equal((await patch(id, { token, name: '   ' })).status, 422);
  assert.equal((await patch(id, { token, name: 'x'.repeat(41) })).status, 422);
  assert.equal((await patch(id, { token, name: 'Ada', notes: 'x'.repeat(1001) })).status, 422);
  const signed = await patch(id, { token, name: '  Ada  ', notes: 'private' });
  assert.equal(signed.status, 200);
  assert.equal(signed.body.name, 'Ada');
  assert.equal('notes' in signed.body, false);
  assert.equal((await board(id)).entry.name, 'Ada');
});

test('ranks by strictly higher scores, earlier first within a tie, notes never served', async () => {
  await post({ shape: 'LLLL' });
  await post({ shape: 'RRRR' });
  const { body: entry } = await post({ shape: 'SSLLSSLL' });
  const { total, top, entry: served, histogram } = await board(entry.id);
  assert.equal(total, 6);
  assert.equal(histogram.reduce((sum, [, count]) => sum + count, 0), total);
  assert.deepEqual(histogram.map(([score]) => score), [...histogram.map(([score]) => score)].sort((a, b) => a - b));
  assert.deepEqual(top.map(row => row.score), [...top.map(row => row.score)].sort((a, b) => b - a));
  for (const row of top) {
    assert.equal(row.rank, 1 + top.filter(other => other.score > row.score).length);
    assert.equal('notes' in row, false);
  }
  const ties = top.filter(row => row.shape === 'LLLL' || row.shape === 'RRRR');
  assert.deepEqual(ties.map(row => row.shape), ['LLLL', 'RRRR']);
  assert.deepEqual(served, top.find(row => row.id === entry.id));
});

test('serves as many rows as asked, up to a hundred', async () => {
  assert.equal((await board(1, 2)).top.length, 2);
  const refused = await worker.fetch('http://worker/leaderboard?limit=0');
  assert.equal(refused.status, 400);
  assert.equal((await board(1, 1000)).top.length, 6);
});

test('refuses what is not a track', async () => {
  assert.equal((await post({ shape: 'SSS' })).status, 422);
  assert.equal((await post({ shape: 'SSSSSSSSLLSSSSSSSSLL' })).status, 422);
  assert.equal((await post({ shape: 42 })).status, 400);
});

test('answers only the pages it lists', async () => {
  const asked = origin => worker.fetch('http://worker/submissions', { method: 'OPTIONS', headers: { Origin: origin } });
  const allowed = await asked(ORIGIN);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(allowed.headers.get('Access-Control-Allow-Methods'), /PATCH/);
  const refused = await asked('https://elsewhere.example');
  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get('Access-Control-Allow-Origin'), null);
});
