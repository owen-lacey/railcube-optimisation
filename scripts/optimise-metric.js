/**
 * Optimise one aesthetic metric, or their combination, over the crossed inventory.
 *
 *   node scripts/optimise-metric.js --objective volume --time 600 --hint ISSS...
 *   node scripts/optimise-metric.js --objective combined --out results.jsonl
 *   node scripts/optimise-metric.js --objective faces --engine native
 *   node scripts/optimise-metric.js --objective combined --ranges crossedCeilingHeight --direction worst
 *
 * The question is the crossed sweep's (scripts/sweep-crossings.js): 35 cubes over
 * 36 steps, one crossing, box 8, on the floor, every step used. explore.py cannot
 * ask it, having no crossing encoding, so this is that script's `--objective` for
 * the one inventory that needs the JS model.
 *
 * The objective is posted in its good direction (SIGNS in src/metrics.js), or
 * the other with `--direction worst` (the metrics exact both ways, and a
 * combined of only those), with the mirror
 * break on, so a hint that meets a right curve first is asked for as
 * its mirror — an equally good track, since mirrors score identically.
 *
 * The reported value is a recount: the answer is re-chained and metricsOf counts
 * it. The solver's own value is printed beside it for the gap, and a disagreement
 * between the two is an encoding bug and exits nonzero.
 *
 * `--ranges` names the POPULATION_RANGES entry `combined` rescales by, and so
 * which metrics it combines: `crossed` (the default) is the four-metric one.
 *
 *   node scripts/optimise-metric.js --objective combined --prove ISSL... --time 3600 --out proof.jsonl
 *
 * `--prove` asks instead whether anything beats a layout, for volume or combined,
 * whose bounds the solver cannot close. Any better layout's material fits some
 * box whose volume is at most a ceiling, so it asks one yes/no question per
 * largest such box (no box inside another): fit in it, holding the objective
 * strictly better. For volume the ceiling is the incumbent's volume less one.
 * For combined it depends on the other three metrics, so the question is split
 * into cases, one per value they could take — every face, no runs, at most one
 * step face up leaves the most volume to spend — and each case is posted as
 * `limits` over its own boxes. `spans` builds each box's model over only the
 * cells it could reach, so a thin box is a small model, not just a capped one.
 *
 * Every no is part of the proof; a yes is a better layout, which becomes the
 * incumbent. Proved means every box of every case came back INFEASIBLE. Each box
 * is one line in `--out`, and a rerun skips a box held by one already refuted
 * under limits that ask no more, so it resumes — and a refutation under a weaker
 * incumbent still stands once a better one is found.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { FACES, chainTrack } from '../src/track.js';
import { solveTrack } from '../src/solver/index.js';
import { routeOf, shapeOf } from '../src/layouts.js';
import {
  METRICS, POPULATION_RANGES, SIGNS, combinedOf, combinedWeights, metricsOf,
} from '../src/metrics.js';

const INVENTORY = {
  straight: 14, cross: 1,
  insideCurve: 8, outsideCurve: 4, leftCurve: 4, rightCurve: 4,
};
const STEPS = Object.values(INVENTORY).reduce((a, b) => a + b, 0) + 1;
const BOX = 8;

const { values: args } = parseArgs({
  options: {
    objective: { type: 'string' },
    time: { type: 'string', default: '600' },
    workers: { type: 'string', default: '6' },
    hint: { type: 'string' },
    out: { type: 'string' },
    prove: { type: 'string' },
    // cpsat-js or native OR-Tools: the same model, so a refutation stands on either.
    engine: { type: 'string', default: 'wasm' },
    // best or worst: solveTrack refuses worst for an encoding sound one way only.
    direction: { type: 'string', default: 'best' },
    // Which population's ranges combined rescales by, and so which metrics it combines.
    ranges: { type: 'string', default: 'crossed' },
  },
});
if (!(args.ranges in POPULATION_RANGES)) {
  console.error(`--ranges must be one of ${Object.keys(POPULATION_RANGES).join(', ')}`);
  process.exit(2);
}
const RANGES = POPULATION_RANGES[args.ranges];
const objectives = [...METRICS, 'combined'];
if (!objectives.includes(args.objective)) {
  console.error(`--objective must be one of ${objectives.join(', ')}`);
  process.exit(2);
}

const mirrorOf = shape => [...shape].map(l => ({ L: 'R', R: 'L' }[l] ?? l)).join('');
const handed = shape => (shape.includes('R') && !(shape.indexOf('L') >= 0
  && shape.indexOf('L') < shape.indexOf('R')) ? mirrorOf(shape) : shape);

/** What the objective reads, in the solver's own integers, off a recount. */
const { weights } = combinedWeights(RANGES);
const integerOf = metrics => (args.objective === 'combined'
  ? Object.keys(weights).reduce((total, name) => total + weights[name] * metrics[name], 0)
  : metrics[args.objective]);

