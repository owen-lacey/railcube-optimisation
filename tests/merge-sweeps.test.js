// scripts/merge-sweeps.js, against throwaway databases and logs.
//
// The question here is mostly the model's 18-cube set, because it has
// independent answers to hand: `set` and `setOnNativeOrTools` are two different
// tracks for it, and `LLIIROORLSLROOSRII` is a third. A shifted copy of `set` is
// the same track under another string — the duplicate an exact match would let
// through. The crossed columns need a crossed layout, and `crossed` is one that
// answers the crossed sweep's own question.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chainTrack, SCORES } from '../src/track.js';
import { LAYOUTS, routeOf } from '../src/layouts.js';
import { spanOf } from '../src/metrics.js';
import { eachStaged, openDb } from '../scripts/sweep-data.js';
import { audit, mergePass } from '../scripts/merge-sweeps.js';

const SET = LAYOUTS.set.shape;
const NATIVE = LAYOUTS.setOnNativeOrTools.shape;
const THIRD = 'LLIIROORLSLROOSRII';
const SHIFTED = SET.slice(5) + SET.slice(0, 5);

const scoreOf = inventory => Object.entries(inventory).reduce((t, [k, n]) => t + (SCORES[k] ?? 0) * n, 0);
const config = { inventory: LAYOUTS.set.set, box: 6, minY: 0, startPose: 'DF', minLoopLength: null };

const recordOf = (shape, extra = {}) => ({
  shape, score: scoreOf(config.inventory), cubes: 18,
  span: spanOf(chainTrack(routeOf(shape))).join('x'), config, ...extra,
});
const line = record => `${JSON.stringify(record)}\n`;

const quiet = () => {};
const readAll = path => { const all = []; eachStaged(path, r => all.push(r)); return all; };

// No sweep is appending to a throwaway log, so a claim need not settle.
const merge = options => mergePass({ say: quiet, settle: 0, ...options });
const shapesIn = db => db.prepare('SELECT shape FROM layouts ORDER BY shape').all().map(r => r.shape);

/** A fresh database and a directory to put logs beside it. */
function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'merge-sweeps-'));
  const db = openDb(join(dir, 'sweeps.db'));
  const write = (name, records) => {
    const log = join(dir, name);
    writeFileSync(log, records.map(line).join(''));
    return log;
  };
  return { dir, db, write };
}

/** A database holding `set` under its question, and a log holding `records`. */
function fixture(records) {
  const files = fresh();
  merge({ db: files.db, logs: [files.write('seed.jsonl', [recordOf(SET)])], admit: true });
  return { ...files, log: files.write('sweep-set.jsonl', records) };
}

const pass = ({ db, log }) => merge({ db, logs: [log] });

test('a new track is inserted', () => {
  const files = fixture([recordOf(NATIVE)]);
  assert.equal(pass(files).inserted, 1);
  assert.deepEqual(shapesIn(files.db), [NATIVE, SET].sort());
});

test('an exact repeat and a shifted repeat are both refused', () => {
  const files = fixture([recordOf(SET), recordOf(SHIFTED)]);
  assert.deepEqual(pass(files), { inserted: 0, duplicate: 1, known: 1, unmatched: 0 });
  assert.deepEqual(shapesIn(files.db), [SET]);
});

test('a duplicate is logged once, however many passes see it', () => {
  // A restarted sweep forgets what its drained log held, and logs it again.
  const files = fixture([recordOf(SHIFTED)]);
  const duplicates = join(files.dir, 'sweep-duplicates.jsonl');
  merge({ db: files.db, logs: [files.log], duplicates });
  files.write('sweep-set.jsonl', [recordOf(SHIFTED)]);
  merge({ db: files.db, logs: [files.log], duplicates });
  const logged = readAll(duplicates);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].shape, SHIFTED);
  assert.equal(logged[0].twin, SET);
  assert.equal(logged[0].log, files.log);
});

test('two new strings for one new track insert once', () => {
  const files = fixture([recordOf(THIRD), recordOf(THIRD.slice(3) + THIRD.slice(0, 3))]);
  assert.deepEqual(pass(files), { inserted: 1, duplicate: 1, known: 0, unmatched: 0 });
});

test('a layout for another question goes nowhere', () => {
  const files = fixture([recordOf(NATIVE, { config: { ...config, box: 7 } })]);
  assert.equal(pass(files).unmatched, 1);
  assert.deepEqual(shapesIn(files.db), [SET]);
});

