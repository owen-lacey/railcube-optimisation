// Rung 1: the pure track model. Every test here traces to a line in
// docs/coordinates.md — the doc is the specification, this file is its executable
// form. Nothing in here touches the solver or PolyCSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  POSES, FACES, OPPOSITE, PIECE_TYPES, POOLS, POOL_OF,
  isValidPose, poseLetters, cellsFor, step,
  assertNoCollisions, chainTrack, overflowingPool, overflowingPoolByType,
  STARTER, DELUXE,
} from '../src/track.js';
import { loopRoute, inversionRoute } from '../src/routes.js';

const sorted = cells => cells.map(c => c.join(',')).sort();
const key = c => c.join(',');

// ---- Poses ---------------------------------------------------------------

// The extraction hazard. poseLetters reads a letter back out of a cross product,
// so it needs a RIGHT-handed letter→vector map. The project frame (x=right,
// y=up, z=forwards) is left-handed: cross(F, U) = L there, not R. Swap the two
// maps over and every pose's "right" silently becomes "left" — all curves mirror,
// every route still closes, and nothing throws. This is the canary.
test('poseLetters keeps a right-handed frame: at UF, right is right', () => {
  assert.equal(poseLetters('UF').R, 'R');
  assert.equal(poseLetters('UF').L, 'L');
  assert.equal(poseLetters('UF').U, 'U');
  assert.equal(poseLetters('UF').F, 'F');
});

// coordinates.md:80 — "24 valid poses out of 36 letter pairs", one per cube rotation.
test('there are exactly 24 valid poses', () => {
  assert.equal(POSES.length, 24);
  assert.equal(new Set(POSES).size, 24);
});

// coordinates.md:69-70 — heading can never be the face letter or its opposite.
test('a heading on the face axis is invalid', () => {
  for (const face of FACES) {
    assert.equal(isValidPose(face + face), false, `${face}${face} should be invalid`);
    assert.equal(isValidPose(face + OPPOSITE[face]), false, `${face}${OPPOSITE[face]} should be invalid`);
  }
});

// coordinates.md:72-78 — every face admits exactly the four perpendicular headings.
test('every face admits exactly four headings', () => {
  for (const face of FACES) {
    const headings = POSES.filter(p => p[0] === face).map(p => p[1]);
    assert.equal(headings.length, 4);
    assert.equal(new Set(headings).size, 4);
    assert.ok(!headings.includes(face) && !headings.includes(OPPOSITE[face]));
  }
});

// The spike renders in the PolyCSS frame, where R=x, F=y, U=z — right-handed,
// so it takes `heading × face`. src/track.js works in the project frame, which is
// left-handed, so it takes `face × heading`. Different maps, different operand
// order, and they must agree on all 24 poses or the model and the picture drift.
test('poseLetters agrees with the render frame on every pose', () => {
  const DIR = { U: [0, 0, 1], D: [0, 0, -1], F: [0, 1, 0], B: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0] };
  const xp = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const pose of POSES) {
    const right = xp(DIR[pose[1]], DIR[pose[0]]); // the spike's poseRotation, local X
    const want = FACES.find(k => DIR[k].every((v, i) => v === right[i]));
    assert.equal(poseLetters(pose).R, want, `pose ${pose}`);
  }
});

test('poseLetters is a bijection on the six letters, for every pose', () => {
  for (const pose of POSES) {
    const map = poseLetters(pose);
    assert.equal(new Set(Object.values(map)).size, 6, `${pose} does not permute the letters`);
    for (const [from, to] of Object.entries(map)) {
      assert.equal(map[OPPOSITE[from]], OPPOSITE[to], `${pose} breaks opposites at ${from}`);
    }
  }
});

// ---- The move catalogue --------------------------------------------------

