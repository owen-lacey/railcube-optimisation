// What a submitted track is worth, read one way in the browser and in the Worker
// that keeps the leaderboard (worker/). A submission is only ever its letters: the
// Worker re-chains and re-scores them here, so a score sent from a browser counts
// for nothing.
//
// Any closed loop counts, built from the crossed sweep's pieces: none of them need
// be spent, and neither the box nor the floor holds — Owen's call. So a score here
// is not like-for-like with the sweep's.
//
// The hash is `scripts/sweep-data.js`'s `trackHash`, hex: sha256 of `trackKey`, so
// one physical track is one submission wherever it was entered, turned or moved,
// and a submission can be looked up in sweeps.db by `hex(track_hash)`.

import { chainTrack, countPieces } from '../../../src/track.js';
import { routeOf, trackKey } from '../../../src/layouts.js';
import { liveReadingsOf } from './score.js';
import { scoreOf, WEIGHTS } from './weighting.js';
import ranked from './data/sweep-crossed-ranked.json' with { type: 'json' };

/** The crossed sweep's pieces, since its scores are the ones to beat. */
export const INVENTORY = ranked.question.inventory;

/** The longest artist's notes a submission may carry, in characters. */
export const NOTES_LIMIT = 1000;

/** The longest name a submission may be signed with, in characters. */
export const NAME_LIMIT = 40;

/** Hex sha256 of a string: a track's key, or a submission's edit token. */
export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * `{ shape, readings, score, hash }` for a shape, or a throw saying why it is not
 * a track: it does not close, it collides, or it uses more of a piece than the
 * inventory holds.
 */
export async function assess(shape) {
  const placed = chainTrack(routeOf(shape));
  for (const [pool, count] of Object.entries(countPieces(placed))) {
    if (count > INVENTORY[pool]) throw new Error(`uses ${count} ${pool} pieces, and there are only ${INVENTORY[pool]}`);
  }
  const readings = liveReadingsOf(placed, true);
  return { shape, readings, score: scoreOf(readings, WEIGHTS), hash: await sha256(trackKey(shape)) };
}
