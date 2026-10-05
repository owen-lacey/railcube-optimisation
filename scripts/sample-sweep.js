// Draw a uniform sample of one question's layouts out of the database and write
// it as the data file the site carries.
//
//   node scripts/sample-sweep.js --question 1 --count 1000 --seed 1 \
//     --name sweep-crossed --out site/src/lib/data/sweep-crossed.json
//   --db <path>   another database (default sweeps.db)
//
// The database holds millions of layouts for the crossed question, far more than
// a page can import whole, so the site carries a sample. Uniform over rows, so it
// is honest to the database's distribution — which is skewed to big loops, since
// that is where the sweeps found the most. `--seed` makes the draw reproducible:
// the same seed over the same database writes the same file.
//
// Nothing here believes the database either. Every sampled shape is re-derived
// through `derive` and its stored columns compared, the same audit
// `merge-sweeps.js --check` runs, and one disagreement fails the whole file.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { assertSpends, DB_PATH, derive, openDb, random } from './sweep-data.js';

const COLUMNS = ['span_across', 'span_up', 'span_along', 'revisits', 'loop_small', 'loop_large'];

/**
 * `count` distinct rows of the question, uniformly. Row ids are drawn over the
 * table's whole id range and a draw landing on another question's row, or one
 * already taken, is drawn again — rejection keeps every row equally likely.
 */
function draw(db, questionId, count, seed) {
  const { lo, hi } = db.prepare('SELECT min(id) AS lo, max(id) AS hi FROM layouts').get();
  const row = db.prepare('SELECT * FROM layouts WHERE id = ? AND question_id = ?');
  const next = random(seed);
  const taken = new Map();
  while (taken.size < count) {
    const id = lo + Math.floor(next() * (hi - lo + 1));
    if (taken.has(id)) continue;
    const found = row.get(id, questionId);
    if (found) taken.set(id, found);
  }
  return [...taken.values()];
}

/** Re-derive a row from its shape and check the stored columns agree. */
function audit(row, question) {
  const { placed, cubes, columns } = derive(row.shape);
  assertSpends(placed, question, row.shape);
  if (cubes !== row.cubes) throw new Error(`${row.shape} is ${cubes} cubes, not ${row.cubes}`);
  for (const column of COLUMNS) {
    if (columns[column] !== row[column]) {
      throw new Error(`${row.shape} has ${column} ${columns[column]}, stored as ${row[column]}`);
    }
  }
  return {
    shape: row.shape,
    span: [columns.span_across, columns.span_up, columns.span_along],
    revisits: columns.revisits,
    loops: [columns.loop_small, columns.loop_large],
    mirrored: row.mirrored === 1,
  };
}

function sampleSweep({ db, questionId, count, seed, name }) {
  const held = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
  if (!held) throw new Error(`no question ${questionId} in the database`);
  const { population } = db.prepare(
    'SELECT count(*) AS population FROM layouts WHERE question_id = ?').get(questionId);
  if (count > population) throw new Error(`only ${population} layouts to sample from`);

  const question = JSON.parse(held.question);
  const shapes = draw(db, questionId, count, seed)
    .map(row => audit({ ...row, cubes: held.cubes }, question))
    .sort((a, b) => a.shape.localeCompare(b.shape));

  return {
    name,
    generatedBy: 'scripts/sample-sweep.js',
    question,
    cubes: held.cubes,
    score: held.score,
    population,
    seed,
    distinct: shapes.length,
    mirrors: shapes.filter(s => s.mirrored).length,
    shapes,
  };
}

// One layout per line, as in sweep-28.json, so a re-sample reads as rows changed.
function write(output, data) {
  const body = JSON.stringify({ ...data, shapes: [] }, null, 2)
    .replace('"shapes": []', () => ['"shapes": [',
      ...data.shapes.map((s, i) => `    ${JSON.stringify(s)}${i < data.shapes.length - 1 ? ',' : ''}`),
      '  ]'].join('\n'));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${body}\n`);
}

function main(argv) {
  const option = flag => {
    const i = argv.indexOf(`--${flag}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const [questionId, count, seed] = ['question', 'count', 'seed'].map(f => Number(option(f)));
  const name = option('name');
  const output = option('out');
  if (![questionId, count, seed].every(Number.isInteger) || !name || !output) {
    console.error('usage: node scripts/sample-sweep.js --question <id> --count <n> --seed <n> '
      + '--name <name> --out <file.json> [--db <path>]');
    process.exit(2);
  }

  const db = openDb(option('db') ?? DB_PATH);
  const data = sampleSweep({ db, questionId, count, seed, name });
  db.close();
  write(output, data);
  console.log(`sampled ${data.distinct} of ${data.population.toLocaleString('en-GB')} layouts `
    + `(${data.mirrors} mirrors), seed ${seed} — all re-derived. wrote ${output}`);
}

main(process.argv.slice(2));