test('a layout for another question is set aside, and --new-question admits it, once', () => {
  const { dir, db, write } = fresh();
  const log = write('sweep-set.jsonl', [recordOf(SET), recordOf(NATIVE)]);
  const unmatched = join(dir, 'sweep-unmatched.jsonl');
  assert.equal(merge({ db, logs: [log] }).unmatched, 2);
  assert.ok(!existsSync(log));
  assert.deepEqual(readAll(unmatched).map(r => r.shape), [SET, NATIVE]);
  assert.equal(merge({ db, logs: [unmatched], admit: true }).inserted, 2);
  assert.ok(!existsSync(unmatched));
  const questions = db.prepare('SELECT * FROM questions').all();
  assert.equal(questions.length, 1);
  assert.equal(questions[0].cubes, 18);
  assert.equal(questions[0].score, scoreOf(config.inventory));
});

test('a merged log is drained, and nothing is left of it', () => {
  const files = fixture([recordOf(NATIVE)]);
  pass(files);
  assert.ok(!existsSync(files.log));
  assert.ok(!existsSync(`${files.log}.claimed`));
});

test('a log merged twice writes nothing the second time', () => {
  const files = fixture([recordOf(NATIVE), recordOf(THIRD)]);
  pass(files);
  const before = files.db.prepare('SELECT * FROM layouts ORDER BY id').all();
  files.write('sweep-set.jsonl', [recordOf(NATIVE), recordOf(THIRD)]);
  assert.deepEqual(pass(files), { inserted: 0, duplicate: 0, known: 2, unmatched: 0 });
  assert.deepEqual(files.db.prepare('SELECT * FROM layouts ORDER BY id').all(), before);
});

test('a log that disagrees with the geometry stops the pass, keeps nothing from it, and is kept', () => {
  // NATIVE is good and comes first: a pass is one transaction, so it goes too.
  const files = fixture([recordOf(NATIVE), recordOf(THIRD, { span: '1x1x1' })]);
  assert.throws(() => pass(files), /logged as 1x1x1/);
  assert.deepEqual(shapesIn(files.db), [SET]);
  assert.equal(readAll(`${files.log}.claimed`).length, 2);
});

test('a claimed log that ends part-way through a record stops the pass, and is kept', () => {
  const files = fixture([recordOf(NATIVE)]);
  appendFileSync(files.log, line(recordOf(THIRD)).trimEnd());
  assert.throws(() => pass(files), /part-way through a record/);
  assert.deepEqual(shapesIn(files.db), [SET]);
  assert.ok(existsSync(`${files.log}.claimed`));
});

test('a claim left by a failed pass is merged before its live log is claimed again', () => {
  const files = fixture([recordOf(THIRD)]);
  writeFileSync(`${files.log}.claimed`, line(recordOf(NATIVE)));
  assert.equal(pass(files).inserted, 1);
  assert.deepEqual(shapesIn(files.db), [NATIVE, SET].sort());
  assert.deepEqual(readAll(files.log).map(r => r.shape), [THIRD]);
  assert.equal(pass(files).inserted, 1);
  assert.ok(!existsSync(files.log));
});

test('a log bigger than one read is read whole', () => {
  // Past the 16 MB chunk, so records straddle a boundary; exact repeats cost
  // an index lookup each.
  const copies = Math.ceil((1 << 25) / line(recordOf(SET)).length);
  const files = fixture(Array.from({ length: copies }, () => recordOf(SET)));
  appendFileSync(files.log, line(recordOf(NATIVE)));
  assert.deepEqual(pass(files), { inserted: 1, duplicate: 0, known: copies, unmatched: 0 });
});

test('the database refuses a second copy of a track, even past the script', () => {
  const files = fixture([]);
  assert.throws(() => files.db.prepare(`INSERT INTO layouts (question_id, shape, track_hash,
    span_across, span_up, span_along, volume, revisits, source_log, merged_at)
    SELECT question_id, ?, track_hash, span_across, span_up, span_along, volume, revisits,
    source_log, merged_at FROM layouts`).run(SHIFTED), /UNIQUE/);
});

// The crossed sweep's question, and a layout that answers it with its mirror.
const CROSSED = LAYOUTS.crossed.shape;
const MIRROR = [...CROSSED].map(l => ({ L: 'R', R: 'L' }[l] ?? l)).join('');
const crossedConfig = {
  inventory: { straight: 14, cross: 1, leftCurve: 4, rightCurve: 4, insideCurve: 8, outsideCurve: 4 },
  steps: 36, box: 8, minY: 0, startPose: 'DF', minLoopLength: null,
};
const crossedRecord = (shape, mirrored) => ({
  shape, mirrored, score: scoreOf(crossedConfig.inventory), cubes: 35, revisits: 1,
  span: spanOf(chainTrack(routeOf(shape))).join('x'), config: crossedConfig,
});

