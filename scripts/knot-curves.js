// Knots read by topoly: scripts/knots.py as a child process, for the sweeps.
//
// The curves, their lobes and what a polynomial means are site/src/lib/knots.js's,
// which also reads knots in plain JavaScript for the browser. knots.py owns topoly
// and the certificate's projections and nothing else.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { curvesOf, lobesOf } from '../site/src/lib/knots.js';

const KNOTS_PY = fileURLToPath(new URL('./knots.py', import.meta.url));

/** What knots.py is sent for one track: its two readings and their lobes. */
export const knotInput = placed => ({ curves: curvesOf(placed), lobes: lobesOf(placed) });

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