// coordinates.md:114-121, the UF row of "What each piece does".
test('every piece move matches the catalogue at UF', () => {
  const expected = {
    straight:     { disp: [0, 0, 1],  exit: 'UF' },
    cross:        { disp: [0, 0, 1],  exit: 'UF' },
    leftCurve:    { disp: [-2, 0, 1], exit: 'UL' },
    rightCurve:   { disp: [2, 0, 1],  exit: 'UR' },
    insideCurve:  { disp: [0, 2, 1],  exit: 'BU' },
    outsideCurve: { disp: [0, -1, 0], exit: 'FD' },
  };
  for (const [type, want] of Object.entries(expected)) {
    const head = step([0, 0, 0], 'UF', type);
    assert.deepEqual(head.cell, want.disp, `${type} displacement`);
    assert.equal(head.pose, want.exit, `${type} exit pose`);
  }
});

// coordinates.md:114-121, the "Cells occupied" column.
test('every piece footprint matches the catalogue at UF', () => {
  const expected = {
    straight:     [[0, 0, 0]],
    cross:        [[0, 0, 0]],
    leftCurve:    [[0, 0, 0], [0, 0, 1], [-1, 0, 0], [-1, 0, 1]],
    rightCurve:   [[0, 0, 0], [0, 0, 1], [1, 0, 0], [1, 0, 1]],
    insideCurve:  [[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1]],
    outsideCurve: [[0, 0, 0]],
  };
  for (const [type, want] of Object.entries(expected)) {
    assert.deepEqual(sorted(cellsFor(type, 'UF', [0, 0, 0]).material), sorted(want), type);
  }
});

// coordinates.md:125-128 — "Four left curves make a ring": displacements sum to
// zero and the four 2×2 footprints tile a 4×4 square exactly. The tiling half is
// the sharper check — it catches a mirrored or mis-rotated footprint that still
// happens to close.
test('four left curves close a ring and tile a 4x4 square', () => {
  const placed = chainTrack(['leftCurve', 'leftCurve', 'leftCurve', 'leftCurve']);
  const cells = placed.flatMap(p => p.material);
  assert.equal(cells.length, 16);
  assert.equal(new Set(cells.map(key)).size, 16, 'footprints overlap');
  assert.deepEqual([...new Set(cells.map(c => c[1]))], [0], 'the ring is not flat');
  const xs = [...new Set(cells.map(c => c[0]))].sort((a, b) => a - b);
  const zs = [...new Set(cells.map(c => c[2]))].sort((a, b) => a - b);
  assert.equal(xs.length, 4, 'not 4 wide');
  assert.equal(zs.length, 4, 'not 4 deep');
  assert.deepEqual(xs, [xs[0], xs[0] + 1, xs[0] + 2, xs[0] + 3], 'x range has a gap');
  assert.deepEqual(zs, [zs[0], zs[0] + 1, zs[0] + 2, zs[0] + 3], 'z range has a gap');
});

test('four right curves also close a ring', () => {
  const placed = chainTrack(['rightCurve', 'rightCurve', 'rightCurve', 'rightCurve']);
  assert.equal(new Set(placed.flatMap(p => p.material).map(key)).size, 16);
});

test('four inside curves close a vertical ring', () => {
  const placed = chainTrack(['insideCurve', 'insideCurve', 'insideCurve', 'insideCurve']);
  assert.equal(new Set(placed.flatMap(p => p.material).map(key)).size, 16);
});

// coordinates.md:129-132 — "Rotation covers up and over". An outside curve entered
// at BU (climbing a wall) is the same row rotated: 1 forwards, exiting UF.
test('an outside curve entered at BU crests the wall onto its top', () => {
  const head = step([0, 0, 0], 'BU', 'outsideCurve');
  assert.deepEqual(head.cell, [0, 0, 1], 'should move 1 forwards');
  assert.equal(head.pose, 'UF');
});

test('every move from every pose lands on a valid pose', () => {
  for (const pose of POSES) {
    for (const type of PIECE_TYPES) {
      const head = step([0, 0, 0], pose, type);
      assert.ok(isValidPose(head.pose), `${type} from ${pose} exits to invalid ${head.pose}`);
    }
  }
});

