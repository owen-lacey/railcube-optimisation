// Rank a scores file from scripts/score-sweeps.js: both ends of every metric, and
// of their combination, with the tie count at each end and example shapes.
//
//   node scripts/rank-scores.js <scores.jsonl>... [--examples 5]
//
// No end is called better here, except in the combination, which needs a
// direction per metric: each metric is rescaled to 0–1 over the
// population read, signed by SIGNS in src/metrics.js, and all of them summed
// with equal weights.
//
// A row whose train goes below the floor (`underground` steps, from
// score-sweeps.js) is no longer a legal track, so it is counted and left out of
// everything else.
//
// Mirrors score identically (tests/metrics.test.js), so a row stored as the
// mirror of another (`mirrored` 1) is counted but never shown as an example: its
// partner stands for both.
//
// Three passes over the files, which keeps memory to histograms: the first finds
// each metric's range, the second scores the combination and collects metric
// examples, the third collects the combination's examples.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

import { METRICS, SIGNS } from '../src/metrics.js';

const KEY_DIGITS = 9;

const { values: args, positionals: files } = parseArgs({
  allowPositionals: true,
  options: { examples: { type: 'string', default: '5' } },
});
if (!files.length) throw new Error('give one or more scores files');
const EXAMPLES = Number(args.examples);

let underground = 0;

/** Every legal row, in file order; the first pass also counts the rest. */
async function each(visit, counting = false) {
  for (const file of files) {
    for await (const line of createInterface({ input: createReadStream(file) })) {
      if (!line) continue;
      const row = JSON.parse(line);
      if (row.underground) underground += counting ? 1 : 0;
      else visit(row);
    }
  }
}

const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const ends = map => {
  const keys = [...map.keys()].sort((a, b) => a - b);
  return [keys[0], keys[keys.length - 1]];
};

/** Pass 1: a histogram per metric, plus the sums a correlation matrix needs. */
async function survey() {
  const hist = METRICS.map(() => new Map());
  const n = METRICS.length;
  const sum = new Array(n).fill(0);
  const cross = METRICS.map(() => new Array(n).fill(0));
  let rows = 0, mirrors = 0;
  await each(({ m, mirrored }) => {
    rows += 1;
    if (mirrored === 1) mirrors += 1;
    m.forEach((v, i) => {
      bump(hist[i], v);
      sum[i] += v;
      m.forEach((w, j) => { cross[i][j] += v * w; });
    });
  }, true);
  return { hist, sum, cross, rows, mirrors };
}

function correlations({ sum, cross, rows }) {
  const mean = sum.map(s => s / rows);
  const cov = (i, j) => cross[i][j] / rows - mean[i] * mean[j];
  return METRICS.map((_, i) => METRICS.map((_, j) =>
    cov(i, j) / Math.sqrt(cov(i, i) * cov(j, j))));
}

/** The combination, from each metric's range. A metric with no range adds nothing. */
const combiner = ranges => m => m.reduce((total, v, i) => {
  const [lo, hi] = ranges[i];
  return hi === lo ? total : total + SIGNS[METRICS[i]] * (v - lo) / (hi - lo);
}, 0);
const keyOf = c => Number(c.toFixed(KEY_DIGITS));

const keep = (list, row) => {
  if (row.mirrored !== 1 && list.length < EXAMPLES) list.push(row);
};

/** Pass 2: the combination's histogram, and examples at each metric's two ends. */
async function sample(ranges, combine) {
  const combined = new Map();
  const examples = METRICS.map(() => [[], []]);
  await each(row => {
    bump(combined, keyOf(combine(row.m)));
    row.m.forEach((v, i) => {
      if (v === ranges[i][0]) keep(examples[i][0], row);
      if (v === ranges[i][1]) keep(examples[i][1], row);
    });
  });
  return { combined, examples };
}

/** Pass 3: examples at the combination's two ends. */
async function sampleCombined(range, combine) {
  const examples = [[], []];
  await each(row => {
    const c = keyOf(combine(row.m));
    if (c === range[0]) keep(examples[0], row);
    if (c === range[1]) keep(examples[1], row);
  });
  return examples;
}

const fmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(3));
const shown = list => list.map(r => `    ${r.shape}  [${r.m.join(' ')}]`).join('\n');

function printEnd(label, value, count, rows, list) {
  console.log(`  ${label} ${fmt(value)}: ${count} of ${rows} (${(100 * count / rows).toFixed(2)}%)`);
  console.log(shown(list));
}

function printMetric(name, hist, range, examples, rows) {
  const bars = [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => `${v}:${c}`).join(' ');
  console.log(`\n## ${name}  (sign ${SIGNS[name] > 0 ? '+' : '−'} in the combination)`);
  printEnd('min', range[0], hist.get(range[0]), rows, examples[0]);
  printEnd('max', range[1], hist.get(range[1]), rows, examples[1]);
  console.log(`  histogram ${bars}`);
}

function printCorrelations(r) {
  console.log('\n## correlations (Pearson)');
  console.log(`  ${''.padEnd(8)}${METRICS.map(k => k.padStart(8)).join('')}`);
  r.forEach((row, i) => console.log(`  ${METRICS[i].padEnd(8)}${row.map(v => (Number.isNaN(v) ? '—' : v.toFixed(2)).padStart(8)).join('')}`));
}

const surveyed = await survey();
const ranges = surveyed.hist.map(ends);
const combine = combiner(ranges);
const { combined, examples } = await sample(ranges, combine);
const combinedRange = ends(combined);
const combinedExamples = await sampleCombined(combinedRange, combine);

const { rows, mirrors } = surveyed;
console.log(`# ${files.join(', ')}`);
console.log(`${rows} layouts, ${mirrors} stored as the mirror of another, ${underground} more left out`
  + ` for riding below the floor. Shapes listed as [${METRICS.join(' ')}].`);
METRICS.forEach((name, i) => printMetric(name, surveyed.hist[i], ranges[i], examples[i], rows));
console.log('\n## combined (equal weights, each metric rescaled to 0–1 over this population)');
console.log(`  ranges ${METRICS.map((k, i) => `${k} ${ranges[i][0]}–${ranges[i][1]}`).join(', ')}`);
printEnd('min', combinedRange[0], combined.get(combinedRange[0]), rows, combinedExamples[0]);
printEnd('max', combinedRange[1], combined.get(combinedRange[1]), rows, combinedExamples[1]);
console.log(`  ${combined.size} distinct combined values`);
printCorrelations(correlations(surveyed));
