// The meet-in-the-middle figure's data, re-derived from scratch.
//
// The file is a claim about one layout of the crossed sample: that read from its
// cross it is `X · A · X · B`, that each loop is two segments the model will lay,
// and that each loop comes back to the cross in the heading it says. Nothing here
// trusts it: every claim is chained again, and the script is run again to check it
// still writes exactly this file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chainOpen, chainTrack, countPieces, cubeOf, overflowingPoolByType, PIECE_TYPES, startCell } from '../src/track.js';
import { routeOf, trackKey } from '../src/layouts.js';

const FILE = 'site/src/lib/data/meet-figure.json';
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const sample = JSON.parse(readFileSync('site/src/lib/data/sweep-crossed.json', 'utf8'));
const { a, b } = data;
const loopA = a.segments.join('');
const loopB = b.segments.join('');

// A decoy is a near miss: the cube its end's callout reads is within this many of
// the cross at the origin, counted along the axes.
const NEAR = 4;
const offBy = head => cubeOf(head.cell, head.pose).reduce((sum, v) => sum + Math.abs(v), 0);

test('the layout is a row of the crossed sample', () => {
  const row = sample.shapes.find(s => s.id === data.id);
  assert.ok(row, `row ${data.id} is not in the sample`);
  assert.equal(row.shape, data.shape);
});

test('the reading is the same track, started at its cross', () => {
  assert.equal(data.reading[0], 'X');
  assert.equal(data.reading.length, data.shape.length);
  assert.ok((data.shape + data.shape).includes(data.reading), 'not a cyclic shift of the shape');
  assert.equal(trackKey(data.reading), trackKey(data.shape));
});

test('the segments join to the reading, two to a loop, cut down the middle with the X first', () => {
  assert.equal(loopA + loopB, data.reading);
  for (const [loop, segments] of [[loopA, a.segments], [loopB, b.segments]]) {
    assert.equal(segments.length, 2);
    assert.equal(segments[0][0], 'X');
    assert.equal(loop.indexOf('X', 1), -1, `${loop} crosses more than once`);
    assert.equal(segments[0].length, Math.ceil(loop.length / 2));
  }
  assert.ok(loopA.length <= loopB.length, 'loop A is the longer');
});

test('loop A comes back to the cross in its heading', () => {
  const { head, faults } = chainOpen(routeOf(loopA));
  assert.deepEqual(faults, []);
  assert.deepEqual(head.cell, startCell('DF'));
  assert.equal(head.pose, a.heading);
  assert.equal(a.heading, 'DL');
});

test('the whole reading closes, back at the cross in DF', () => {
  chainTrack(routeOf(data.reading));
  const { head } = chainOpen(routeOf(data.reading));
  assert.deepEqual(head.cell, startCell('DF'));
  assert.equal(head.pose, b.heading);
  assert.equal(b.heading, 'DF');
});

test('every segment is legal on its own', () => {
  for (const segment of [...a.segments, ...b.segments]) {
    assert.deepEqual(chainOpen(routeOf(segment)).faults, [], segment);
  }
});

test('each decoy joins the first segment cleanly and misses the cross', () => {
  const [first, second] = a.segments;
  assert.equal(a.decoys.length, 2);
  assert.equal(new Set([...a.decoys, second]).size, 3, 'a decoy repeats, or is the real segment');
  // No two look alike: any two differ in at least five of their seven pieces.
  for (const [i, p] of a.decoys.entries()) {
    for (const q of a.decoys.slice(i + 1)) {
      assert.ok([...p].filter((letter, k) => letter !== q[k]).length >= 5, `${p} and ${q} are too alike`);
    }
  }
  for (const decoy of a.decoys) {
    assert.equal(decoy.length, second.length, decoy);
    assert.doesNotMatch(decoy, /X/, decoy);
    assert.deepEqual(chainOpen(routeOf(decoy)).faults, [], `${decoy} on its own`);
    const route = routeOf(first + decoy);
    const { placed, head, faults } = chainOpen(route);
    assert.deepEqual(faults, [], `${decoy} joined`);
    assert.ok(placed.every(p => p.material.every(c => c[1] >= 0)), `${decoy} goes below the floor`);
    assert.equal(overflowingPoolByType(route, sample.question.inventory), null, `${decoy} overspends`);
    const home = head.cell.every((v, k) => v === startCell('DF')[k]);
    assert.ok(!(home && head.pose === a.heading), `${decoy} closes the loop`);
    assert.ok(offBy(head) <= NEAR, `${decoy} ends ${offBy(head)} cubes off, not a near miss`);
  }
});

