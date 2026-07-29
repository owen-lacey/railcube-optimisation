// Check a shape string against the model that owns the geometry.
//
//   node scripts/check-route.js LIORRIOORRLLOIIL
//
// For routes that came from somewhere other than src/solver — a benchmark run, a
// layout typed in by hand, an answer from another solver. It chains the route,
// which throws unless it is a legal closed track, and then counts the cubes in
// plain JavaScript rather than believing whatever found it.
//
// There is one set, so there is nothing to name: every route is checked against
// it. Pass --any to skip the inventory check, for routes that were solved against
// something else — the historical answers in src/layouts.js, say.

import { chainTrack, countPieces, POOLS, SET } from '../src/track.js';
import { routeOf } from '../src/layouts.js';

const [shape] = process.argv.slice(2);
const againstSet = !process.argv.includes('--any');

if (!shape) {
  console.error('usage: node scripts/check-route.js <shape> [--any]');
  process.exit(2);
}

const placed = chainTrack(routeOf(shape));
const cubes = placed.filter(p => !p.revisit);
const spent = countPieces(placed);
const cells = placed.flatMap(p => p.material);
const span = [0, 1, 2].map(a =>
  Math.max(...cells.map(c => c[a])) - Math.min(...cells.map(c => c[a])) + 1);

const report = {
  shape,
  legal: true,                       // chainTrack throws otherwise
  steps: placed.length,
  cubes: cubes.length,
  revisits: placed.length - cubes.length,
  spent,
  span: span.join('x'),
  onTheGround: cells.every(c => c[1] >= 0),
  box: Math.max(...cells.flatMap(c => c.map(Math.abs))),
};

if (againstSet) {
  report.overflows = POOLS.filter(pool => spent[pool] > (SET[pool] ?? 0));
  report.spare = Object.fromEntries(POOLS
    .filter(pool => spent[pool] < (SET[pool] ?? 0))
    .map(pool => [pool, (SET[pool] ?? 0) - spent[pool]]));
  report.buildable = report.overflows.length === 0;
}

console.log(JSON.stringify(report, null, 2));
if (report.buildable === false) process.exit(1);
