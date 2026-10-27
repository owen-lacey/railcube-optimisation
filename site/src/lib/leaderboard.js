// The leaderboard Worker (worker/index.js), from the browser. Each call throws
// with the Worker's own reason when it refuses, so a dialog can show it.

import { PUBLIC_LEADERBOARD_URL } from '$env/static/public';

async function call(path, init) {
  const response = await fetch(`${PUBLIC_LEADERBOARD_URL}${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}

/** Sends a track's letters and notes: `{ id, rank, shape, score, readings, duplicate }`. */
export const submit = (shape, notes) => call('/submissions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ shape, notes }),
});

/** The best rows, and row `id` wherever it ranks: `{ total, top, entry }`. */
export const standings = id => call(`/leaderboard?id=${id}`);
