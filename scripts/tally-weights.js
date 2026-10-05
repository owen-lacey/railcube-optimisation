// Tally the crossed sweep by the metrics the weighted tracks weigh, for the
// site's best and worst.
//
//   node scripts/tally-weights.js --seed 1 \
//     --out site/src/lib/data/sweep-crossed-weights.json [--examples 5] [--max-weight 5] [--db <path>]
//
// Every legal row of question 1 is read off sweeps.db's columns — knotted, poses,
// close calls, repeats, and longest side from the spans — and counted by those
// five values. A weighted sum reads a layout only through them, so a table of the
// few thousand rows answers every weighting exactly over the whole sweep. A
// layout whose knot is unread (scripts/hydrate-sweeps.js) is counted in a row of
// its own with `knotted: null`, and `weighting.js` says when one could reach an end.
//
// Examples are kept only for rows that can be an end: tied best or worst under
// some weighting with every weight a whole number from 0 to `--max-weight`, as
// the sliders offer, not all of them zero. Drawn uniformly per row, with `--seed`,
// from rows not stored as a mirror (a mirror reads the same, so its partner
// stands for both). A row of unread knots can be an end only when knotted weighs
// nothing, and its examples say `knot: null`. Every example is re-derived and
// recounted before the file is written — a read knot on a fresh rotation — and
// one disagreement fails the whole file.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import Database from 'better-sqlite3';

import { closeCallsOf, metricsOf, posesOf, spanOf } from '../src/metrics.js';
import { assertSpends, DB_PATH, derive, random } from './sweep-data.js';
import { curvesOf, knotOf, knotReader } from './knot-curves.js';
import { DIRECTIONS, extremes } from '../site/src/lib/weighting.js';

const QUESTION = 1;
const NAMES = Object.keys(DIRECTIONS);
// A seed away from any row id, so the audit's rotations are not the scan's.
const AUDIT_SEED = 2 ** 33;

const { values: args } = parseArgs({
  options: {
    seed: { type: 'string' },
    out: { type: 'string' },
    examples: { type: 'string', default: '5' },
    'max-weight': { type: 'string', default: '5' },
    db: { type: 'string', default: DB_PATH },
  },
});
const seed = Number(args.seed);
const examples = Number(args.examples);
const maxWeight = Number(args['max-weight']);
if (!Number.isInteger(seed) || !args.out || !Number.isInteger(examples) || !Number.isInteger(maxWeight)) {
  console.error('usage: node scripts/tally-weights.js --seed <n> --out <file.json> '
    + '[--examples <n>] [--max-weight <n>] [--db <path>]');
  process.exit(2);
}

const knottedOf = r => (r.knot_over === null ? null : Number(knotOf(r.knot_over, r.knot_under) !== 'unknot'));

/** A row's five values, as the table keys them. */
const valuesOf = r => ({
  knotted: knottedOf(r),
  poses: r.poses,
  closeCalls: r.close_calls,
  repeats: r.repeats,
  longestSide: Math.max(r.span_across, r.span_up, r.span_along),
});

/**
 * One pass over the question's rows: a count and a reservoir of examples per
 * row of the table. Opened read-only: it is the only copy of these layouts.
 */
function tally(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  const question = JSON.parse(db.prepare('SELECT question FROM questions WHERE id = ?').get(QUESTION).question);
  const next = random(seed);
  const rows = new Map();
  let population = 0, underground = 0;
  const query = db.prepare(`SELECT id, shape, mirrored, poses, close_calls, repeats, underground,
    span_across, span_up, span_along, knot_over, knot_under FROM layouts WHERE +question_id = ?`);
  for (const r of query.iterate(QUESTION)) {
    population += 1;
    if (r.poses === null) throw new Error(`row ${r.id} has no readings: run hydrate-sweeps.js --readings`);
    if (r.underground) { underground += 1; continue; }
    const values = valuesOf(r);
    const key = NAMES.map(n => values[n]).join(',');
    if (!rows.has(key)) rows.set(key, { ...values, count: 0, offered: 0, examples: [] });
    const row = rows.get(key);
    row.count += 1;
    if (r.mirrored === 1) continue;
    // Reservoir sampling: the k-th example offered replaces a random one with
    // probability examples / k, so every eligible row is equally likely to be kept.
    row.offered += 1;
    const example = { id: r.id, shape: r.shape, knot: r.knot_over === null ? null : knotOf(r.knot_over, r.knot_under) };
    if (row.examples.length < examples) row.examples.push(example);
    else {
      const slot = Math.floor(next() * row.offered);
      if (slot < examples) row.examples[slot] = example;
    }
  }
  db.close();
  return { question, population, underground, rows: [...rows.values()] };
}

