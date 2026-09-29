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

/** Every full-spend loop that crosses itself, as tracks. */
function oracleTracks(inventory, box) {
  const steps = stepsFor(inventory);
  return new Set(enumerateLoops({ inventory, maxPieces: steps, minPieces: steps, box, minY: 0 })
    .filter(route => {
      const spent = countPieces(chainTrack(route));
      return POOLS.every(pool => spent[pool] === (inventory[pool] ?? 0));
    })
    .map(route => trackKey(shapeOf(route))));
}

function meetShapes(inventory, box) {
  return execFileSync('uv', [
    'run', '--quiet', 'scripts/meet.py', '--set', JSON.stringify(inventory),
    '--box', String(box), '--exhaustive',
  ], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

function agree(inventory, box) {
  const oracle = oracleTracks(inventory, box);
  assert.ok(oracle.size > 0, 'the oracle must actually be finding crossed tracks');
  const shapes = meetShapes(inventory, box);
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
