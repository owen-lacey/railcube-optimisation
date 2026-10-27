// How the crossed sweep's layouts score under the post's weights, as a histogram, for
// the verdict a builder's closed loop is shown against.
//
//   node scripts/score-histogram.js --out site/src/lib/data/sweep-crossed-scores.json [--db <path>]
//
// Its population is rank-tracks.js's: every legal row of question 1, a row stored as
// a mirror left out (it scores the same as its partner), scored with `scoreOf` at
// `WEIGHTS`. So its ends are the ranked file's best and worst, which
// tests/score-histogram.test.js checks — as long as both were made from one database.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import Database from 'better-sqlite3';

import { DB_PATH, legalRows, weightingValuesOf } from './sweep-data.js';
import { scoreOf, WEIGHTS } from '../site/src/lib/weighting.js';

const QUESTION = 1;

const { values: args } = parseArgs({
  options: {
    out: { type: 'string' },
    db: { type: 'string', default: DB_PATH },
  },
});
if (!args.out) {
  console.error('usage: node scripts/score-histogram.js --out <file.json> [--db <path>]');
  process.exit(2);
}

const db = new Database(args.db, { readonly: true, fileMustExist: true });
const tally = new Map();
for (const r of legalRows(db, QUESTION)) {
  if (r.mirrored === 1) continue;
  const score = scoreOf(weightingValuesOf(r), WEIGHTS);
  tally.set(score, (tally.get(score) ?? 0) + 1);
}
db.close();

const counts = [...tally].sort(([a], [b]) => a - b);
const population = counts.reduce((sum, [, n]) => sum + n, 0);
const body = JSON.stringify({
  name: 'sweep-crossed-scores',
  generatedBy: 'scripts/score-histogram.js',
  question: QUESTION,
  weights: WEIGHTS,
  population,
  counts: [],
}, null, 2).replace('"counts": []', () => `"counts": ${JSON.stringify(counts)}`);
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, `${body}\n`);
console.log(`scored ${population.toLocaleString('en-GB')} layouts, ${counts[0][0]} to ${counts.at(-1)[0]}. wrote ${args.out}`);
