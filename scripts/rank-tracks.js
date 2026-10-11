// The crossed sweep's best and worst layouts under equal weights, ranked, for the
// post's "Consider this set of layouts" and "Now these".
//
//   node scripts/rank-tracks.js --seed 1 \
//     --out site/src/lib/data/sweep-crossed-ranked.json [--count 10] [--db <path>]
//
// Every legal row of question 1 is scored the way the weighted tracks score it —
// `weigher` in site/src/lib/weighting.js, over the ranges in
// sweep-crossed-weights.json, every weight 1 — so the best here is WeightedTracks'
// best at its default sliders. The top and bottom `--count` are kept, ties broken
// by a seeded draw, with rows stored as a mirror left out (a mirror reads the
// same, so its partner stands for both). A row outside the weights file's ranges
// fails the run: the file is stale and the scores would mean something else.
//
// Every layout kept is re-derived, its readings recounted against its row, and
// its knot read again on a fresh rotation; one disagreement fails the file.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import Database from 'better-sqlite3';

import { assertSpends, DB_PATH, derive, random, weightingValuesOf } from './sweep-data.js';
import { knotInput, knotOf, knotReader } from './knot-curves.js';
import { DIRECTIONS, weigher } from '../site/src/lib/weighting.js';
import { SWEEP_CROSSED_WEIGHTS } from '../site/src/lib/sweeps.js';

const QUESTION = 1;
const NAMES = Object.keys(DIRECTIONS);
const WEIGHTS = Object.fromEntries(NAMES.map(name => [name, 1]));
// A seed away from any row id, so the audit's rotations are not the scan's.
const AUDIT_SEED = 2 ** 33;
// The columns a row's values come from, re-derived in the audit.
const RECOUNTED = ['poses', 'close_calls', 'repeats', 'span_across', 'span_up', 'span_along'];

const { values: args } = parseArgs({
  options: {
    seed: { type: 'string' },
    out: { type: 'string' },
    count: { type: 'string', default: '10' },
    db: { type: 'string', default: DB_PATH },
  },
});
const seed = Number(args.seed);
const count = Number(args.count);
if (!Number.isInteger(seed) || !args.out || !Number.isInteger(count) || count < 1) {
  console.error('usage: node scripts/rank-tracks.js --seed <n> --out <file.json> [--count <n>] [--db <path>]');
  process.exit(2);
}

const { ranges } = SWEEP_CROSSED_WEIGHTS;
const { score, scale } = weigher(ranges);

/** Throw unless every value sits inside the weights file's range for it. */
function assertInRange(r, values) {
  for (const name of NAMES) {
    const [low, high] = ranges[name];
    if (values[name] < low || values[name] > high) {
      throw new Error(`row ${r.id} has ${name} ${values[name]}, outside ${low}–${high}: re-run tally-weights.js`);
    }
  }
}

/**
 * The `count` best entries seen so far under `better`, best first: an entry is
 * inserted where it belongs and the list trimmed back to `count`.
 */
function leaders(better) {
  const kept = [];
  const offer = entry => {
    if (kept.length === count && !better(entry, kept[count - 1])) return;
    const at = kept.findIndex(k => better(entry, k));
    kept.splice(at === -1 ? kept.length : at, 0, entry);
    if (kept.length > count) kept.pop();
  };
  return { offer, kept };
}

/** One read-only pass: the best and worst `count` legal, unmirrored rows. */
function rank(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  const question = JSON.parse(db.prepare('SELECT question FROM questions WHERE id = ?').get(QUESTION).question);
  const next = random(seed);
  // Higher score first; on a tie, the lower draw.
  const best = leaders((a, b) => a.score > b.score || (a.score === b.score && a.draw < b.draw));
  const worst = leaders((a, b) => a.score < b.score || (a.score === b.score && a.draw < b.draw));
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
    const entry = { row: r, score: score(values, WEIGHTS), draw: next() };
    best.offer(entry);
    worst.offer(entry);
  }
  db.close();
  return { question, legal, best: best.kept, worst: worst.kept };
}

/** Re-derive every kept layout, recount it to its row, and read its knot afresh. */
async function audit(entries, question) {
  const placed = entries.map(({ row }) => {
    const { placed: chained, columns } = derive(row.shape);
    assertSpends(chained, question, row.shape);
    const off = RECOUNTED.filter(c => columns[c] !== row[c]);
    if (off.length) throw new Error(`${row.shape} recounts ${off.map(c => `${c} ${columns[c]}`)}, stored ${off.map(c => row[c])}`);
    if (columns.underground) throw new Error(`${row.shape} goes below the floor`);
    return chained;
  });
  const reader = knotReader();
  const polys = await reader.read(entries.map(({ row }, i) => ({
    id: row.id, seed: AUDIT_SEED + row.id, ...knotInput(placed[i]) })));
  await reader.close();
  entries.forEach(({ row }, i) => {
    const knot = knotOf(polys[i].over, polys[i].under);
    const stored = knotOf(row.knot_over, row.knot_under);
    if (knot !== stored) throw new Error(`${row.shape} reads ${knot}, stored ${stored}`);
  });
}

const { question, legal, best, worst } = rank(args.db);
await audit([...best, ...worst], question);

const entry = ({ row, score: s }) => ({
  id: row.id, shape: row.shape, knot: knotOf(row.knot_over, row.knot_under), score: s / scale });

// One layout per line, as sample-sweep.js writes its shapes.
const lines = list => ['[', ...list.map((e, i) => `    ${JSON.stringify(entry(e))}${i < list.length - 1 ? ',' : ''}`), '  ]'].join('\n');
const body = JSON.stringify({
  name: 'sweep-crossed-ranked',
  generatedBy: 'scripts/rank-tracks.js',
  question,
  legal,
  seed,
  weights: WEIGHTS,
  ranges,
  best: [],
  worst: [],
}, null, 2)
  .replace('"best": []', () => `"best": ${lines(best)}`)
  .replace('"worst": []', () => `"worst": ${lines(worst)}`);
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, `${body}\n`);
console.log(`ranked ${legal.toLocaleString('en-GB')} legal layouts: best ${(best[0].score / scale).toFixed(3)}, `
  + `worst ${(worst[0].score / scale).toFixed(3)}; ${best.length + worst.length} re-derived. wrote ${args.out}`);