const rangeOf = (rows, name) => {
  const vs = rows.map(r => r[name]).filter(v => v !== null);
  return [Math.min(...vs), Math.max(...vs)];
};

/** Every row tied at either end of some weighting the sliders can set. */
function ends(table) {
  const marked = new Set();
  const weights = NAMES.map(() => 0);
  const total = (maxWeight + 1) ** NAMES.length;
  for (let w = 1; w < total; w++) {
    NAMES.forEach((_, i) => { weights[i] = Math.floor(w / (maxWeight + 1) ** i) % (maxWeight + 1); });
    const { best, worst } = extremes(table, Object.fromEntries(NAMES.map((n, i) => [n, weights[i]])));
    for (const row of [...best.rows, ...worst.rows]) marked.add(row);
  }
  return marked;
}

/** Re-derive every example and recount it to its row; read knots on a fresh rotation. */
async function audit(rows, question) {
  const reader = knotReader();
  const all = rows.flatMap(row => row.examples.map(example => ({ row, example })));
  const listed = all.filter(({ example }) => example.knot !== null);
  for (const { row, example } of all.filter(({ example }) => example.knot === null)) recount(row, example, question);
  const placed = listed.map(({ row, example }) => recount(row, example, question));
  const polys = await reader.read(listed.map(({ example }, i) => ({
    id: example.id, seed: AUDIT_SEED + example.id, curves: curvesOf(placed[i]) })));
  await reader.close();
  listed.forEach(({ row, example }, i) => {
    const knot = knotOf(polys[i].over, polys[i].under);
    if (knot !== example.knot || Number(knot !== 'unknot') !== row.knotted) {
      throw new Error(`${example.shape} reads ${knot}, tallied ${example.knot}`);
    }
  });
  return all.length;
}

/** An example re-derived and its readings recounted to its row; its placed pieces. */
function recount(row, example, question) {
  const { placed } = derive(example.shape);
  assertSpends(placed, question, example.shape);
  const values = { poses: posesOf(placed), closeCalls: closeCallsOf(placed),
    repeats: metricsOf(placed).repeats, longestSide: Math.max(...spanOf(placed)) };
  const off = Object.keys(values).filter(n => values[n] !== row[n]);
  if (off.length) throw new Error(`${example.shape} recounts ${off.map(n => `${n} ${values[n]}`)}, tallied ${off.map(n => row[n])}`);
  if (placed.some(x => x.cell[1] < 0)) throw new Error(`${example.shape} goes below the floor`);
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

const { question, population, underground, rows } = tally(args.db);
const order = (a, b) => NAMES.reduce((c, n) => c || (a[n] ?? -1) - (b[n] ?? -1), 0);
rows.sort(order);
const ranges = Object.fromEntries(NAMES.map(name => [name, rangeOf(rows, name)]));
const marked = ends({ rows, ranges });
for (const row of rows) if (!marked.has(row)) row.examples = [];
const audited = await audit(rows, question);

const legal = population - underground;
write(args.out, {
  name: 'sweep-crossed-weights',
  generatedBy: 'scripts/tally-weights.js',
  question,
  population,
  legal,
  seed,
  maxWeight,
  ranges,
  rows: rows.map(({ offered, examples: shown, ...row }) => ({
    ...row, examples: shown.map(({ shape, knot }) => ({ shape, knot })) })),
});
const unread = rows.filter(r => r.knotted === null).reduce((n, r) => n + r.count, 0);
console.log(`${rows.length} rows over ${legal.toLocaleString('en-GB')} legal layouts `
  + `(${underground.toLocaleString('en-GB')} below the floor left out, ${unread.toLocaleString('en-GB')} `
  + `knots unread), ${marked.size} can be an end, ${audited} examples re-derived. wrote ${args.out}`);
