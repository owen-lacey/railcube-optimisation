// The crossed sweep's best layout on each metric alone, for the post's "these
// metrics on their own are largely unimpressive".
//
//   node scripts/single-metrics.js --out site/src/lib/data/sweep-crossed-singles.json [--db <path>]
//
// For each of the five metrics `weighting.js` weighs, every legal, unmirrored row of
// question 1 at that metric's best value is a candidate, and the one kept scores
// lowest on the other four under the post's weights — `scoreOf` at `WEIGHTS`, the
// metric itself weighing nothing. Ties go to the shape first alphabetically, as
// `ends` breaks them.
//
// Every layout kept goes through `auditRows` before the file is written.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import Database from 'better-sqlite3';

import { auditRows } from './audit-rows.js';
import { DB_PATH, weightingValuesOf } from './sweep-data.js';
import { knotOf } from '../site/src/lib/knots.js';
import { DIRECTIONS, scoreOf, WEIGHTS } from '../site/src/lib/weighting.js';

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

// Per metric, the weighting of everything else: itself 0, the other four as the post weighs them.
const OTHERS = Object.fromEntries(NAMES.map(m => [m, { ...WEIGHTS, [m]: 0 }]));

/**
 * One read-only pass: per metric, the row at its best that is lowest on the rest,
 * and how many tie with it. A row better on the metric than any seen starts it afresh.
 */
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
    for (const m of NAMES) {
      const at = kept[m];
      const lead = at ? DIRECTIONS[m] * (values[m] - at.value) : 1;
      if (lead < 0) continue;
      const others = scoreOf(values, OTHERS[m]);
      if (lead > 0 || others < at.others) kept[m] = { row: r, value: values[m], others, tied: 1 };
      else if (others === at.others) {
        at.tied += 1;
        if (r.shape < at.row.shape) at.row = r;
      }
    }
  }
  db.close();
  return { question, legal, kept };
}

const { question, legal, kept } = pick(args.db);
await auditRows(NAMES.map(m => kept[m].row), question);

const entry = m => {
  const { row, others, tied } = kept[m];
  return { metric: m, id: row.id, shape: row.shape, knot: knotOf(row.knot_over, row.knot_under), tied, others };
};

// One layout per line, as rank-tracks.js writes its lists.
const lines = ['[', ...NAMES.map((m, i) => `    ${JSON.stringify(entry(m))}${i < NAMES.length - 1 ? ',' : ''}`), '  ]'].join('\n');
const body = JSON.stringify({
  name: 'sweep-crossed-singles',
  generatedBy: 'scripts/single-metrics.js',
  question,
  legal,
  layouts: [],
}, null, 2).replace('"layouts": []', () => `"layouts": ${lines}`);
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, `${body}\n`);
for (const m of NAMES) console.log(`${m.padEnd(12)} ${kept[m].row.shape} (${kept[m].tied} tied)`);
console.log(`over ${legal.toLocaleString('en-GB')} legal layouts; ${NAMES.length} re-derived. wrote ${args.out}`);
