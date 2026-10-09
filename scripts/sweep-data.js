// Reading sweep logs and the layout database, and checking one against the other.
//
// A sweep log is a record of a *run* — one line per round, with seeds, wall
// times, statuses and the rounds that came back with nothing — and it is the
// staging area: gitignored, appended to while a sweep runs. The database is
// what the runs add up to: one row per question, and every distinct layout
// found for it, with the columns worth querying on. It is gitignored too,
// because it is rebuilt from the logs. scripts/merge-sweeps.js moves layouts
// from the first to the second; this is what it and its tests share.
//
// Nothing here believes a log. Every shape is chained through the model,
// counted against the inventory of the question it claims to answer, and its
// span recomputed and compared with the one recorded — the same rule the tests
// and scripts/check-route.js follow, because a shape that came out of a solver
// is a claim until the geometry agrees.

import { closeSync, openSync, readSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

import { chainTrack, countPieces, POOLS } from '../src/track.js';
import { loopsOf, routeOf, shapeOf, trackKey } from '../src/layouts.js';
import { closeCallsOf, metricsOf, posesOf, spanOf } from '../src/metrics.js';

export const DB_PATH = fileURLToPath(new URL('../sweeps.db', import.meta.url));

// A question is stored as its `questionOf` JSON: there are one or two of them,
// and what they are for is being matched exactly, which a string does. The
// layouts are what gets queried, so everything the geometry decides about one
// is a column of its own.
//
// `track_hash` is what makes "the same physical track" a constraint rather than
// a scan: `trackKey` is ~1 KB, so it is stored hashed. `mirrored` is NULL where
// the log did not say (explore.py has no mirror pass), and the loops are NULL
// where nothing is crossed.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS questions (
    id       INTEGER PRIMARY KEY,
    question TEXT NOT NULL UNIQUE,
    cubes    INTEGER NOT NULL,
    score    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS layouts (
    id          INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    shape       TEXT NOT NULL,
    track_hash  BLOB NOT NULL,
    span_across INTEGER NOT NULL,
    span_up     INTEGER NOT NULL,
    span_along  INTEGER NOT NULL,
    volume      INTEGER NOT NULL,
    revisits    INTEGER NOT NULL,
    mirrored    INTEGER,
    loop_small  INTEGER,
    loop_large  INTEGER,
    faces       INTEGER,
    repeats     INTEGER,
    poses       INTEGER,
    close_calls INTEGER,
    underground INTEGER,
    knot_over   TEXT,
    knot_under  TEXT,
    source_log  TEXT NOT NULL,
    merged_at   TEXT NOT NULL,
    UNIQUE (question_id, shape),
    UNIQUE (question_id, track_hash)
  );
`;

/**
 * The database, created if it is not there. WAL, so it can be queried from a
 * shell while a watch is writing to it.
 */
export function openDb(path = DB_PATH) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

/** mulberry32: a small seeded PRNG, so a draw is a function of its seed. */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** `trackKey`, hashed to the 32 bytes the database keys on. */
export const trackHash = shape => createHash('sha256').update(trackKey(shape)).digest();

/**
 * The part of a sweep's config that is the question. Everything else a log
 * records — `minLoopLength`, `tightCrossings`, `exclude` — steers the search
 * without changing what counts as an answer, so rungs of one ladder merge into
 * one question. The inventory states every pool, zeros included, so an omitted
 * pool cannot quietly read as permitted; and a full-spend sweep that logs no
 * `steps` took one step per cube.
 */
export function questionOf(config) {
  const inventory = Object.fromEntries(POOLS.map(pool => [pool, config.inventory[pool] ?? 0]));
  const cubes = Object.values(inventory).reduce((a, b) => a + b, 0);
  return {
    inventory,
    steps: config.steps ?? cubes,
    box: config.box,
    minY: config.minY,
    startPose: config.startPose,
  };
}

// Big enough that a pass is a few hundred reads, small enough to be no burden.
const CHUNK = 1 << 24;

/**
 * Every solved record in a log, one at a time. Read a chunk at a time rather
 * than as one string, because a meet log outgrows the longest string V8 will
 * make (~512 MB), and the records are never all held at once. A generator, so a
 * reader can await between records. A log reaching here has been claimed from
 * its sweep and has settled, so it ends in a newline: anything after the last
 * one is a record cut short, which is an error. A round that timed out before
 * finding anything carries no shape and is not an answer.
 */
export function* staged(path) {
  const fd = openSync(path, 'r');
  const chunk = Buffer.alloc(CHUNK);
  let carry = Buffer.alloc(0);
  try {
    for (let n; (n = readSync(fd, chunk, 0, CHUNK, null)) > 0;) {
      const bytes = Buffer.concat([carry, chunk.subarray(0, n)]);
      const end = bytes.lastIndexOf(0x0a) + 1;
      for (const line of bytes.toString('utf8', 0, end).split('\n')) {
        if (!line.trim()) continue;
        const record = JSON.parse(line);
        if (record.shape) yield record;
      }
      carry = bytes.subarray(end);
    }
  } finally {
    closeSync(fd);
  }
  if (carry.toString('utf8').trim()) throw new Error(`${path} ends part-way through a record`);
}

/**
 * Chain a shape and read off everything a row stores that the geometry decides.
 * Shared by the way in and the audit, so the two cannot disagree about what a
 * column means.
 */
export function derive(shape) {
  const placed = chainTrack(routeOf(shape));

  // chainTrack throws on an open or colliding route, so reaching here is most
  // of the check. The round trip catches a shape holding a letter the chain
  // silently reinterpreted.
  if (shapeOf(placed.map(p => p.type)) !== shape) {
    throw new Error(`${shape} does not round-trip through the letters`);
  }

  const span = spanOf(placed);
  const cubes = placed.filter(p => !p.revisit).length;
  const loops = loopsOf(placed);
  const { faces, repeats } = metricsOf(placed);
  return {
    placed,
    cubes,
    columns: {
      span_across: span[0],
      span_up: span[1],
      span_along: span[2],
      volume: span[0] * span[1] * span[2],
      // A crossing is a step that spends no cube, so steps minus cubes counts them.
      revisits: placed.length - cubes,
      loop_small: loops === null ? null : loops[0],
      loop_large: loops === null ? null : loops[1],
      faces,
      repeats,
      poses: posesOf(placed),
      close_calls: closeCallsOf(placed),
      underground: placed.filter(p => p.cell[1] < 0).length,
    },
  };
}

/**
 * Every sweep spends the inventory in full, so this is `!==`, not a ceiling. A
 * shape spending fewer cubes than claimed would still be a legal track, and
 * would still be the wrong answer.
 */
export function assertSpends(placed, question, shape) {
  const spent = countPieces(placed);
  for (const pool of POOLS) {
    if (spent[pool] !== question.inventory[pool]) {
      throw new Error(`${shape} spends ${spent[pool]} ${pool}, not the ${question.inventory[pool]} held`);
    }
  }
}

/**
 * Chain a logged shape, check it is what the log says it is, and return its
 * columns as `row`, with the chained `placed` its knot is read from.
 */
export function verify(record, question) {
  const { placed, cubes, columns } = derive(record.shape);
  assertSpends(placed, question, record.shape);

  const span = [columns.span_across, columns.span_up, columns.span_along].join('x');
  if (span !== record.span) {
    throw new Error(`${record.shape} spans ${span}, logged as ${record.span}`);
  }

  if (cubes !== record.cubes) {
    throw new Error(`${record.shape} is ${cubes} cubes, logged as ${record.cubes}`);
  }

  // explore.py has no crossings encoding at all and logs no such field; a sweep
  // that does claim one has to be right about it.
  if (record.revisits !== undefined && columns.revisits !== record.revisits) {
    throw new Error(`${record.shape} revisits ${columns.revisits} cells, logged as ${record.revisits}`);
  }

  // `mirrored` is kept rather than filtered on. A mirror swaps every left curve
  // for a right one, and the inventories swept here hold four of each, so the
  // reflection is a genuinely different track you could genuinely build — not a
  // duplicate. It is also trivially derived from its partner, which a post
  // counting layouts may well want to say. Recording the flag lets it choose;
  // dropping the rows would not. SQLite has no boolean, hence the number.
  return {
    placed,
    row: {
      shape: record.shape,
      ...columns,
      mirrored: record.mirrored === undefined ? null : Number(record.mirrored),
    },
  };
}