test("each of loop B's decoys is within the inventory alone, joins the ¾ track cleanly and misses the cross", () => {
  const [third, last] = b.segments;
  const before = loopA + third;
  assert.equal(b.decoys.length, 2);
  assert.equal(new Set([...b.decoys, last]).size, 3, 'a decoy repeats, or is the real segment');
  for (const decoy of b.decoys) {
    assert.equal(decoy.length, last.length, decoy);
    assert.doesNotMatch(decoy, /X/, decoy);
    assert.deepEqual(chainOpen(routeOf(decoy)).faults, [], `${decoy} on its own`);
    assert.equal(overflowingPoolByType(routeOf(decoy), sample.question.inventory), null, `${decoy} overspends alone`);
    const { placed, head, faults } = chainOpen(routeOf(before + decoy));
    assert.deepEqual(faults, [], `${decoy} joined`);
    assert.ok(placed.every(p => p.material.every(c => c[1] >= 0)), `${decoy} goes below the floor`);
    const home = head.cell.every((v, k) => v === startCell('DF')[k]);
    assert.ok(!(home && head.pose === b.heading), `${decoy} closes the track`);
    assert.ok(offBy(head) <= NEAR, `${decoy} ends ${offBy(head)} cubes off, not a near miss`);
  }
});

test('the real track spends the box exactly', () => {
  const used = countPieces(chainTrack(routeOf(data.reading)));
  for (const pool of PIECE_TYPES) assert.equal(used[pool], sample.question.inventory[pool] ?? 0, pool);
});

test("each step-5 decoy is another layout's loop B that closes with loop A but miscounts the box", () => {
  const { inventory, box } = sample.question;
  const decoys = data.spend.decoys;
  assert.equal(decoys.length, 3);
  assert.equal(new Set([...decoys.map(d => d.loop), loopB]).size, 4, 'a decoy repeats, or is the real loop B');
  for (const { id, loop } of decoys) {
    const row = sample.shapes.find(s => s.id === id);
    assert.ok(row, `row ${id} is not in the sample`);
    const read = [...row.shape].some((letter, i) => {
      if (letter !== 'X') return false;
      const reading = row.shape.slice(i) + row.shape.slice(0, i);
      const at = reading.indexOf('X', 1);
      return at === loopA.length && reading.slice(at) === loop
        && chainOpen(routeOf(reading.slice(0, at))).head.pose === a.heading;
    });
    assert.ok(read, `${loop} is not row ${id}'s loop B after a loop A like ours`);
    assert.equal(loop[0], 'X', loop);
    assert.equal(loop.length, loopB.length, loop);
    const placed = chainTrack(routeOf(loopA + loop));
    const cells = placed.flatMap(p => p.material);
    assert.ok(cells.every(c => c[1] >= 0), `${loop} goes below the floor`);
    assert.ok(Math.max(...cells.flatMap(c => c.map(Math.abs))) <= box, `${loop} leaves the box`);
    const used = countPieces(placed);
    const cubes = n => Object.values(n).reduce((t, k) => t + k, 0);
    assert.equal(cubes(used), cubes(inventory), loop);
    assert.ok(PIECE_TYPES.some(pool => used[pool] !== (inventory[pool] ?? 0)), `${loop} spends the box`);
  }
});

test('the script writes this file again', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'meet-figure-')), 'meet-figure.json');
  execFileSync('node', ['scripts/meet-figure.js', '--id', String(data.id), '--seed', String(data.seed), '--out', out]);
  assert.equal(readFileSync(out, 'utf8'), readFileSync(FILE, 'utf8'));
});
