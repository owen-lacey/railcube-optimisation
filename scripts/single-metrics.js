// The crossed sweep's best layout on each metric alone, for the post's "these
// metrics on their own are largely unimpressive".
//
//   node scripts/single-metrics.js --out site/src/lib/data/sweep-crossed-singles.json [--db <path>]
//
// For each of the five metrics `weighting.js` weighs, every legal, unmirrored row of
// question 1 at that metric's best value is a candidate, and the one kept scores
// lowest on the other four at equal weights — `weigher` over the weights file's
// ranges, the metric itself weighing nothing. Ties go to the shape first
// alphabetically, as `ends` breaks them. A row outside the ranges fails the run:
// the file is stale and the scores would mean something else.
//
// Every layout kept goes through `auditRows` before the file is written.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import Database from 'better-sqlite3';

import { auditRows } from './audit-rows.js';
import { DB_PATH, weightingValuesOf } from './sweep-data.js';
import { knotOf } from '../site/src/lib/knots.js';
import { DIRECTIONS, weigher } from '../site/src/lib/weighting.js';
import { SWEEP_CROSSED_WEIGHTS } from '../site/src/lib/sweeps.js';

const QUESTION = 1;
const NAMES = Object.keys(DIRECTIONS);

const { values: args } = parseArgs({
  options: {
    out: { type: 'string' },
    db: { type: 'string', default: DB_PATH },
  },
});
if (!args.out) {
  console.error('usage: node scripts/single-metrics.js --out <file.json> [--db <path>]');
  process.exit(2);
}

const { ranges } = SWEEP_CROSSED_WEIGHTS;
const { score, scale } = weigher(ranges);
// Per metric, the weighting of everything else: itself 0, the other four 1.
const OTHERS = Object.fromEntries(NAMES.map(m => [m, Object.fromEntries(NAMES.map(n => [n, Number(n !== m)]))]));
// Per metric, the end of its range that is best.
const BEST = Object.fromEntries(NAMES.map(m => [m, ranges[m][DIRECTIONS[m] > 0 ? 1 : 0]]));

/** Throw unless every value sits inside the weights file's range for it. */
function assertInRange(r, values) {
  for (const name of NAMES) {
    const [low, high] = ranges[name];
    if (values[name] < low || values[name] > high) {
      throw new Error(`row ${r.id} has ${name} ${values[name]}, outside ${low}–${high}: re-run tally-weights.js`);
    }
  }
}

/** One read-only pass: per metric, the row at its best that is lowest on the rest, and how many tie with it. */
function pick(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  const question = JSON.parse(db.prepare('SELECT question FROM questions WHERE id = ?').get(QUESTION).question);
  const kept = Object.fromEntries(NAMES.map(m => [m, null]));
  let legal = 0;
  const query = db.prepare(`SELECT id, shape, mirrored, poses, close_calls, repeats, underground,
    span_across, span_up, span_along, knot_over, knot_under FROM layouts WHERE +question_id = ? ORDER BY id`);
  for (const r of query.iterate(QUESTION)) {
    if (r.poses === null) throw new Error(`row ${r.id} has no readings: run hydrate-sweeps.js --readings`);
    if (r.underground) continue;
    legal += 1;
    if (r.mirrored === 1) continue;
    const values = weightingValuesOf(r);
    if (values.knotted === null) throw new Error(`row ${r.id} has its knot unread: run hydrate-sweeps.js --knots`);
    assertInRange(r, values);
    for (const m of NAMES) {
      if (values[m] !== BEST[m]) continue;
      const others = score(values, OTHERS[m]);
      const at = kept[m];
      if (!at || others < at.others) kept[m] = { row: r, others, tied: 1 };
      else if (others === at.others) {
        at.tied += 1;
        if (r.shape < at.row.shape) at.row = r;
      }
    }
  }
  db.close();
  const missing = NAMES.filter(m => !kept[m]);
  if (missing.length) throw new Error(`no layout reaches the best of ${missing}`);
  return { question, legal, kept };
}

const { question, legal, kept } = pick(args.db);
await auditRows(NAMES.map(m => kept[m].row), question);

const entry = m => {
  const { row, others, tied } = kept[m];
  return { metric: m, id: row.id, shape: row.shape, knot: knotOf(row.knot_over, row.knot_under), tied, others: others / scale };
};

// One layout per line, as rank-tracks.js writes its lists.
const lines = ['[', ...NAMES.map((m, i) => `    ${JSON.stringify(entry(m))}${i < NAMES.length - 1 ? ',' : ''}`), '  ]'].join('\n');
const body = JSON.stringify({
  name: 'sweep-crossed-singles',
  generatedBy: 'scripts/single-metrics.js',
  question,
  legal,
  ranges,
  layouts: [],
}, null, 2).replace('"layouts": []', () => `"layouts": ${lines}`);
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, `${body}\n`);
for (const m of NAMES) console.log(`${m.padEnd(12)} ${kept[m].row.shape} (${kept[m].tied} tied)`);
console.log(`over ${legal.toLocaleString('en-GB')} legal layouts; ${NAMES.length} re-derived. wrote ${args.out}`);
