// Score every layout of a sweep on the readings in src/metrics.js, one JSON
// line per layout, for scripts/rank-scores.js to rank.
//
//   node scripts/score-sweeps.js --source 28 --out <file>
//   node scripts/score-sweeps.js --source crossed --out <file> [--from-id N] [--to-id N] [--limit N]
//
// `28` is the frozen site/src/lib/data/sweep-28.json; `crossed` is question 1 of
// sweeps.db, opened read-only — it is the only copy of those layouts, and
// `openDb` writes on open. Rows go in id order, so a killed scan resumes with
// `--from-id` one past the last id written, and a long one splits across cores by
// id range.
//
// Every shape is re-chained from the current start pose and its span checked
// against what the source stored, so a scan is also a cross-check of the source.
// `underground` counts the steps where the train is below the floor, riding under
// a cube on the ground: the solver no longer allows it, but both sweeps were
// made before it was ruled out, so the scan says which rows break the rule and
// rank-scores.js leaves them out.
// Lines are written a batch at a time, so a kill loses at most one batch.

import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { parseArgs } from 'node:util';

import Database from 'better-sqlite3';

import { chainTrack } from '../src/track.js';
import { routeOf } from '../src/layouts.js';
import { METRICS, metricsOf, spanOf } from '../src/metrics.js';
import { DB_PATH } from './sweep-data.js';

const SWEEP_28 = new URL('../site/src/lib/data/sweep-28.json', import.meta.url);
const QUESTION = 1;
const BATCH = 1000;

const { values: args } = parseArgs({
  options: {
    source: { type: 'string' },
    out: { type: 'string' },
    'from-id': { type: 'string', default: '0' },
    'to-id': { type: 'string', default: String(Number.MAX_SAFE_INTEGER) },
    limit: { type: 'string', default: String(Number.MAX_SAFE_INTEGER) },
  },
});
if (!['28', 'crossed'].includes(args.source)) throw new Error('--source must be 28 or crossed');
if (!args.out) throw new Error('--out is required');

/** The 28-cube sweep, its array index standing in for a row id. */
function* rows28() {
  const { shapes } = JSON.parse(readFileSync(SWEEP_28, 'utf8'));
  for (const [id, { shape, span }] of shapes.entries()) yield { id, shape, mirrored: null, span };
}

function* rowsCrossed(from, to) {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  // The unary plus keeps SQLite off the (question_id, shape) index: through it, the
  // id order costs a sort of every row before the first comes back (~30 s per 1k
  // at 11M rows), where the rowid range streams.
  const query = db.prepare(`SELECT id, shape, mirrored, span_across, span_up, span_along
    FROM layouts WHERE +question_id = ? AND id >= ? AND id <= ? ORDER BY id`);
  for (const r of query.iterate(QUESTION, from, to)) {
    yield { id: r.id, shape: r.shape, mirrored: r.mirrored, span: [r.span_across, r.span_up, r.span_along] };
  }
  db.close();
}

function score({ id, shape, mirrored, span }) {
  const placed = chainTrack(routeOf(shape));
  const derived = spanOf(placed);
  if (derived.some((v, k) => v !== span[k])) {
    throw new Error(`${id} ${shape} spans ${derived}, the source says ${span}`);
  }
  const m = metricsOf(placed);
  const underground = placed.filter(p => p.cell[1] < 0).length;
  return JSON.stringify({ id, shape, mirrored, underground, m: METRICS.map(k => m[k]) });
}

const rows = args.source === '28'
  ? rows28()
  : rowsCrossed(Number(args['from-id']), Number(args['to-id']));
const limit = Number(args.limit);
const fd = openSync(args.out, 'a');
const started = performance.now();
let batch = [], done = 0;
for (const row of rows) {
  batch.push(score(row));
  done += 1;
  if (batch.length === BATCH) {
    writeSync(fd, batch.join('\n') + '\n');
    batch = [];
    if (done % 100_000 === 0) console.log(`${done} scored, last id ${row.id}`);
  }
  if (done === limit) break;
}
if (batch.length) writeSync(fd, batch.join('\n') + '\n');
closeSync(fd);
const seconds = (performance.now() - started) / 1000;
console.log(`${done} scored in ${seconds.toFixed(1)} s (${(done / seconds).toFixed(0)}/s)`);