// A piece's own cell is always part of its footprint — it is the cell it clicks into.
test('every piece occupies its own cell, from every pose', () => {
  for (const pose of POSES) {
    for (const type of PIECE_TYPES) {
      const { material } = cellsFor(type, pose, [3, 4, 5]);
      assert.ok(material.some(c => key(c) === '3,4,5'), `${type} at ${pose} misses its own cell`);
    }
  }
});

// ---- What the train needs ------------------------------------------------

// coordinates.md:155-162, the clearance table verbatim.
test('train clearance matches the catalogue at UF', () => {
  const expected = {
    straight:     [[0, 1, 0]],
    cross:        [[0, 1, 0]],
    leftCurve:    [[0, 1, 0], [0, 1, 1], [-1, 1, 0], [-1, 1, 1]],
    rightCurve:   [[0, 1, 0], [0, 1, 1], [1, 1, 0], [1, 1, 1]],
    insideCurve:  [],
    outsideCurve: [[0, 1, 0], [0, 1, 1], [0, 0, 1]],
  };
  for (const [type, want] of Object.entries(expected)) {
    assert.deepEqual(sorted(cellsFor(type, 'UF', [0, 0, 0]).train), sorted(want), type);
  }
});

// coordinates.md:155-162, the Count column: 1 / 1 / 4 / 4 / 0 / 3. Counts are a
// property of the piece, not of how it is turned.
test('clearance cell counts are the same from every pose', () => {
  const counts = { straight: 1, cross: 1, leftCurve: 4, rightCurve: 4, insideCurve: 0, outsideCurve: 3 };
  for (const pose of POSES) {
    for (const [type, want] of Object.entries(counts)) {
      const { train } = cellsFor(type, pose, [0, 0, 0]);
      assert.equal(train.length, want, `${type} at ${pose}`);
      assert.equal(new Set(train.map(key)).size, want, `${type} at ${pose} repeats a cell`);
    }
  }
});

// coordinates.md:143-144 — "the cell the rail's face points into, never the cube's
// own cell". Stronger: no piece's train ever lands inside its own material, which
// is why the inside curve's list is empty rather than four cells.
test('no piece needs a train cell inside its own footprint', () => {
  for (const pose of POSES) {
    for (const type of PIECE_TYPES) {
      const { material, train } = cellsFor(type, pose, [0, 0, 0]);
      const solid = new Set(material.map(key));
      for (const c of train) {
        assert.ok(!solid.has(key(c)), `${type} at ${pose} wants train cell ${key(c)} inside itself`);
      }
    }
  }
});

// ---- Collisions ----------------------------------------------------------

const place = (type, pose, cell) => ({ type, pose, cell, ...cellsFor(type, pose, cell) });

test('two pieces in the same cell collide', () => {
  assert.throws(
    () => assertNoCollisions([place('straight', 'UF', [0, 0, 0]), place('straight', 'UF', [0, 0, 0])]),
    /collision/,
  );
});

test('a curve overlapping a straight collides', () => {
  // The left curve at the origin claims [-1,0,0]; a straight parked there hits it.
  assert.throws(
    () => assertNoCollisions([place('leftCurve', 'UF', [0, 0, 0]), place('straight', 'UF', [-1, 0, 0])]),
    /collision/,
  );
});

// coordinates.md:150 — "no cell is ever both material and train".
test('a cube parked in the train cell above a rail collides', () => {
  assert.throws(
    () => assertNoCollisions([place('straight', 'UF', [0, 0, 0]), place('straight', 'UF', [0, 1, 0])]),
    /clearance/,
  );
});

// coordinates.md:180-183 — "Trains never conflict with each other, only with
// material." Two rails facing each other across a gap both want the cell between
// them, and that is legal: there is only one train.
test('two pieces may want the same train cell', () => {
  assert.doesNotThrow(() => assertNoCollisions([
    place('straight', 'UF', [0, 0, 0]),   // rail on top, train needs [0,1,0]
    place('straight', 'DF', [0, 2, 0]),   // rail underneath, train needs [0,1,0] too
  ]));
});

