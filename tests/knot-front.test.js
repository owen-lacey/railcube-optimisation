// scripts/knot-front.js against brute force: over a made-up population whose
// knots are all known up front, every layout tied at the best or the worst of
// every positive weighting must have been read, and far from everything should be.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFront } from '../scripts/knot-front.js';
import { random } from '../scripts/sweep-data.js';

const SETS = [{ a: 1, b: -1, c: 1 }, { a: 1, b: 1 }];

/** Groups tied on a, b, c, a few layouts each, about one in eight knotted. */
function population(seed) {
  const next = random(seed);
  const groups = new Map(), truth = new Map();
  let id = 0;
  for (let n = 0; n < 3000; n++) {
    const values = { a: Math.floor(next() * 12), b: Math.floor(next() * 9), c: Math.floor(next() * 7) };
    const key = Object.values(values).join(',');
    if (!groups.has(key)) groups.set(key, { values, ids: [] });
    groups.get(key).ids.push(id);
    truth.set(id++, next() < 0.125);
  }
  return { groups: [...groups.values()], truth };
}

/** Every layout tied at either end of one weighting, knotted weighing `k`. */
function extremes(groups, truth, set, weights, k) {
  const scored = groups.flatMap(g => g.ids.map(id => [id, Object.entries(set)
    .reduce((s, [m, d], i) => s + weights[i] * d * g.values[m], k * Number(truth.get(id)))]));
  const scores = scored.map(([, s]) => s);
  const [hi, lo] = [Math.max(...scores), Math.min(...scores)];
  return scored.filter(([, s]) => s === hi || s === lo).map(([id]) => id);
}

for (const seed of [1, 2, 3]) {
  test(`seed ${seed}: every extreme of every positive weighting is read, and few others`, async () => {
    const { groups, truth } = population(seed);
    const knots = new Map();
    const read = async ids => ids.forEach(id => knots.set(id, truth.get(id)));
    await readFront({ groups, sets: SETS, knots, read });
    for (const set of SETS) {
      const n = Object.keys(set).length;
      for (let w = 0; w < 5 ** (n + 1); w++) {
        const digits = Array.from({ length: n + 1 }, (_, i) => 1 + Math.floor(w / 5 ** i) % 5);
        for (const id of extremes(groups, truth, set, digits.slice(1), digits[0])) {
          assert.ok(knots.has(id), `layout ${id} is extreme under ${digits} and was never read`);
        }
      }
    }
    assert.ok(knots.size < truth.size / 2, `${knots.size} of ${truth.size} read`);
  });
}
