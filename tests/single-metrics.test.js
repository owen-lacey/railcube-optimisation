// The crossed sweep's best layout on each metric alone, as the post's "these
// metrics on their own are largely unimpressive" shows them.
//
// As with the ranked tracks, that nothing in sweeps.db undercuts them is
// scripts/single-metrics.js's job, since a fresh clone has no database. What is
// checked here is the file: every layout re-chained, spending the inventory, on
// the floor, at its metric's best, and scoring on the other four what it says.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chainTrack, countPieces, POOLS } from '../src/track.js';
import { routeOf } from '../src/layouts.js';
import { readingsOf } from '../site/src/lib/readings.js';
import { SWEEP_CROSSED_SINGLES as singles, SWEEP_CROSSED_WEIGHTS as table } from '../site/src/lib/sweeps.js';
import { DIRECTIONS, weigher } from '../site/src/lib/weighting.js';

const NAMES = Object.keys(DIRECTIONS);
const { score, scale } = weigher(singles.ranges);

test('one layout per metric, over the weights file', () => {
  assert.deepEqual(singles.ranges, table.ranges);
  assert.deepEqual(singles.question, table.question);
  assert.deepEqual(singles.layouts.map(l => l.metric), NAMES);
});

test('every layout is legal, spends the inventory, and is at its metric\'s best', () => {
  for (const { metric, shape, knot, tied, others } of singles.layouts) {
    const placed = chainTrack(routeOf(shape));
    const spent = countPieces(placed);
    for (const pool of POOLS) assert.equal(spent[pool], singles.question.inventory[pool], `${shape} ${pool}`);
    assert.ok(placed.every(p => p.cell[1] >= 0), `${shape} goes below the floor`);
    const values = readingsOf(shape);
    assert.equal(values.knot, knot, shape);
    assert.equal(values[metric], singles.ranges[metric][DIRECTIONS[metric] > 0 ? 1 : 0], `${shape} ${metric}`);
    const rest = Object.fromEntries(NAMES.map(n => [n, Number(n !== metric)]));
    assert.equal(score(values, rest) / scale, others, shape);
    assert.ok(Number.isInteger(tied) && tied >= 1, `${shape} tied ${tied}`);
  }
});
