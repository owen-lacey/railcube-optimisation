// Rung 2: the brute-force oracle. This is the reference the solver gets checked
// against — it is deliberately dumb depth-first search, so that when it and
// CP-SAT disagree the suspicion falls on the clever one.
//
// The baseline numbers quoted in next-session.md were all computed BEFORE train
// clearance existed, so they are upper bounds on what the fuller model allows.
// Every test here says which rule set it is asserting under.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { enumerateLoops } from '../src/enumerate.js';
import { chainTrack, STARTER, overflowingPool } from '../src/track.js';
import { inversionRoute } from '../src/routes.js';

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

// A route as a compact string, for readable assertions: L R I O S X.
const LETTER = {
  leftCurve: 'L', rightCurve: 'R', insideCurve: 'I',
  outsideCurve: 'O', straight: 'S', cross: 'X',
};
const shape = route => route.map(t => LETTER[t]).join('');

// ---- The oracle grades itself --------------------------------------------

// Whatever it returns must survive the model's own validation. If the enumerator
// and chainTrack ever disagree, every downstream baseline is worthless.
test('every route the oracle returns is a legal track', () => {
  const loops = enumerateLoops({ inventory: STARTER, maxPieces: 6, box: 6, checkTrain: true });
  assert.ok(loops.length > 0, 'found nothing to check');
  for (const route of loops) {
    assert.doesNotThrow(() => chainTrack(route), shape(route));
    assert.equal(overflowingPool(route, STARTER), null, shape(route));
  }
});

test('the oracle respects minY: nothing below the ground', () => {
  const loops = enumerateLoops({ inventory: STARTER, maxPieces: 6, box: 6, minY: 0, checkTrain: true });
  for (const route of loops) {
    for (const piece of chainTrack(route)) {
      for (const cell of piece.material) assert.ok(cell[1] >= 0, `${shape(route)} digs to y=${cell[1]}`);
    }
  }
});

// ---- The baseline --------------------------------------------------------

// next-session.md: "exactly 3 closed loops at 4 pieces (LLLL, RRRR, IIII)". That
// count holds only WITH the ground floor — see the next test. This is the number
// the CP-SAT model has to reproduce in rung 3.
test('material-only on the ground, 4 pieces: exactly the three documented rings', () => {
  const loops = enumerateLoops({
    inventory: STARTER, maxPieces: 4, box: 6, minY: 0, checkTrain: false, exclude: ['cross'],
  });
  assert.deepEqual(loops.map(shape).sort(), ['IIII', 'LLLL', 'RRRR']);
});

// Drop the floor and a fourth ring appears: four outside curves crest the four
// edges of a 2×2 block, the train running round its outside. It is a legal loop
// under both collision rules and is excluded only because it digs to one below
// the ground. Worth pinning — "3 rings" is a fact about minY, not about the
// pieces, and the solver will find this one the moment the floor comes off.
test('without the ground floor there is a fourth ring: four outside curves', () => {
  const loops = enumerateLoops({
    inventory: STARTER, maxPieces: 4, box: 6, minY: null, checkTrain: false, exclude: ['cross'],
  });
  assert.deepEqual(loops.map(shape).sort(), ['IIII', 'LLLL', 'OOOO', 'RRRR']);
  const dips = chainTrack(loops.find(r => shape(r) === 'OOOO'));
  assert.ok(dips.some(p => p.material.some(c => c[1] < 0)), 'OOOO should be the one that digs');
});

// Nothing closes in fewer than four pieces, under any rule set: a loop needs to
// turn through a full circle and no piece turns more than a quarter.
test('no loop closes in fewer than four pieces', () => {
  const loops = enumerateLoops({ inventory: STARTER, maxPieces: 3, box: 6, checkTrain: false });
  assert.deepEqual(loops, []);
});

// The same searches with clearance on. Whatever these return IS the fuller
// model's baseline — not required to match the material-only numbers. At four
// pieces they do match: the rings are small enough that nothing gets in the
// train's way. The test exists so that a later change to the clearance table
// shows up here rather than silently downstream.
test('clearance changes nothing at four pieces', () => {
  for (const minY of [0, null]) {
    const bare = enumerateLoops({
      inventory: STARTER, maxPieces: 4, box: 6, minY, checkTrain: false, exclude: ['cross'],
    });
    const clear = enumerateLoops({
      inventory: STARTER, maxPieces: 4, box: 6, minY, checkTrain: true, exclude: ['cross'],
    });
    assert.deepEqual(clear.map(shape).sort(), bare.map(shape).sort(), `minY=${minY}`);
  }
});

// ---- Six faces -----------------------------------------------------------

slow('material-only: no closed loop under 12 pieces reaches all six faces', () => {
  const loops = enumerateLoops({
    inventory: STARTER, maxPieces: 11, box: 6, minY: 0,
    checkTrain: false, exclude: ['cross'], sixFaces: true,
  });
  assert.deepEqual(loops, []);
});

slow('material-only: exactly four six-face loops at 12 pieces within a 6-cell box', () => {
  const loops = enumerateLoops({
    inventory: STARTER, maxPieces: 12, minPieces: 12, box: 6, minY: 0,
    checkTrain: false, exclude: ['cross'], sixFaces: true,
  });
  assert.equal(loops.length, 4, `got ${loops.map(shape).join(' ')}`);

  // next-session.md calls these "one shape plus mirror and rotations". They
  // collapse further than that: all four are the SAME cyclic word read from a
  // different starting piece. The mirror is not a fifth loop, because swapping
  // every left curve for a right one maps this shape onto one of its own
  // rotations — it is self-mirror-symmetric. That is four rotations of one loop,
  // which is why the count is 4 and not 8, and it is the symmetry rung 7 will
  // have to break.
  const rotations = s => [...s].map((_, i) => s.slice(i) + s.slice(0, i));
  const canonical = s => rotations(s).sort()[0];
  assert.equal(new Set(loops.map(r => canonical(shape(r)))).size, 1, 'not all rotations of one shape');

  const mirrored = shape(loops[0]).replace(/[LR]/g, c => (c === 'L' ? 'R' : 'L'));
  assert.ok(rotations(shape(loops[0])).includes(mirrored), 'expected the shape to be its own mirror');
});

// The headline result of adding clearance. Every one of those four dies once the
// train needs room, and so does everything at 13 — the material-only numbers in
// next-session.md really were upper bounds, and this is where that bites.
const sixFaceRun = n => enumerateLoops({
  inventory: STARTER, maxPieces: n, minPieces: n, box: 6, minY: 0,
  checkTrain: true, exclude: ['cross'], sixFaces: true,
});

slow('with clearance: nothing reaches six faces at 12 or 13 pieces', () => {
  assert.deepEqual(sixFaceRun(12), [], 'the four material-only loops should not survive');
  assert.deepEqual(sixFaceRun(13), []);
});

// ~50 s: the widest search in the suite.
slow('with clearance: six faces first becomes possible at 14 pieces', () => {
  const loops = sixFaceRun(14);
  assert.equal(loops.length, 72);
  // The scene committed in the spike is one of them, so the visualisation is
  // sitting exactly on the true minimum for the fuller model — not one over.
  assert.ok(loops.some(r => shape(r) === shape(inversionRoute)), 'the inversion scene should be minimal');
});
