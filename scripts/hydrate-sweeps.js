// Fill in the readings sweeps.db holds as columns, for rows that predate them.
//
//   node scripts/hydrate-sweeps.js --readings [--from-id N] [--to-id N]
//   node scripts/hydrate-sweeps.js --knots    [--from-id N] [--to-id N]
//   node scripts/hydrate-sweeps.js --knots --front [--readers N]
//   node scripts/hydrate-sweeps.js --recheck N --seed S
//
// `--readings` is everything `derive` in sweep-data.js reads that a row may not
// have yet — faces, repeats, poses, close calls, underground — and takes minutes.
// `--knots` is the two knot readings (scripts/knot-curves.js), ~60 ms a layout
// on one core, so a full pass is a day across the machine: split it by id range,
// one process per range, in tmux. Either resumes by itself: it only ever reads
// rows whose columns are still NULL, a batch at a time, and writes each batch in
// one transaction, so a kill loses one batch and nothing else.
//
// `--knots --front` reads only the knots a weighted best or worst can turn on
// (scripts/knot-front.js), front first, across `--readers` children: minutes,
// where the whole sweep is a day. It is exact for weightings with every weight
// positive; a zero weight needs the rest read too. Legal rows only.
//
// Every row is re-chained from its shape, and the geometry columns it already
// holds must agree with the chain or the pass stops: a hydration is also an audit
// of what it reads. `merge-sweeps.js --check` re-derives the readings; it does not
// re-read knots, which is what `--recheck` is for: N rows drawn uniformly from
// those already read, and every knotted row, read again on fresh rotations. Any
// row that reads differently is a fault, and the exit is nonzero.

import { parseArgs } from 'node:util';

import { assertSpends, DB_PATH, derive, openDb, random } from './sweep-data.js';
import { curvesOf, knotOf, knotReader, knotType } from './knot-curves.js';
import { readFront } from './knot-front.js';

const GEOMETRY = ['span_across', 'span_up', 'span_along', 'volume', 'revisits', 'loop_small', 'loop_large'];
const READINGS = ['faces', 'repeats', 'poses', 'close_calls', 'underground'];
// A seed far from any row id, so a recheck's rotations are not the scan's.
const RECHECK_SEED = 2 ** 32;

const { values: args } = parseArgs({
  options: {
    db: { type: 'string', default: DB_PATH },
    readings: { type: 'boolean', default: false },
    knots: { type: 'boolean', default: false },
    recheck: { type: 'string' },
    seed: { type: 'string' },
    'from-id': { type: 'string', default: '0' },
    'to-id': { type: 'string', default: String(Number.MAX_SAFE_INTEGER) },
    batch: { type: 'string' },
    front: { type: 'boolean', default: false },
    readers: { type: 'string', default: '8' },
  },
});

const db = openDb(args.db);
// Several hydrations write at once, one per id range; each waits its turn.
db.pragma('busy_timeout = 600000');
const questions = new Map(db.prepare('SELECT * FROM questions').all()
  .map(q => [q.id, JSON.parse(q.question)]));

/** Chain a row and check the columns it already holds; its derived columns. */
function rederive(row) {
  const { placed, columns } = derive(row.shape);
  assertSpends(placed, questions.get(row.question_id), row.shape);
  const stale = GEOMETRY.filter(c => columns[c] !== row[c]);
  if (stale.length) {
    throw new Error(`row ${row.id} ${row.shape}: ${stale.map(c => `${c} stored ${row[c]}, derived ${columns[c]}`).join('; ')}`);
  }
  return { placed, columns };
}

/** Every batch of rows in the id range whose `column` is NULL, until there are none. */
function* pending(column, size) {
  const query = db.prepare(`SELECT * FROM layouts WHERE id > ? AND id <= ? AND ${column} IS NULL
    ORDER BY id LIMIT ?`);
  const to = Number(args['to-id']);
  let after = Number(args['from-id']) - 1;
  for (;;) {
    const rows = query.all(after, to, size);
    if (!rows.length) return;
    yield rows;
    after = rows.at(-1).id;
  }
}

function progress(started) {
  let done = 0, next = 10_000;
  return (n, last) => {
    done += n;
    if (done < next) return;
    next += 10_000;
    const seconds = (performance.now() - started) / 1000;
    console.log(`${done} rows, last id ${last}, ${(done / seconds).toFixed(1)}/s`);
  };
}

function hydrateReadings() {
  const update = db.prepare(`UPDATE layouts SET ${READINGS.map(c => `${c} = @${c}`).join(', ')}
    WHERE id = @id`);
  const write = db.transaction(rows => rows.forEach(r => update.run(r)));
  const tick = progress(performance.now());
  for (const rows of pending('poses', Number(args.batch ?? 1000))) {
    write(rows.map(row => ({ id: row.id, ...pick(rederive(row).columns, READINGS) })));
    tick(rows.length, rows.at(-1).id);
  }
}

const pick = (object, keys) => Object.fromEntries(keys.map(k => [k, object[k]]));

/** Each row's two readings, from fresh curves, with rotations seeded at `seed(row)`. */
async function readKnots(reader, rows, seed) {
  const records = rows.map(row => ({ id: row.id, seed: seed(row), curves: curvesOf(rederive(row).placed) }));
  return reader.read(records);
}

