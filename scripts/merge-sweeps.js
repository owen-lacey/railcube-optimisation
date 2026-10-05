// Move newly found layouts from sweep logs into the layout database, one row per
// physical track.
//
//   node scripts/merge-sweeps.js --check                    audit the database
//   node scripts/merge-sweeps.js sweep-crossed-min8.jsonl   one pass over some logs
//   node scripts/merge-sweeps.js --watch .                  keep passing as logs grow
//   node scripts/merge-sweeps.js --new-question log.jsonl   admit a question it lacks
//   --db <path>                                             another database (default sweeps.db)
//
// The logs are the staging area. A sweep appends to its own, and this reads
// them, finds the question in the database each record answers (see
// `questionOf` in scripts/sweep-data.js), and adds each layout the database does
// not already hold for it *as a track*: `trackKey` catches the same loop entered
// at a different piece and turned round in space, which an exact string match
// would let through, and its hash is a UNIQUE column, so a second copy cannot
// get in even past this script. A layout for a question the database does not
// hold is reported and left in its log; `--new-question` admits it.
//
// Every pass drains what it merges, so the database is the only copy of a
// layout once it is in. A pass claims each log by renaming it to `<log>.claimed`
// — the sweeps open their log afresh for every append, so the next one starts a
// new file — waits a moment for any append already under way, merges the claim
// in one transaction, and deletes it once that commits. A record the geometry
// disagrees with stops the pass, nothing from it is kept, and the claim stays
// on disk to be merged first next time, before its live log is claimed again. A
// record for a question the database does not hold goes to sweep-unmatched.jsonl
// beside its log, where `--new-question` can admit it. A pass is still
// idempotent — whatever the database already holds is skipped — so a claim
// merged twice writes nothing the second time.
//
// `--watch` is that pass re-run whenever a matching log changes. Run it in tmux;
// it is meant to sit beside a sweep. Every duplicate is also appended to
// sweep-duplicates.jsonl — the new shape, the log it came from, and the shape
// already held — once per shape.

import {
  appendFileSync, existsSync, readdirSync, renameSync, unlinkSync, watch,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCORES } from '../src/track.js';
import {
  assertSpends, DB_PATH, derive, eachStaged, openDb, questionOf, trackHash, verify,
} from './sweep-data.js';

// Gitignored with the sweep logs, and deliberately outside the crossed-log pattern
// the watch matches, so recording a duplicate never triggers a pass.
const DUPLICATES = 'sweep-duplicates.jsonl';

// Outside the crossed-log pattern for the same reason. It is a log like any
// other, so a pass over it drains it, and `--new-question` admits what it holds.
const UNMATCHED = 'sweep-unmatched.jsonl';

const CLAIMED = '.claimed';

// How long a claimed log is left before it is read. A sweep's append is one
// open, write and close, so this is far longer than any append takes.
const SETTLE_MS = 1000;

const statementsFor = db => ({
  question: db.prepare('SELECT * FROM questions WHERE question = ?'),
  addQuestion: db.prepare('INSERT INTO questions (question, cubes, score) VALUES (?, ?, ?)'),
  byShape: db.prepare('SELECT 1 FROM layouts WHERE question_id = ? AND shape = ?'),
  byTrack: db.prepare('SELECT shape FROM layouts WHERE question_id = ? AND track_hash = ?'),
  insert: db.prepare(`INSERT INTO layouts (question_id, shape, track_hash, span_across,
    span_up, span_along, volume, revisits, mirrored, loop_small, loop_large, faces, repeats,
    poses, close_calls, underground, source_log, merged_at) VALUES (@question_id, @shape,
    @track_hash, @span_across, @span_up, @span_along, @volume, @revisits, @mirrored,
    @loop_small, @loop_large, @faces, @repeats, @poses, @close_calls, @underground,
    @source_log, @merged_at)`),
});

/** The question row a record answers, admitted first if `admit` allows. */
function questionFor(sql, record, admit) {
  const text = JSON.stringify(questionOf(record.config));
  const held = sql.question.get(text);
  if (held !== undefined || !admit) return held;
  sql.addQuestion.run(text, record.cubes, record.score);
  return sql.question.get(text);
}

/** Add one record under the question it answers, or say why not. */
function offer(sql, record, question, log, say, found) {
  // An exact match costs an index lookup; only a new string pays for its key.
  if (sql.byShape.get(question.id, record.shape)) return 'known';
  const hash = trackHash(record.shape);
  const twin = sql.byTrack.get(question.id, hash);
  if (twin !== undefined) {
    say(`  dup     ${record.shape}  is ${twin.shape}`);
    found(twin.shape);
    return 'duplicate';
  }
  if (record.score !== question.score || record.cubes !== question.cubes) {
    throw new Error(`${record.shape} scores ${record.score} over ${record.cubes} cubes; `
      + `question ${question.id} holds ${question.score} over ${question.cubes}`);
  }
  sql.insert.run({
    ...verify(record, JSON.parse(question.question)),
    question_id: question.id,
    track_hash: hash,
    source_log: basename(log),
    merged_at: new Date().toISOString(),
  });
  say(`  new     ${record.shape}${record.mirrored ? '  (mirror)' : ''}`);
  return 'inserted';
}

