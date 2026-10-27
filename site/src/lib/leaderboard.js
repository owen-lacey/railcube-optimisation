// The leaderboard Worker (worker/index.js), from the browser. Each call throws
// with the Worker's own reason when it refuses, so a dialog can show it.

import { PUBLIC_LEADERBOARD_URL } from '$env/static/public';

/** How many submissions the board needs before its scores are drawn as a histogram. */
export const HISTOGRAM_FROM = 10;

async function call(path, init) {
  let response;
  try {
    response = await fetch(`${PUBLIC_LEADERBOARD_URL}${path}`, init);
  } catch {
    // The browser's own words for this are "Failed to fetch".
    throw new Error("Couldn't reach the leaderboard.");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Puts a closed track on the board: `{ id, rank, name, shape, score, readings,
 * duplicate, token }`. `token` signs it, and comes only with a track new to the board.
 */
export const submit = shape => call('/submissions', json('POST', { shape }));

/** Signs a submission with a public name and private notes, by its token. */
export const sign = (id, token, name, notes) => call(`/submissions/${id}`, json('PATCH', { token, name, notes }));

/** The best `limit` rows, row `id` wherever it ranks, and the scores' histogram. */
export const standings = (id, limit = 10) => call(`/leaderboard?limit=${limit}${id === null ? '' : `&id=${id}`}`);