async function hydrateKnots() {
  const update = db.prepare('UPDATE layouts SET knot_over = ?, knot_under = ? WHERE id = ?');
  const write = db.transaction((rows, polys) => rows.forEach((row, i) => {
    knotOf(polys[i].over, polys[i].under);
    update.run(polys[i].over, polys[i].under, row.id);
  }));
  const reader = knotReader();
  const tick = progress(performance.now());
  for (const rows of pending('knot_over', Number(args.batch ?? 100))) {
    write(rows, await readKnots(reader, rows, row => row.id));
    tick(rows.length, rows.at(-1).id);
  }
  await reader.close();
}

// The metric sets the weighted tracks may use, each in its good direction.
const FRONT_SETS = [
  { poses: 1, closeCalls: 1, repeats: -1, longestSide: -1 },
  { faces: 1, poses: 1, closeCalls: 1, repeats: -1, longestSide: -1 },
];

/** Every legal row grouped by the metrics FRONT_SETS read, and the knots already read. */
function frontGroups() {
  const groups = new Map(), knots = new Map();
  const rows = db.prepare(`SELECT id, faces, poses, close_calls, repeats,
    max(span_across, span_up, span_along) AS longest, knot_over, knot_under
    FROM layouts WHERE underground = 0`);
  for (const r of rows.iterate()) {
    const key = `${r.faces},${r.poses},${r.close_calls},${r.repeats},${r.longest}`;
    if (!groups.has(key)) {
      groups.set(key, { values: { faces: r.faces, poses: r.poses, closeCalls: r.close_calls,
        repeats: r.repeats, longestSide: r.longest }, ids: [] });
    }
    groups.get(key).ids.push(r.id);
    if (r.knot_over !== null) knots.set(r.id, knotOf(r.knot_over, r.knot_under) !== 'unknot');
  }
  return { groups: [...groups.values()], knots };
}

async function hydrateFront() {
  const { groups, knots } = frontGroups();
  console.log(`${groups.length} groups, ${knots.size} knots already read`);
  const byId = db.prepare('SELECT * FROM layouts WHERE id = ?');
  const update = db.prepare('UPDATE layouts SET knot_over = ?, knot_under = ? WHERE id = ?');
  const write = db.transaction((rows, polys) => rows.forEach((row, i) => {
    knots.set(row.id, knotOf(polys[i].over, polys[i].under) !== 'unknot');
    update.run(polys[i].over, polys[i].under, row.id);
  }));
  const readers = Array.from({ length: Number(args.readers) }, () => knotReader());
  let done = 0;
  const read = async ids => {
    const rows = ids.map(id => byId.get(id));
    const shares = readers.map((_, k) => rows.filter((_, i) => i % readers.length === k));
    const polys = await Promise.all(shares.map((share, k) => readKnots(readers[k], share, row => row.id)));
    shares.forEach((share, k) => write(share, polys[k]));
    done += rows.length;
    if (rows.length) process.stdout.write(`${done} read this run, ${[...knots.values()].filter(Boolean).length} knotted known; `);
  };
  await readFront({ groups, sets: FRONT_SETS, knots, read, wave: 2 * readers.length, say: console.log });
  await Promise.all(readers.map(r => r.close()));
  console.log(`front read: ${done} rows this run`);
}

/** N rows already read, drawn uniformly by id with `seed`, and every knotted one. */
function recheckRows(count, seed) {
  const { lo, hi, read } = db.prepare(`SELECT min(id) AS lo, max(id) AS hi,
    count(*) AS read FROM layouts WHERE knot_over IS NOT NULL`).get();
  if (count > read) throw new Error(`only ${read} rows have been read`);
  const byId = db.prepare('SELECT * FROM layouts WHERE id = ? AND knot_over IS NOT NULL');
  const next = random(seed);
  const taken = new Map();
  while (taken.size < count) {
    const row = byId.get(lo + Math.floor(next() * (hi - lo + 1)));
    if (row) taken.set(row.id, row);
  }
  for (const row of db.prepare(`SELECT * FROM layouts WHERE knot_over IS NOT NULL
    AND (knot_over <> '1' OR knot_under <> '1')`).iterate()) taken.set(row.id, row);
  return [...taken.values()];
}

async function recheck(count, seed) {
  const rows = recheckRows(count, seed);
  const reader = knotReader();
  let faults = 0, knotted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const polys = await readKnots(reader, batch, row => RECHECK_SEED + row.id);
    batch.forEach((row, j) => {
      const stored = [row.knot_over, row.knot_under].map(knotType);
      const again = [polys[j].over, polys[j].under].map(knotType);
      if (knotOf(row.knot_over, row.knot_under) !== 'unknot') knotted += 1;
      if (stored.some((k, n) => k !== again[n])) {
        faults += 1;
        console.log(`row ${row.id} ${row.shape}: stored ${stored.join(' / ')}, read again as ${again.join(' / ')}`);
      }
    });
  }
  await reader.close();
  console.log(`${rows.length} rows read again (${knotted} knotted), ${faults} disagree`);
  return faults;
}

if (args.readings) hydrateReadings();
else if (args.knots && args.front) await hydrateFront();
else if (args.knots) await hydrateKnots();
else if (args.recheck && Number.isInteger(Number(args.seed))) process.exitCode = await recheck(Number(args.recheck), Number(args.seed)) ? 1 : 0;
else {
  console.error('usage: node scripts/hydrate-sweeps.js [--db <path>] --readings | --knots '
    + '[--from-id N] [--to-id N] [--batch N] | --knots --front [--readers N] | --recheck N --seed S');
  process.exitCode = 2;
}
db.close();