/**
 * Duplicates go to their own log as well as the screen, because the screen is a
 * tmux pane whose scrollback an overnight sweep will outrun. One line per
 * duplicate string, ever: a restarted sweep forgets what its drained log held
 * and finds it again, so without checking what is already recorded it would be
 * written again.
 */
function duplicateLog(path, db) {
  if (path === null) return () => {};
  const recorded = new Set();
  if (existsSync(path)) eachStaged(path, r => recorded.add(r.shape));
  return (record, log, twin) => {
    if (recorded.has(record.shape)) return;
    recorded.add(record.shape);
    appendFileSync(path, `${JSON.stringify({
      shape: record.shape, log, twin, target: db.name, found: new Date().toISOString(),
    })}\n`);
  };
}

/**
 * Take a log off its sweep. A claim a failed pass left behind is merged before
 * the live log is claimed again, so nothing is ever renamed over.
 */
function claim(log) {
  const claimed = `${log}${CLAIMED}`;
  if (existsSync(claimed)) return { log, claimed, renamed: false };
  if (!existsSync(log)) return null;
  renameSync(log, claimed);
  return { log, claimed, renamed: true };
}

const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * One pass: claim `logs`, offer every solved record under the question it
 * answers, in one transaction, then drain the claims. `settle` is how long a
 * fresh claim is left before it is read.
 */
export function mergePass({
  db, logs, admit = false, say = console.log, duplicates = null, settle = SETTLE_MS,
}) {
  const claims = logs.map(claim).filter(Boolean);
  if (claims.some(c => c.renamed)) pause(settle);
  const tally = mergeClaims({ db, claims, admit, say, duplicates });
  for (const { claimed } of claims) unlinkSync(claimed);
  return tally;
}

/**
 * A record no question holds is set aside as it is read rather than after the
 * pass, so a log of nothing else is never held in memory. A pass that fails
 * keeps its claim and sets the same records aside again next time, which a
 * merge of the unmatched log shrugs off as known.
 */
function setAside(log, record) {
  appendFileSync(join(dirname(log), UNMATCHED), `${JSON.stringify(record)}\n`);
}

function mergeClaims({ db, claims, admit, say, duplicates }) {
  const sql = statementsFor(db);
  const logDuplicate = duplicateLog(duplicates, db);
  const tally = { inserted: 0, duplicate: 0, known: 0, unmatched: 0 };
  const noted = new Set();

  db.transaction(() => {
    for (const { log, claimed } of claims) {
      eachStaged(claimed, record => {
        const question = questionFor(sql, record, admit);
        if (question !== undefined) {
          tally[offer(sql, record, question, log, say, twin => logDuplicate(record, log, twin))] += 1;
          return;
        }
        tally.unmatched += 1;
        setAside(log, record);
        const asked = JSON.stringify(questionOf(record.config));
        if (!noted.has(`${log}\n${asked}`)) say(`${log}: the database asks no ${asked}`);
        noted.add(`${log}\n${asked}`);
      });
    }
  })();
  return tally;
}

const flip = shape => [...shape].map(l => ({ L: 'R', R: 'L' }[l] ?? l)).join('');

// The knot columns are not here: re-reading them is hours of topoly, which
// `hydrate-sweeps.js --recheck` does on a sample instead.
const COLUMNS = ['span_across', 'span_up', 'span_along', 'volume', 'revisits', 'loop_small', 'loop_large',
  'faces', 'repeats', 'poses', 'close_calls', 'underground'];

/** What is wrong with one stored row, re-derived from its shape alone. */
function rowFaults(row, held, question) {
  const { placed, cubes, columns } = derive(row.shape);
  assertSpends(placed, question, row.shape);
  const faults = COLUMNS.filter(c => columns[c] !== row[c])
    .map(c => `${c} is stored as ${row[c]}, derived as ${columns[c]}`);
  if (cubes !== held.cubes) faults.push(`is ${cubes} cubes, not ${held.cubes}`);
  if (placed.length !== question.steps) faults.push(`is ${placed.length} steps, not ${question.steps}`);
  if (!trackHash(row.shape).equals(row.track_hash)) faults.push('has a stale track_hash');

  // `box` is the solver's own constraint: no material cell further than this from
  // the origin on any axis.
  const cells = placed.flatMap(p => p.material);
  const reach = Math.max(...cells.flatMap(c => c.map(Math.abs)));
  if (reach > question.box) faults.push(`reaches ${reach}, past a box of ${question.box}`);
  if (question.minY === 0 && cells.some(c => c[1] < 0)) faults.push('goes below the floor');
  return faults;
}

