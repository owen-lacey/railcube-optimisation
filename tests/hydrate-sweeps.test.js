// scripts/hydrate-sweeps.js against throwaway databases: a row merged before the
// readings were columns gets them, a row whose geometry has drifted stops the
// pass, and the knots are read and re-read.
//
// The knot cases spawn `uv`, which the rest of the suite does not need.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LAYOUTS, routeOf } from '../src/layouts.js';
import { chainTrack } from '../src/track.js';
import { spanOf } from '../src/metrics.js';
import { openDb } from '../scripts/sweep-data.js';
import { audit, mergePass } from '../scripts/merge-sweeps.js';
import { knotPool } from '../scripts/knot-curves.js';

const SCRIPT = new URL('../scripts/hydrate-sweeps.js', import.meta.url).pathname;
const TREFOIL = 'SRISOIRSIRXILSIIOSLISSOSSLSLSSOSXRSI';
const config = {
  inventory: { straight: 14, cross: 1, leftCurve: 4, rightCurve: 4, insideCurve: 8, outsideCurve: 4 },
  steps: 36, box: 8, minY: 0, startPose: 'DF', minLoopLength: null,
};
const READINGS = ['faces', 'repeats', 'poses', 'close_calls', 'underground'];

// The merge reads knots on the way in, which oldDb then blanks.
const knots = knotPool({ readers: 1 });
after(() => knots.close());

/** A database holding these shapes, with every reading and knot blanked as an old row's would be. */
async function oldDb(shapes) {
  const dir = mkdtempSync(join(tmpdir(), 'hydrate-sweeps-'));
  const path = join(dir, 'sweeps.db');
  const db = openDb(path);
  const log = join(dir, 'sweep-crossed-test.jsonl');
  for (const shape of shapes) {
    appendFileSync(log, `${JSON.stringify({
      shape, score: 56, cubes: 35, revisits: 1, config,
      span: spanOf(chainTrack(routeOf(shape))).join('x'),
    })}\n`);
  }
  await mergePass({ db, logs: [log], knots, admit: true, say: () => {}, settle: 0 });
  db.exec(`UPDATE layouts SET ${[...READINGS, 'knot_over', 'knot_under'].map(c => `${c} = NULL`).join(', ')}`);
  return { db, path };
}

const run = (path, ...flags) => spawnSync('node', [SCRIPT, '--db', path, ...flags], { encoding: 'utf8' });
const columns = (db, names) => db.prepare(`SELECT ${names.join(', ')} FROM layouts ORDER BY id`).raw().all();

test('--readings fills what an old row lacks, and the audit then passes', async () => {
  const { db, path } = await oldDb([LAYOUTS.crossed.shape, TREFOIL]);
  assert.notEqual(audit(db, () => {}), 0);
  const { status, stderr } = run(path, '--readings');
  assert.equal(status, 0, stderr);
  assert.deepEqual(columns(db, READINGS)[0], [5, 5, 11, 7, 0]);
  const said = [];
  assert.equal(audit(db, s => said.push(s)), 0, said.join('\n'));
});

test('--readings stops on a row whose geometry has drifted, and writes nothing from its batch', async () => {
  const { db, path } = await oldDb([LAYOUTS.crossed.shape, TREFOIL]);
  db.exec('UPDATE layouts SET volume = volume + 1 WHERE id = 2');
  const { status, stderr } = run(path, '--readings');
  assert.notEqual(status, 0);
  assert.match(stderr, /volume stored/);
  assert.deepEqual(columns(db, ['poses']), [[null], [null]]);
});

test('--knots reads both passes of the cross, and --recheck agrees with it', async () => {
  const { db, path } = await oldDb([LAYOUTS.crossed.shape, TREFOIL]);
  execFileSync('node', [SCRIPT, '--db', path, '--knots']);
  assert.deepEqual(columns(db, ['knot_over', 'knot_under']), [['1', '1'], ['1 -1 1', '1']]);
  const { status, stdout, stderr } = run(path, '--recheck', '2', '--seed', '1');
  assert.equal(status, 0, stderr);
  assert.match(stdout, /2 rows read again \(1 knotted\), 0 disagree/, stdout);
});

test('--recheck says when a stored knot reads differently', async () => {
  const { db, path } = await oldDb([LAYOUTS.crossed.shape, TREFOIL]);
  execFileSync('node', [SCRIPT, '--db', path, '--knots']);
  db.exec(`UPDATE layouts SET knot_over = '1' WHERE shape = '${TREFOIL}'`);
  db.exec(`UPDATE layouts SET knot_under = '1 -1 1' WHERE shape = '${LAYOUTS.crossed.shape}'`);
  const { status, stdout } = run(path, '--recheck', '2', '--seed', '1');
  assert.equal(status, 1);
  assert.match(stdout, /stored unknot \/ trefoil, read again as unknot \/ unknot/);
});

test('--knots --front reads what an end can turn on, here both rows', async () => {
  const { db, path } = await oldDb([LAYOUTS.crossed.shape, TREFOIL]);
  execFileSync('node', [SCRIPT, '--db', path, '--readings']);
  const { status, stdout, stderr } = run(path, '--knots', '--front', '--readers', '2');
  assert.equal(status, 0, stderr);
  assert.match(stdout, /front read: 2 rows this run/);
  assert.deepEqual(columns(db, ['knot_over', 'knot_under']), [['1', '1'], ['1 -1 1', '1']]);
});
