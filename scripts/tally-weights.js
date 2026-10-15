// The crossed sweep's best and worst under every slider setting, for the site's
// weighted tracks.
//
//   node scripts/tally-weights.js \
//     --out site/src/lib/data/sweep-crossed-weights.json [--count 10] [--db <path>]
//
// Every legal row of question 1 is read off sweeps.db's columns — knotted, poses,
// close calls, repeats, and longest side from the spans — and grouped by those
// five values. A weighted sum reads a layout only through them, so ranking the
// groups ranks every layout. Each group carries one sample: its alphabetically
// first shape not stored as a mirror (a mirror reads the same, so its partner
// stands for both).
//
// For every weighting with each weight a whole number from 0 to its
// `MAX_WEIGHTS` in weighting.js, as the sliders offer, the `--count` best and worst groups are found by `ends`
// in weighting.js, ties broken by sample shape; the file keeps their union, and
// nothing else. Every sample is re-derived and recounted before the file is
// written — its knot read on a fresh rotation — and one disagreement fails it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import Database from 'better-sqlite3';

import { closeCallsOf, metricsOf, posesOf, spanOf } from '../src/metrics.js';
import { assertSpends, DB_PATH, derive, weightingValuesOf } from './sweep-data.js';
import { knotInput, knotReader } from './knot-curves.js';
import { knotOf } from '../site/src/lib/knots.js';
import { DIRECTIONS, ends, MAX_WEIGHTS, settings } from '../site/src/lib/weighting.js';

const QUESTION = 1;
const NAMES = Object.keys(DIRECTIONS);
// A seed away from any row id, so the audit's rotations are not the scan's.
const AUDIT_SEED = 2 ** 33;

const { values: args } = parseArgs({
  options: {
    out: { type: 'string' },
    count: { type: 'string', default: '10' },
    db: { type: 'string', default: DB_PATH },
  },
});
const count = Number(args.count);
if (!args.out || !Number.isInteger(count) || count < 1) {
  console.error('usage: node scripts/tally-weights.js --out <file.json> [--count <n>] [--db <path>]');
  process.exit(2);
}

/**
 * One pass over the question's rows: every group of five values with its first
 * unmirrored shape. Opened read-only: it is the only copy of these layouts.
 */
function tally(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  const question = JSON.parse(db.prepare('SELECT question FROM questions WHERE id = ?').get(QUESTION).question);
  const groups = new Map();
  let population = 0, underground = 0;
  const query = db.prepare(`SELECT id, shape, mirrored, poses, close_calls, repeats, underground,
    span_across, span_up, span_along, knot_over, knot_under FROM layouts WHERE +question_id = ?`);
  for (const r of query.iterate(QUESTION)) {
    population += 1;
    if (r.poses === null) throw new Error(`row ${r.id} has no readings: run hydrate-sweeps.js --readings`);
    if (r.underground) { underground += 1; continue; }
    const values = weightingValuesOf(r);
    if (values.knotted === null) throw new Error(`row ${r.id} has its knot unread: run hydrate-sweeps.js --knots`);
    const key = NAMES.map(n => values[n]).join(',');
    if (!groups.has(key)) groups.set(key, { ...values, id: null, shape: null, knot: null });
    const group = groups.get(key);
    if (r.mirrored === 1 || (group.shape !== null && group.shape <= r.shape)) continue;
    Object.assign(group, { id: r.id, shape: r.shape, knot: knotOf(r.knot_over, r.knot_under) });
  }
  db.close();
  const rows = [...groups.values()];
  const bare = rows.find(r => r.shape === null);
  if (bare) throw new Error(`${NAMES.map(n => `${n} ${bare[n]}`)} has only mirrored layouts`);
  return { question, population, legal: population - underground, rows };
}

/** The rows at either end of every weighting the sliders can set, all-zero included. */
function kept(table) {
  const marked = new Set();
  for (const weights of settings()) {
    const { best, worst } = ends(table, weights);
    for (const { row } of [...best, ...worst]) marked.add(row);
  }
  return [...marked];
}

/** Re-derive every sample and recount it to its row; read its knot on a fresh rotation. */
async function audit(rows, question) {
  const placed = rows.map(row => recount(row, question));
  const reader = knotReader();
  const polys = await reader.read(rows.map((row, i) => ({
    id: row.id, seed: AUDIT_SEED + row.id, ...knotInput(placed[i]) })));
  await reader.close();
  rows.forEach((row, i) => {
    const knot = knotOf(polys[i].over, polys[i].under);
    if (knot !== row.knot || Number(knot !== 'unknot') !== row.knotted) {
      throw new Error(`${row.shape} reads ${knot}, tallied ${row.knot}`);
    }
  });
}

/** A sample re-derived and its readings recounted to its row; its placed pieces. */
function recount(row, question) {
  const { placed } = derive(row.shape);
  assertSpends(placed, question, row.shape);
  const values = { poses: posesOf(placed), closeCalls: closeCallsOf(placed),
    repeats: metricsOf(placed).repeats, longestSide: Math.max(...spanOf(placed)) };
  const off = Object.keys(values).filter(n => values[n] !== row[n]);
  if (off.length) throw new Error(`${row.shape} recounts ${off.map(n => `${n} ${values[n]}`)}, tallied ${off.map(n => row[n])}`);
  if (placed.some(x => x.cell[1] < 0)) throw new Error(`${row.shape} goes below the floor`);
  return placed;
}

// One row per line, as sample-sweep.js writes its shapes, so a re-tally reads as rows changed.
function write(output, data) {
  const body = JSON.stringify({ ...data, rows: [] }, null, 2)
    .replace('"rows": []', () => ['"rows": [',
      ...data.rows.map((t, i) => `    ${JSON.stringify(t)}${i < data.rows.length - 1 ? ',' : ''}`),
      '  ]'].join('\n'));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${body}\n`);
}

const { question, population, legal, rows } = tally(args.db);
const order = (a, b) => NAMES.reduce((c, n) => c || a[n] - b[n], 0);
const shown = kept({ rows, count }).sort(order);
await audit(shown, question);

write(args.out, {
  name: 'sweep-crossed-weights',
  generatedBy: 'scripts/tally-weights.js',
  question,
  population,
  legal,
  maxWeights: MAX_WEIGHTS,
  count,
  rows: shown,
});
console.log(`${rows.length} groups over ${legal.toLocaleString('en-GB')} legal layouts `
  + `(${(population - legal).toLocaleString('en-GB')} below the floor left out); `
  + `${shown.length} at an end, re-derived. wrote ${args.out}`);