// coordinates.md:176-177 — the cross is one piece visited twice, and both visits
// want the same single cell above it. Nothing extra to claim.
test('a cross needs one train cell, not two', () => {
  assert.equal(cellsFor('cross', 'UF', [0, 0, 0]).train.length, 1);
});

// ---- Chaining ------------------------------------------------------------

// coordinates.md:95-100 — closure is cell AND pose. Coming back to the start cell
// with the wrong face or heading means the last piece cannot click into the first.
test('chainTrack rejects a route that does not return to the start cell', () => {
  assert.throws(() => chainTrack(['straight', 'straight']), /does not close/);
});

test('chainTrack rejects a route that returns to the start cell with the wrong pose', () => {
  // Four outside curves tour the four faces round one axis and land back on the
  // start cell — but the pose has turned through 360° the wrong way about.
  assert.throws(
    () => chainTrack(['outsideCurve', 'outsideCurve', 'outsideCurve', 'outsideCurve', 'straight']),
    /does not close/,
  );
});

test('the documented loop route is a legal track', () => {
  const placed = chainTrack(loopRoute);
  assert.equal(placed.length, loopRoute.length);
});

test('the six-face inversion route is a legal track', () => {
  const placed = chainTrack(inversionRoute);
  assert.equal(placed.length, 14);
  // Its whole point: the rail sits on all six faces of a cube at some point.
  assert.equal(new Set(placed.map(p => p.pose[0])).size, 6);
});

test('both documented routes fit inside the starter set', () => {
  assert.equal(overflowingPool(loopRoute, STARTER), null);
  assert.equal(overflowingPool(inversionRoute, STARTER), null);
});

// ---- Inventory -----------------------------------------------------------

// pieces.md:144-156. The white start cube is geometrically a straight and is
// counted as one, so the totals are the published 32 and 66 track cubes.
test('inventories total 32 and 66 track cubes', () => {
  const total = inv => Object.values(inv).reduce((a, b) => a + b, 0);
  assert.equal(total(STARTER), 32);
  assert.equal(total(DELUXE), 66);
});

// pieces.md:154 — the starter set ships no crosses at all, which is why the
// cross/revisit rung has to run against deluxe.
test('the starter set has no crosses and deluxe has two', () => {
  assert.equal(STARTER.cross, 0);
  assert.equal(DELUXE.cross, 2);
});

// pieces.md:150 — green and blue flat curves are listed as "8/16 combined", so
// they are one pool, not four of each. Every other type is its own pool.
test('the flat curves share one inventory pool', () => {
  assert.equal(POOL_OF.leftCurve, 'flatCurve');
  assert.equal(POOL_OF.rightCurve, 'flatCurve');
  assert.equal(POOLS.length, PIECE_TYPES.length - 1);
});

test('every inventory names every pool, and every type has one', () => {
  for (const inv of [STARTER, DELUXE]) {
    assert.deepEqual(Object.keys(inv).sort(), [...POOLS].sort());
  }
  for (const type of PIECE_TYPES) assert.ok(POOLS.includes(POOL_OF[type]), type);
});

// A route of 8 left curves would be legal under 4-left-plus-4-right bookkeeping
// but not under a shared pool of 8 — this is the test that pins which we mean.
test('the shared pool is spent by left and right curves together', () => {
  // By type, because these lists are pool arithmetic rather than real tracks.
  const fiveEach = [...Array(5).fill('leftCurve'), ...Array(5).fill('rightCurve')];
  assert.equal(overflowingPoolByType(fiveEach, STARTER), 'flatCurve');
  const fourEach = [...Array(4).fill('leftCurve'), ...Array(4).fill('rightCurve')];
  assert.equal(overflowingPoolByType(fourEach, STARTER), null);
});
