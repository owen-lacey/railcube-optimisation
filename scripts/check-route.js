// Check a shape string against the model that owns the geometry.
//
//   node scripts/check-route.js LIORRIOORRLLOIIL
//   node scripts/check-route.js --any --stdin      one shape a line in, one report a line out
//
// For routes that came from somewhere other than src/solver — a benchmark run, a
// layout typed in by hand, an answer from another solver. It chains the route,
// which throws unless it is a legal closed track, and then counts the cubes in
// plain JavaScript rather than believing whatever found it.
//
// There is one set, so there is nothing to name: every route is checked against
// it. Pass --any to skip the inventory check, for routes that were solved against
// something else — the historical answers in src/layouts.js, say.
//
// --stdin is for a generator that checks every answer it makes: one process for
// the whole run instead of one per shape, which scripts/meet.py measured at
// ~0.17 s a spawn — most of its wall time. A route that does not chain comes
// back as `legal: false` with the reason, rather than ending the stream, so the
// caller is the one that decides to stop.

import { createInterface } from 'node:readline';

import { chainTrack, countPieces, POOLS, SET } from '../src/track.js';
import { routeOf } from '../src/layouts.js';

const againstSet = !process.argv.includes('--any');
const streaming = process.argv.includes('--stdin');
const [shape] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

function reportOf(shape) {
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
  return report;
}

if (streaming) {
  for await (const line of createInterface({ input: process.stdin })) {
    const given = line.trim();
    if (!given) continue;
    let report;
    try {
      report = reportOf(given);
    } catch (error) {
      report = { shape: given, legal: false, error: error.message };
    }
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
} else {
  if (!shape) {
    console.error('usage: node scripts/check-route.js <shape> [--any] | --stdin [--any]');
    process.exit(2);
  }
  const report = reportOf(shape);
  console.log(JSON.stringify(report, null, 2));
  if (report.buildable === false) process.exit(1);
}
