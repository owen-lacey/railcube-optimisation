// The leaderboard behind the track builder: a Cloudflare Worker over one D1 table
// (migrations/). The site is static, so this is the only thing that keeps state.
//
// POST /submissions  { shape } → { id, rank, name, score, readings, duplicate, token }
//   Sent the moment a builder's loop closes. The shape is re-chained and re-scored
//   by `assess`, the same code the builder scores with; a score sent alongside it
//   would be ignored, so none is read. A track already on the board (by
//   `trackKey`, so turned, moved or entered at another piece) stays its first
//   submitter's, and the answer is that row, with no token.
// PATCH /submissions/:id  { token, name, notes } → the row
//   Signs a new row: only the token its POST handed back may, and the name is
//   required. The name is served; the notes never are.
// GET /leaderboard?id=N&limit=L → { total, top, entry, histogram }
//   The best L rows (TOP unless asked, at most MAX_LIMIT), row N wherever it
//   ranks, and how many rows score each score, as [score, count] pairs.
//
// Rank is one more than the rows scoring strictly higher, so ties share it; within
// a tie the earlier submission is listed first.

import { assess, sha256, NAME_LIMIT, NOTES_LIMIT } from '../site/src/lib/submission.js';

const TOP = 10;
const MAX_LIMIT = 100;

const ROW = `id, shape, name, score, knotted, poses, close_calls, repeats, longest_side,
  (SELECT COUNT(*) FROM submissions AS above WHERE above.score > submissions.score) + 1 AS rank`;

const entryOf = row => row && {
  id: row.id,
  rank: row.rank,
  shape: row.shape,
  name: row.name,
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

const refuse = (status, error) => Response.json({ error }, { status });

async function submit(request, db) {
  const { shape } = await request.json();
  if (typeof shape !== 'string') return refuse(400, 'shape must be a string');
  let assessed;
  try {
    assessed = await assess(shape);
  } catch (error) {
    return refuse(422, `not a track: ${error.message}`);
  }
  const { readings: r, score, hash } = assessed;
  const token = crypto.randomUUID();
  const inserted = await db.prepare(`INSERT INTO submissions
      (shape, track_hash, score, knotted, poses, close_calls, repeats, longest_side, token_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (track_hash) DO NOTHING RETURNING id`)
    .bind(shape, hash, score, r.knotted, r.poses, r.closeCalls, r.repeats, r.longestSide, await sha256(token))
    .first();
  const id = inserted?.id
    ?? (await db.prepare('SELECT id FROM submissions WHERE track_hash = ?').bind(hash).first()).id;
  const entry = entryOf(await byId(db, id));
  return Response.json(inserted ? { ...entry, duplicate: false, token } : { ...entry, duplicate: true });
}

async function sign(request, id, db) {
  const { token, name, notes = '' } = await request.json();
  if (typeof token !== 'string' || typeof name !== 'string' || typeof notes !== 'string') {
    return refuse(400, 'token, name and notes must be strings');
  }
  const signed = name.trim();
  if (!signed) return refuse(422, 'a name is required');
  if (signed.length > NAME_LIMIT) return refuse(422, `names are limited to ${NAME_LIMIT} characters`);
  if (notes.length > NOTES_LIMIT) return refuse(422, `notes are limited to ${NOTES_LIMIT} characters`);
  const { meta } = await db.prepare('UPDATE submissions SET name = ?, notes = ? WHERE id = ? AND token_hash = ?')
    .bind(signed, notes || null, id, await sha256(token))
    .run();
  if (meta.changes === 0) return refuse(403, 'that track is not yours to sign');
  return Response.json(entryOf(await byId(db, id)));
}

async function leaderboard(url, db) {
  const id = url.searchParams.get('id');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? TOP), MAX_LIMIT);
  if (!Number.isInteger(limit) || limit < 1) return refuse(400, `limit must be 1 to ${MAX_LIMIT}`);
  const [{ results }, { total }, { results: scores }] = await Promise.all([
    db.prepare(`SELECT ${ROW} FROM submissions ORDER BY score DESC, id LIMIT ?`).bind(limit).all(),
    db.prepare('SELECT COUNT(*) AS total FROM submissions').first(),
    db.prepare('SELECT score, COUNT(*) AS count FROM submissions GROUP BY score ORDER BY score').all(),
  ]);
  const entry = id === null ? null : entryOf(await byId(db, Number(id)));
  return Response.json({
    total,
    top: results.map(entryOf),
    entry,
    histogram: scores.map(({ score, count }) => [score, count]),
  });
}

function route(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/submissions') return submit(request, env.DB);
  const signing = url.pathname.match(/^\/submissions\/(\d+)$/);
  if (request.method === 'PATCH' && signing) return sign(request, Number(signing[1]), env.DB);
  if (request.method === 'GET' && url.pathname === '/leaderboard') return leaderboard(url, env.DB);
  return Response.json({ error: 'not found' }, { status: 404 });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS.split(',').includes(origin);
    const cors = allowed
      ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type',
        // PATCH is not CORS-safelisted, so a preflight must name it.
        'Access-Control-Allow-Methods': 'GET, POST, PATCH',
        Vary: 'Origin',
      }
      : {};
    const response = request.method === 'OPTIONS'
      ? new Response(null, { status: allowed ? 204 : 403 })
      : await route(request, env);
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  },
};