function crossedDb() {
  const { db, write } = fresh();
  const log = write('sweep-crossed-test.jsonl', [crossedRecord(CROSSED, false), crossedRecord(MIRROR, true)]);
  merge({ db, logs: [log], admit: true });
  return db;
}

test('a crossed layout is stored with every column the geometry decides', () => {
  const db = crossedDb();
  const row = db.prepare('SELECT * FROM layouts WHERE shape = ?').get(CROSSED);
  const span = spanOf(chainTrack(routeOf(CROSSED)));
  assert.deepEqual([row.span_across, row.span_up, row.span_along], span);
  assert.equal(row.volume, span[0] * span[1] * span[2]);
  assert.equal(row.revisits, 1);
  // The two X's are letters 2 and 8 of 36: loops of 6 and 30, countable by hand.
  assert.deepEqual([row.loop_small, row.loop_large], [6, 30]);
  // faces, repeats, poses, close calls, steps below the floor; tests/metrics.test.js
  // checks the readings themselves.
  assert.deepEqual([row.faces, row.repeats, row.poses, row.close_calls, row.underground], [5, 5, 11, 7, 0]);
  // Knots are read by hydrate-sweeps.js, never on the way in.
  assert.deepEqual([row.knot_over, row.knot_under], [null, null]);
  assert.equal(row.mirrored, 0);
  assert.equal(db.prepare('SELECT mirrored FROM layouts WHERE shape = ?').get(MIRROR).mirrored, 1);
  assert.equal(row.source_log, 'sweep-crossed-test.jsonl');
  assert.ok(!Number.isNaN(Date.parse(row.merged_at)), `${row.merged_at} is not a time`);
});

test('an uncrossed layout has no loops and no mirror flag', () => {
  const { db } = fixture([]);
  const row = db.prepare('SELECT * FROM layouts').get();
  assert.deepEqual([row.revisits, row.loop_small, row.loop_large, row.mirrored], [0, null, null, null]);
});

test('the audit passes a clean database', () => {
  assert.equal(audit(crossedDb(), quiet), 0);
  assert.equal(audit(fixture([recordOf(NATIVE)]).db, quiet), 0);
});

test('the audit catches a column that has drifted from the geometry', () => {
  const db = crossedDb();
  db.prepare('UPDATE layouts SET volume = volume + 1 WHERE shape = ?').run(CROSSED);
  const said = [];
  assert.equal(audit(db, s => said.push(s)), 1);
  assert.ok(said.some(s => s.includes(CROSSED) && s.includes('volume')), said.join('\n'));
});

test('the audit catches a stale track key', () => {
  const db = crossedDb();
  db.prepare('UPDATE layouts SET track_hash = zeroblob(32) WHERE shape = ?').run(MIRROR);
  const said = [];
  assert.equal(audit(db, s => said.push(s)), 1);
  assert.ok(said.some(s => s.includes(MIRROR) && s.includes('stale track_hash')), said.join('\n'));
});

// A second answer to the crossed question, out of a meet-in-the-middle log,
// merged without the mirror that run logged beside it.
const LONE = 'SRSISIIOXIOSLOISLSSSSSLSLRXORISIRSIS';

test('the audit catches a layout whose mirror is missing', () => {
  const db = crossedDb();
  const { write } = fresh();
  merge({ db, logs: [write('sweep-crossed-lone.jsonl', [crossedRecord(LONE, false)])] });
  const said = [];
  assert.ok(audit(db, s => said.push(s)) > 0);
  assert.ok(said.some(s => s.includes(`${LONE} has no mirror`)), said.join('\n'));
});

test('the audit reads one snapshot, whatever a watch writes while it runs', () => {
  // A drifted column makes the audit speak mid-pass, and that is the moment a
  // second connection merges a lone original. Seen, it would be two more faults:
  // no mirror, and originals no longer half the rows.
  const db = crossedDb();
  db.prepare('UPDATE layouts SET volume = volume + 1 WHERE shape = ?').run(CROSSED);
  const writer = openDb(db.name);
  const { write } = fresh();
  const log = write('sweep-crossed-lone.jsonl', [crossedRecord(LONE, false)]);
  let wrote = false;
  const faults = audit(db, s => {
    if (wrote || !s.includes('volume')) return;
    wrote = merge({ db: writer, logs: [log] }).inserted === 1;
  });
  assert.ok(wrote, 'the lone original was not merged mid-audit');
  assert.equal(faults, 1);
});