const QUESTION = {
  steps: STEPS, box: BOX, minY: 0, inventory: INVENTORY,
  crossings: true, minCrossings: 1, fill: true, symmetryBreaking: true, ranges: RANGES,
};

/**
 * The questions a strictly better layout must answer yes to, each as limits on
 * the metrics and the most volume a layout meeting them could still have. For
 * volume that is one question with no limits. For combined, each value the other
 * three metrics could take leaves its own volume to spend, so each is asked on
 * its own: held at least that good, what fits under that volume? faceUp starts
 * at 1, since the start piece is entered DF — on top of its cube.
 */
function casesOf(incumbent) {
  if (args.objective === 'volume') return [{ limits: {}, most: incumbent - 1 }];
  const cases = [];
  for (let faces = 0; faces <= FACES.length; faces++) {
    for (let repeats = 0; repeats <= STEPS; repeats++) {
      for (let faceUp = 1; faceUp <= STEPS; faceUp++) {
        const rest = weights.faces * faces + weights.repeats * repeats + weights.faceUp * faceUp;
        const most = Math.floor((rest - (incumbent + 1)) / -weights.volume);
        if (most >= 1) cases.push({ limits: { faces, repeats, faceUp, combined: incumbent + 1 }, most });
      }
    }
  }
  return cases;
}

/** The largest boxes, [across, up, along], of volume at most `most` that fit in BOX. */
function largestBoxes(most) {
  const reach = [2 * BOX + 1, BOX + 1, 2 * BOX + 1];
  const fits = (a, b, c) => a <= reach[0] && b <= reach[1] && a * b * c <= most;
  const boxes = [];
  for (let a = 1; a <= reach[0]; a++) {
    for (let b = 1; b <= reach[1]; b++) {
      const c = Math.min(reach[2], Math.floor(most / (a * b)));
      if (c >= 1 && !fits(a + 1, b, c) && !fits(a, b + 1, c)) boxes.push([a, b, c]);
    }
  }
  return boxes;
}

/** Whether limits `a` ask at least as much as `b`: every one of b's, as strict or stricter. */
const asksAsMuch = (a, b) => Object.entries(b).every(([name, value]) =>
  name in a && ((name === 'combined' || SIGNS[name] > 0) ? a[name] >= value : a[name] <= value));
const inside = (spans, outer) => spans.every((n, a) => n <= outer[a]);

/**
 * A box is settled by any refutation of a box holding it, under limits that ask
 * no more: nothing fits there, so nothing fits here.
 */
const settled = (refutations, { limits, spans }) =>
  refutations.some(r => inside(spans, r.spans) && asksAsMuch(limits, r.limits));

