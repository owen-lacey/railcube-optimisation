// Turn a sweep's JSON Lines log into the layout data the site carries.
//
//   node scripts/extract-sweep.js sweep-28.jsonl site/src/lib/data/sweep-28.json
//
// A sweep log is a record of a *run* — one line per round, with seeds, wall
// times, statuses and the rounds that came back with nothing. The site wants
// none of that. It wants the layouts: the distinct shapes the run found, and
// the question they answer.
//
// Nothing here believes the log. Every shape is chained through the model,
// counted against the inventory the log says it was solved against, and its
// span recomputed and compared with the one recorded — the same rule the tests
// and scripts/check-route.js follow, because a shape that came out of a solver
// is a claim until the geometry agrees. A single disagreement fails the whole
// extraction rather than being dropped quietly: one bad line means the log and
// the model disagree about something, which is worth stopping for.
//
// The log itself is not checked in — it is tens of thousands of lines and grows
// every time the sweep resumes. This script is what makes the small file that
// is.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { chainTrack, countPieces, POOLS } from '../src/track.js';
import { routeOf, shapeOf } from '../src/layouts.js';

const [input, output] = process.argv.slice(2);

if (!input || !output) {
  console.error('usage: node scripts/extract-sweep.js <sweep.jsonl> <out.json>');
  process.exit(2);
}

const lines = readFileSync(input, 'utf8').split('\n').filter(l => l.trim());
const records = lines.map(l => JSON.parse(l));

// `unknown` is a round that timed out before finding anything. It is a fact
// about the time limit, not about the inventory, and it carries no shape.
const solved = records.filter(r => r.shape);

if (!solved.length) throw new Error(`${input} holds no solved rounds`);

// One file is one question. explore.py already refuses to resume a log whose
// config fingerprint has moved, so this should hold — but the whole point of
// the extract is that the site can state the question once, above the shapes,
// and that is only honest if there is exactly one.
const config = JSON.stringify(solved[0].config);
const strayed = solved.find(r => JSON.stringify(r.config) !== config);
if (strayed) throw new Error(`${input} mixes two questions: round ${strayed.round}`);

const spanOf = placed => {
  const cells = placed.flatMap(p => p.material);
  return [0, 1, 2].map(a =>
    Math.max(...cells.map(c => c[a])) - Math.min(...cells.map(c => c[a])) + 1);
};

const { inventory } = solved[0].config;

/** Chain the shape and check it is what the log says it is. */
function verify(record) {
  const placed = chainTrack(routeOf(record.shape));

  // chainTrack throws on an open or colliding route, so reaching here is most
  // of the check. The round trip catches a shape holding a letter the chain
  // silently reinterpreted.
  if (shapeOf(placed.map(p => p.type)) !== record.shape) {
    throw new Error(`${record.shape} does not round-trip through the letters`);
  }

  // The sweep spends the inventory in full — that is explore.py's only mode —
  // so this is `!==`, not a ceiling. A shape spending fewer cubes than claimed
  // would still be a legal track, and would still be the wrong answer.
  const spent = countPieces(placed);
  for (const pool of POOLS) {
    const held = inventory[pool] ?? 0;
    if (spent[pool] !== held) {
      throw new Error(`${record.shape} spends ${spent[pool]} ${pool}, not the ${held} held`);
    }
  }

  const span = spanOf(placed);
  if (span.join('x') !== record.span) {
    throw new Error(`${record.shape} spans ${span.join('x')}, logged as ${record.span}`);
  }

  const cubes = placed.filter(p => !p.revisit).length;
  if (cubes !== record.cubes) {
    throw new Error(`${record.shape} is ${cubes} cubes, logged as ${record.cubes}`);
  }

  return { shape: record.shape, span };
}

// Sorted rather than kept in the order they were found. A resumed sweep replays
// its seed stream, so discovery order is an artefact of where the run was
// interrupted; sorting makes the file a function of the shapes alone, and two
// extracts of the same log identical.
const byShape = new Map();
for (const record of solved) {
  if (!byShape.has(record.shape)) byShape.set(record.shape, verify(record));
}
const shapes = [...byShape.values()].sort((a, b) => a.shape.localeCompare(b.shape));

const scores = new Set(solved.map(r => r.score));
const cubes = new Set(solved.map(r => r.cubes));
if (scores.size !== 1 || cubes.size !== 1) {
  // Every full-spend layout holds the same multiset of pieces, so they all tie
  // on score — see "SCORES is inert" in CLAUDE.md. If that ever stops being
  // true here, the score belongs per shape rather than above them.
  throw new Error('the rounds disagree on score or cube count');
}

const data = {
  source: input,
  generatedBy: 'scripts/extract-sweep.js',
  question: solved[0].config,
  cubes: [...cubes][0],
  score: [...scores][0],
  rounds: records.length,
  solved: solved.length,
  distinct: shapes.length,
  shapes,
};

// One layout per line, rather than JSON.stringify's four. The file is checked
// in and a re-extract after a longer sweep should read as lines added, not as
// every layout reindented.
const body = JSON.stringify({ ...data, shapes: [] }, null, 2)
  .replace('"shapes": []', () => ['"shapes": [',
    ...shapes.map((s, i) => `    ${JSON.stringify(s)}${i < shapes.length - 1 ? ',' : ''}`),
    '  ]'].join('\n'));

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${body}\n`);

console.log(`${input}: ${records.length} rounds, ${solved.length} solved, `
  + `${shapes.length} distinct — all verified`);
console.log(`wrote ${output}`);