/**
 * A mirror is the left-right reflection of a layout under the same question,
 * and they come in pairs. Only questions whose logs flagged mirrors are held to
 * it: with nothing flagged, nothing is paired.
 */
function mirrorFaults(db, held) {
  const rows = db.prepare('SELECT shape, mirrored FROM layouts WHERE question_id = ?').all(held.id);
  if (!rows.some(r => r.mirrored === 1)) return [];
  const present = new Set(rows.map(r => r.shape));
  const originals = rows.filter(r => r.mirrored === 0);
  const faults = originals.filter(r => !present.has(flip(r.shape)))
    .map(r => `${r.shape} has no mirror`);
  if (originals.length * 2 !== rows.length) {
    faults.push(`${originals.length} originals are not half of ${rows.length} rows`);
  }
  return faults;
}

/**
 * Re-derive everything the database says from the shapes alone, and count
 * what disagrees. The UNIQUE constraints already hold each track once; this is
 * what catches a column, or a key, that has gone stale since it was written.
 *
 * One read transaction, so every query sees one snapshot. The audit takes
 * minutes and a watch keeps writing through it; without this, the mirror count
 * is taken over rows the per-row pass never saw, and disagrees with it.
 */
export function audit(db, say = console.log) {
  let faults = 0;
  const note = (what, list) => list.forEach(f => { faults += 1; say(`  ${what} ${f}`); });
  db.transaction(() => auditQuestions(db, say, note))();
  return faults;
}

function auditQuestions(db, say, note) {
  for (const held of db.prepare('SELECT * FROM questions').all()) {
    const question = JSON.parse(held.question);
    const cubes = Object.values(question.inventory).reduce((a, b) => a + b, 0);
    const score = Object.entries(question.inventory)
      .reduce((total, [type, n]) => total + (SCORES[type] ?? 0) * n, 0);
    if (cubes !== held.cubes) note(`question ${held.id}`, [`holds ${held.cubes} cubes, not ${cubes}`]);
    if (score !== held.score) note(`question ${held.id}`, [`scores ${held.score}, not ${score}`]);

    let rows = 0;
    for (const row of db.prepare('SELECT * FROM layouts WHERE question_id = ?').iterate(held.id)) {
      note(row.shape, rowFaults(row, held, question));
      rows += 1;
      if (rows % 10_000 === 0) say(`question ${held.id}: ${rows} audited`);
    }
    note(`question ${held.id}:`, mirrorFaults(db, held));
    say(`question ${held.id}: ${rows} layouts audited`);
  }
}

function report(tally) {
  console.log(`${tally.inserted} inserted, ${tally.duplicate} duplicate, `
    + `${tally.known} already held${tally.unmatched ? `, ${tally.unmatched} for no question` : ''}`);
}

function watchLogs(db, dir, match) {
  // A claim left by a failed pass is found by the log it came from, even when
  // that log has not been written to since.
  const logs = () => [...new Set(readdirSync(dir)
    .map(f => (f.endsWith(CLAIMED) ? f.slice(0, -CLAIMED.length) : f)))]
    .filter(f => match.test(f)).map(f => join(dir, f));
  const duplicates = join(dir, DUPLICATES);
  const pass = () => {
    const tally = mergePass({ db, logs: logs(), duplicates });
    if (tally.inserted || tally.duplicate) report(tally);
  };
  console.log(`watching ${dir} for ${match}, into ${db.name}, draining what it merges`);
  console.log(`duplicates to ${duplicates}`);
  report(mergePass({ db, logs: logs(), duplicates }));

  // Debounced: a sweep writes a layout and its mirror as two appends, and a
  // pass between them is harmless but a pass after both is one pass. Claiming a
  // log is itself a change to it, so a watch beside a running sweep keeps
  // passing, a second or two apart, over whatever arrived since.
  let timer = null;
  watch(dir, (_, file) => {
    if (!file || !match.test(file)) return;
    clearTimeout(timer);
    timer = setTimeout(pass, 1000);
  });
}

function main(argv) {
  const flag = name => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv.splice(i, 2)[1];
  };
  const toggle = name => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return false;
    argv.splice(i, 1);
    return true;
  };
  const db = openDb(flag('db') ?? DB_PATH);
  if (toggle('check')) process.exit(audit(db) ? 1 : 0);

  const dir = flag('watch');
  const match = new RegExp(flag('match') ?? '^sweep-crossed-.*\\.jsonl$');
  if (dir !== undefined) return watchLogs(db, dir, match);

  const admit = toggle('new-question');
  if (!argv.length) {
    console.error('usage: node scripts/merge-sweeps.js [--db <path>] --check | --watch <dir>'
      + ' [--match <regex>] | [--new-question] <sweep.jsonl…>');
    process.exit(2);
  }
  report(mergePass({ db, logs: argv, admit, duplicates: DUPLICATES }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