function readRefutations() {
  if (!existsSync(args.out)) return [];
  return readFileSync(args.out, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
    .filter(r => r.status === 'INFEASIBLE');
}

const describe = limits => Object.entries(limits)
  .map(([name, value]) => `${name} ${(name === 'combined' || SIGNS[name] > 0) ? '≥' : '≤'} ${value}`)
  .join(', ') || 'no limits';

/** One box: INFEASIBLE, a strictly better layout, or UNKNOWN on the clock. */
async function askBox(question) {
  const started = Date.now();
  const result = await solveTrack({
    ...QUESTION, ...question,
    maxTimeInSeconds: Number(args.time), numWorkers: Number(args.workers), engine: args.engine,
  });
  const seconds = (Date.now() - started) / 1000;
  const shape = result.route ? shapeOf(result.route) : null;
  appendFileSync(args.out, `${JSON.stringify({
    prove: args.objective, ...question, status: result.status, shape, seconds,
  })}\n`);
  console.log(`  ${question.spans.join('x').padEnd(9)} ${result.status.padEnd(10)} ${seconds.toFixed(1).padStart(7)}s`
    + `${shape ? `  ${shape}` : ''}`);
  return { status: result.status, shape };
}

/** Every case's boxes against one incumbent: the first better layout, and what stayed open. */
async function askAll(incumbent) {
  const refutations = readRefutations();
  const open = [];
  for (const { limits, most } of casesOf(incumbent)) {
    const questions = largestBoxes(most).map(spans => ({ limits, spans }));
    const asking = questions.filter(q => !settled(refutations, q));
    console.log(`${describe(limits)}: volume at most ${most},`
      + ` ${asking.length} of ${questions.length} boxes to ask`);
    for (const question of asking) {
      const { status, shape } = await askBox(question);
      if (shape) return { better: shape, open };
      if (status === 'INFEASIBLE') refutations.push(question);
      else open.push(`${question.spans.join('x')} (${describe(limits)})`);
    }
  }
  return { better: null, open };
}

/** Ask every case under the incumbent, taking each better layout found as the new incumbent. */
async function prove(start) {
  let best = start;
  let incumbent = integerOf(metricsOf(chainTrack(routeOf(best))));
  for (;;) {
    console.log(`${args.objective} ${incumbent} (${best})`);
    const { better, open } = await askAll(incumbent);
    if (!better) {
      console.log(open.length ? `NOT PROVED: ${open.length} boxes unresolved\n  ${open.join('\n  ')}`
        : `PROVED OPTIMAL: ${args.objective} ${incumbent}  ${best}`);
      process.exit(open.length ? 1 : 0);
    }
    const value = integerOf(metricsOf(chainTrack(routeOf(better))));
    if (!(args.objective === 'volume' ? value < incumbent : value > incumbent)) {
      console.error(`LIMIT MISMATCH: ${better} recounts to ${value}, no better than ${incumbent}`);
      process.exit(1);
    }
    [incumbent, best] = [value, better];
  }
}

if (args.prove) {
  if (!args.out) {
    console.error('--prove needs --out: a proof is the record of every box refuted');
    process.exit(2);
  }
  if (args.direction !== 'best') {
    console.error('--prove asks whether anything is better, so it takes no --direction');
    process.exit(2);
  }
  if (!['volume', 'combined'].includes(args.objective)) {
    console.error('--prove is for volume or combined; the other metrics prove on their own');
    process.exit(2);
  }
  if (args.ranges !== 'crossed') {
    console.error('--prove splits the four-metric combined into cases, so it takes --ranges crossed');
    process.exit(2);
  }
  await prove(handed(args.prove));
}

const hint = args.hint ? handed(args.hint) : null;
console.log(`${args.objective} (${args.direction}, ranges ${args.ranges})  ${STEPS} steps  box ${BOX}  ${args.time}s  ${args.workers} workers`
  + `  hint ${hint ?? 'none'}`);

const started = Date.now();
const incumbents = [];
const result = await solveTrack({
  ...QUESTION, objective: args.objective, direction: args.direction,
  hint: hint ? routeOf(hint) : undefined,
  maxTimeInSeconds: Number(args.time),
  numWorkers: Number(args.workers),
  engine: args.engine,
  onSolution: s => {
    incumbents.push(s.seconds);
    console.log(`  ${s.seconds.toFixed(1).padStart(7)}s  bound ${s.bound}  ${shapeOf(s.route)}`);
  },
});

if (!result.route) {
  console.log(`${result.status}: no layout`);
  process.exit(1);
}

const shape = shapeOf(result.route);
const metrics = metricsOf(chainTrack(result.route));
const recount = integerOf(metrics);
const gap = Math.abs(result.bound - result.value) / Math.max(Math.abs(result.value), 1);
console.log(`${result.status}: ${args.objective} ${result.value}, bound ${result.bound},`
  + ` gap ${(100 * gap).toFixed(2)}%`);
console.log(`  ${shape}`);
console.log(`recounted: ${JSON.stringify(metrics)}  combined ${combinedOf(metrics, RANGES).toFixed(3)}`);

if (args.out) {
  appendFileSync(args.out, `${JSON.stringify({
    objective: args.objective, direction: args.direction, status: result.status, value: result.value, bound: result.bound,
    ranges: args.ranges, shape, metrics, combined: combinedOf(metrics, RANGES), hint,
    limit: Number(args.time), seconds: (Date.now() - started) / 1000,
    firstIncumbent: incumbents[0] ?? null, lastIncumbent: incumbents.at(-1) ?? null,
  })}\n`);
}
if (recount !== Math.round(result.value)) {
  console.error(`OBJECTIVE MISMATCH: the solver reads ${result.value}, the recount ${recount}`);
  process.exit(1);
}
