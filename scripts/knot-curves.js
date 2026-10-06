// Is a track knotted? The rail's own curve, closed, and its Alexander polynomial.
//
// The curve is trackPath (site/src/lib/render/rail.js), the rail the viewers
// draw, sampled SAMPLES times a piece. The real cross is flat, so the curve
// meets itself there and, strictly, no track is knotted. So the cross's second
// pass is read twice: bumped BUMP units along its `up` (a cube is 20), times
// sin(πs) so it leaves and rejoins the rail smoothly — `over` — and the same
// bump downwards — `under`. A track is knotted if either reading is.
//
// The polynomial is scripts/knots.py's, which owns topoly and nothing else: the
// geometry is all here, and so is what a polynomial means.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { trackPath } from '../site/src/lib/render/rail.js';

export const SAMPLES = 8;
export const BUMP = 2;

const KNOTS_PY = fileURLToPath(new URL('./knots.py', import.meta.url));

const round = v => v.map(x => Math.round(x * 1000) / 1000);

/** The rail as two closed polylines, the cross's second pass lifted over or dropped under. */
export function curvesOf(placed) {
  const path = trackPath(placed, SAMPLES);
  const reading = sign => path.map(({ pos, up }, i) => {
    const piece = Math.floor(i / SAMPLES), s = (i % SAMPLES) / SAMPLES;
    if (!placed[piece].revisit) return round(pos);
    return round(pos.map((v, k) => v + sign * BUMP * Math.sin(Math.PI * s) * up[k]));
  });
  return { over: reading(1), under: reading(-1) };
}

// Alexander polynomials as topoly writes them, coefficients by degree.
const TYPES = { '1': 'unknot', '1 -1 1': 'trefoil', '1 -3 1': 'figure-eight' };

/** A polynomial's knot, by name where it has one. */
export const knotType = poly => TYPES[poly] ?? `other:${poly}`;

/**
 * The track's knot, either reading. Both readings knotted has never been seen;
 * two different knots would leave nothing to call it, so that is an error.
 */
export function knotOf(over, under) {
  const knots = [...new Set([knotType(over), knotType(under)])].filter(k => k !== 'unknot');
  if (knots.length > 1) throw new Error(`knotted as ${knots.join(' and ')} by the two readings`);
  return knots[0] ?? 'unknot';
}

/**
 * scripts/knots.py as a long-lived child. `read(records)` sends
 * `{ id, seed, curves }` and resolves to each record's `{ name: polynomial }`, in
 * order. One batch in flight at a time. `timeout` is the seconds one topoly call
 * may take before knots.py gives up on that rotation and tries another.
 */
export function knotReader({ timeout = 10 } = {}) {
  const child = spawn('uv', ['run', '--quiet', KNOTS_PY, '--timeout', String(timeout)],
    { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const exited = new Promise(resolve => child.on('exit', resolve));
  const read = async records => {
    if (!records.length) return [];
    child.stdin.write(records.map(r => JSON.stringify(r)).join('\n') + '\n');
    const out = [];
    for (const { id } of records) {
      const { value, done } = await lines.next();
      if (done) throw new Error(`knots.py stopped before answering ${id} (exit ${await exited})`);
      const answer = JSON.parse(value);
      if (answer.id !== id) throw new Error(`knots.py answered ${answer.id}, expected ${id}`);
      out.push(answer.polys);
    }
    return out;
  };
  const close = async () => {
    child.stdin.end();
    const code = await exited;
    if (code !== 0) throw new Error(`knots.py exited ${code}`);
  };
  return { read, close };
}
