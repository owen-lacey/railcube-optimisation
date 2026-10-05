// scripts/meet.py against the brute-force oracle. The generator builds crossed
// tracks from four quarters joined in the cross's frame, and picks the start
// piece afterwards; the oracle walks every route from the start. They share no
// search code, so agreeing on the set of tracks is a real check — on the
// quarters, both joins, the collision port, and the re-anchoring alike.
//
// Tracks, not routes: the oracle returns every cyclic shift that fits the box,
// the generator one reading of each track. `trackKey` is what "the same track"
// means everywhere else, so it is what is compared here.
//
// This spawns `uv`, which the rest of the suite does not need.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { enumerateLoops } from '../src/enumerate.js';
import { chainTrack, countPieces, POOLS } from '../src/track.js';
import { shapeOf, trackKey } from '../src/layouts.js';

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

const stepsFor = inventory => Object.values(inventory).reduce((a, b) => a + b, 0) + 1;

/** Every full-spend loop that crosses itself, as tracks; with `run`, only those holding that many straights in a row. */
function oracleTracks(inventory, box, run = 0) {
  const steps = stepsFor(inventory);
  return new Set(enumerateLoops({ inventory, maxPieces: steps, minPieces: steps, box, minY: 0 })
    .filter(route => {
      const spent = countPieces(chainTrack(route));
      const shape = shapeOf(route);
      return POOLS.every(pool => spent[pool] === (inventory[pool] ?? 0))
        && (shape + shape).includes('S'.repeat(run));
    })
    .map(route => trackKey(shapeOf(route))));
}

function meetShapes(inventory, box, run = 0) {
  return execFileSync('uv', [
    'run', '--quiet', 'scripts/meet.py', '--set', JSON.stringify(inventory),
    '--box', String(box), '--exhaustive', '--run', String(run),
  ], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

function agree(inventory, box, run = 0) {
  const oracle = oracleTracks(inventory, box, run);
  assert.ok(oracle.size > 0, 'the oracle must actually be finding crossed tracks');
  const shapes = meetShapes(inventory, box, run);
  const tracks = new Set(shapes.map(trackKey));
  // One line per track: the generator's own dedupe is exact, not merely close.
  assert.equal(tracks.size, shapes.length, 'a track was printed twice');
  assert.deepEqual([...tracks].sort(), [...oracle].sort());
}

// One track, the figure eight. Its two lobes are the same length, so it is built
// once from each pass and must still be printed once.
test('meet finds exactly the oracle\'s crossed tracks: 4 S, 3 L, 3 R', () => {
  agree({ straight: 4, leftCurve: 3, rightCurve: 3, insideCurve: 0, outsideCurve: 0, cross: 1 }, 6);
});

test('meet finds exactly the oracle\'s crossed tracks: 6 S, 3 L, 3 R', () => {
  agree({ straight: 6, leftCurve: 3, rightCurve: 3, insideCurve: 0, outsideCurve: 0, cross: 1 }, 4);
});

// Inside curves lift the track off the floor, so the floor as well as the box
// decides which pieces can be the start.
test('meet finds exactly the oracle\'s crossed tracks: 4 S, 3 L, 3 R, 2 I', () => {
  agree({ straight: 4, leftCurve: 3, rightCurve: 3, insideCurve: 2, outsideCurve: 0, cross: 1 }, 4);
});

// ~25 s, nearly all of it the oracle. Every curve type, sixteen steps.
slow('meet finds exactly the oracle\'s crossed tracks: 4 S, 3 L, 3 R, 2 I, 2 O', () => {
  agree({ straight: 4, leftCurve: 3, rightCurve: 3, insideCurve: 2, outsideCurve: 2, cross: 1 }, 4);
});

// --run puts a run of straights in lobe B as one fixed motion. 192 crossed
// routes, whose longest runs are 2 or 3: run 2 must find every track and run 3
// only the sixteen routes' worth that hold three.
const RUNS = { straight: 8, leftCurve: 3, rightCurve: 3, insideCurve: 2, outsideCurve: 0, cross: 1 };
for (const run of [2, 3]) {
  test(`meet --run ${run} finds exactly the oracle's crossed tracks with ${run} straights in a row`, () => {
    agree(RUNS, 4, run);
  });
}
