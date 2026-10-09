// Is a track knotted? The rail's own curve, closed, and its Alexander polynomial.
//
// The curve is trackPath (site/src/lib/render/rail.js), the rail the viewers
// draw, sampled SAMPLES times a piece. The real cross is flat, so the curve
// meets itself there and, strictly, no track is knotted. So the cross's second
// pass is read twice: bumped BUMP units along its `up` (a cube is 20), times
// sin(πs) so it leaves and rejoins the rail smoothly — `over` — and the same
// bump downwards — `under`. A track is knotted if either reading is.
//
// The cross also splits the rail into two lobes: from the middle of its first
// pass round to the middle of its second, and back. Each sample carries its lobe
// (`lobesOf`), so knots.py can try to prove a reading unknotted from a flat
// projection before it asks topoly — see `certified` there.
//
// The polynomial is scripts/knots.py's, which owns topoly and the projections and
// nothing else: the geometry is all here, and so is what a polynomial means.

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

/**
 * Each sample's place in the rail, as two letters and a mark: a kind (`x` the
 * cross's first pass, `y` its second, `-` any other piece) and a lobe (`A` from
 * the middle of the first pass round to the middle of the second, `B` the rest),
 * with `!` on the two samples either side of a pass's middle, where the passes
 * cross. A track without exactly one crossing has no lobes to split into, so
 * every sample is `-A`.
 */
export function lobesOf(placed) {
  const first = placed.findIndex(p => p.type === 'cross' && !p.revisit);
  const second = placed.findIndex(p => p.revisit);
  if (second === -1 || placed.filter(p => p.revisit).length !== 1) {
    return Array(placed.length * SAMPLES).fill('-A');
  }
  const n = placed.length;
  const inA = k => (k - first + n) % n < (second - first + n) % n;
  const middle = s => (s === SAMPLES / 2 - 1 || s === SAMPLES / 2 ? '!' : '');
  return placed.flatMap((_, k) => Array.from({ length: SAMPLES }, (__, s) => {
    const early = s < SAMPLES / 2;
    if (k === first) return (early ? 'xB' : 'xA') + middle(s);
    if (k === second) return (early ? 'yA' : 'yB') + middle(s);
    return inA(k) ? '-A' : '-B';
  }));
}

/** What knots.py is sent for one track: its two readings and their lobes. */
export const knotInput = placed => ({ curves: curvesOf(placed), lobes: lobesOf(placed) });

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
 * `{ id, seed, ...knotInput(placed) }` and resolves to each record's
 * `{ name: polynomial }`, in order. One batch in flight at a time. `timeout` is
 * the seconds one topoly call may take before knots.py gives up on that rotation
 * and tries another. `certify: false` sends every reading to topoly, so a recheck
 * is a reading the certificate had no part in.
 */
export function knotReader({ timeout = 10, certify = true } = {}) {
  const flags = ['--timeout', String(timeout), ...(certify ? [] : ['--topoly-only'])];
  const child = spawn('uv', ['run', '--quiet', KNOTS_PY, ...flags], { stdio: ['pipe', 'pipe', 'inherit'] });
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

/**
 * `readers` knotReaders behind one `read`, which deals the records out round
 * robin and answers in their order. One reader manages ~260 layouts/s, so this
 * is how a read keeps up with a sweep. The children are spawned on the first
 * read that has anything to read, so a pool that never reads costs nothing.
 */
export function knotPool({ readers = 8, timeout = 10, certify = true } = {}) {
  let pool = null;
  const read = async records => {
    if (!records.length) return [];
    pool ??= Array.from({ length: readers }, () => knotReader({ timeout, certify }));
    const shares = pool.map((_, k) => records.filter((_, i) => i % readers === k));
    const answers = await Promise.all(shares.map((share, k) => pool[k].read(share)));
    return records.map((_, i) => answers[i % readers][Math.floor(i / readers)]);
  };
  const close = async () => {
    if (pool !== null) await Promise.all(pool.map(reader => reader.close()));
    pool = null;
  };
  return { read, close, readers };
}
