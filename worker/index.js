// The leaderboard behind the track builder: a Cloudflare Worker over one D1 table
// (migrations/). The site is static, so this is the only thing that keeps state.
//
// POST /submissions  { shape, notes } → { id, rank, score, readings, duplicate }
//   The shape is re-chained and re-scored by `assess`, the same code the builder
//   scores with; a score sent alongside it would be ignored, so none is read. A
//   track already on the board (by `trackKey`, so turned, moved or entered at
//   another piece) stays its first submitter's, and the answer is that row.
// GET /leaderboard?id=N → { total, top, entry }
//   The best TOP rows, and row N wherever it ranks. Notes are never served.
//
// Rank is one more than the rows scoring strictly higher, so ties share it; within
// a tie the earlier submission is listed first.

import { assess, NOTES_LIMIT } from '../site/src/lib/submission.js';

const TOP = 10;

const ROW = `id, shape, score, knotted, poses, close_calls, repeats, longest_side,
  (SELECT COUNT(*) FROM submissions AS above WHERE above.score > submissions.score) + 1 AS rank`;

const entryOf = row => row && {
  id: row.id,
  rank: row.rank,
  shape: row.shape,
  score: row.score,
  readings: {
    knotted: row.knotted,
    poses: row.poses,
    closeCalls: row.close_calls,
    repeats: row.repeats,
    longestSide: row.longest_side,
  },
};

const byId = (db, id) => db.prepare(`SELECT ${ROW} FROM submissions WHERE id = ?`).bind(id).first();

async function submit(request, db) {
  const { shape, notes = '' } = await request.json();
  if (typeof shape !== 'string' || typeof notes !== 'string') {
    return Response.json({ error: 'shape and notes must be strings' }, { status: 400 });
  }
  if (notes.length > NOTES_LIMIT) {
    return Response.json({ error: `notes are limited to ${NOTES_LIMIT} characters` }, { status: 422 });
  }
  let assessed;
  try {
    assessed = await assess(shape);
  } catch (error) {
    return Response.json({ error: `not a track: ${error.message}` }, { status: 422 });
  }
  const { readings: r, score, hash } = assessed;
  const inserted = await db.prepare(`INSERT INTO submissions
      (shape, track_hash, score, knotted, poses, close_calls, repeats, longest_side, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (track_hash) DO NOTHING RETURNING id`)
    .bind(shape, hash, score, r.knotted, r.poses, r.closeCalls, r.repeats, r.longestSide, notes || null)
    .first();
  const id = inserted?.id
    ?? (await db.prepare('SELECT id FROM submissions WHERE track_hash = ?').bind(hash).first()).id;
  return Response.json({ ...entryOf(await byId(db, id)), duplicate: !inserted });
}

async function leaderboard(url, db) {
  const id = url.searchParams.get('id');
  const [{ results }, { total }] = await Promise.all([
    db.prepare(`SELECT ${ROW} FROM submissions ORDER BY score DESC, id LIMIT ?`).bind(TOP).all(),
    db.prepare('SELECT COUNT(*) AS total FROM submissions').first(),
  ]);
  const entry = id === null ? null : entryOf(await byId(db, Number(id)));
  return Response.json({ total, top: results.map(entryOf), entry });
}

function route(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/submissions') return submit(request, env.DB);
  if (request.method === 'GET' && url.pathname === '/leaderboard') return leaderboard(url, env.DB);
  return Response.json({ error: 'not found' }, { status: 404 });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS.split(',').includes(origin);
    const cors = allowed
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
      : {};
    const response = request.method === 'OPTIONS'
      ? new Response(null, { status: allowed ? 204 : 403 })
      : await route(request, env);
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  },
};
