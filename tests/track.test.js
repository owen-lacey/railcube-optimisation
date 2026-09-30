// Rung 1: the pure track model. Every test here traces to a line in
// docs/coordinates.md — the doc is the specification, this file is its executable
// form. Nothing in here touches the solver or the renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  POSES, FACES, OPPOSITE, PIECE_TYPES, POOLS, POOL_OF,
  isValidPose, poseLetters, cellsFor, cubeOf, step,
  assertNoCollisions, chainTrack, chainOpen, countPieces, overflowingPool, overflowingPoolByType,
  SET, SCORES,
} from '../src/track.js';
import { routeOf } from '../src/layouts.js';
import { loopRoute, inversionRoute } from '../src/routes.js';

const sorted = cells => cells.map(c => c.join(',')).sort();
const key = c => c.join(',');

// ---- Poses ---------------------------------------------------------------

// The extraction hazard. poseLetters reads a letter back out of a cross product,
// so it needs a RIGHT-handed letter→vector map. The project frame (x=right,
// y=up, z=forwards) is left-handed: cross(F, U) = L there, not R. Swap the two
// maps over and every pose's "right" silently becomes "left" — all curves mirror,
// every route still closes, and nothing throws. This is the canary.
test('poseLetters keeps a right-handed frame: at DF, right is right', () => {
  assert.equal(poseLetters('DF').R, 'R');
  assert.equal(poseLetters('DF').L, 'L');
  assert.equal(poseLetters('DF').D, 'D');
  assert.equal(poseLetters('DF').U, 'U');
  assert.equal(poseLetters('DF').F, 'F');
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

// The renderer works in the world frame, where R=x, F=y, U=z — right-handed,
// so it takes `heading × overhead`. src/track.js works in the project frame, which
// is left-handed, so it takes `overhead × heading`. Different maps, different
// operand order, and they must agree on all 24 poses or the model and the picture
// drift. Overhead is the floor's opposite.
test('poseLetters agrees with the render frame on every pose', () => {
  const DIR = { U: [0, 0, 1], D: [0, 0, -1], F: [0, 1, 0], B: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0] };
  const xp = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const pose of POSES) {
    const right = xp(DIR[pose[1]], DIR[OPPOSITE[pose[0]]]); // poseRotation's local X
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

// coordinates.md, the table in "What each piece does": entered at DF, where the
// train is once it has travelled the piece.
test('every piece move matches the catalogue at DF', () => {
  const expected = {
    straight:     { disp: [0, 0, 1],  exit: 'DF' },
    cross:        { disp: [0, 0, 1],  exit: 'DF' },
    leftCurve:    { disp: [-2, 0, 1], exit: 'DL' },
    rightCurve:   { disp: [2, 0, 1],  exit: 'DR' },
    insideCurve:  { disp: [0, 1, 0],  exit: 'FU' },
    outsideCurve: { disp: [0, -2, 1], exit: 'BD' },
  };
  for (const [type, want] of Object.entries(expected)) {
    const head = step([0, 0, 0], 'DF', type);
    assert.deepEqual(head.cell, want.disp, `${type} displacement`);
    assert.equal(head.pose, want.exit, `${type} exit pose`);
  }
});

// coordinates.md, the "Cells occupied" column, measured from the train's cell.
test('every piece footprint matches the catalogue at DF', () => {
  const expected = {
    straight:     [[0, -1, 0]],
    cross:        [[0, -1, 0]],
    leftCurve:    [[0, -1, 0], [0, -1, 1], [-1, -1, 0], [-1, -1, 1]],
    rightCurve:   [[0, -1, 0], [0, -1, 1], [1, -1, 0], [1, -1, 1]],
    insideCurve:  [[0, -1, 0], [0, -1, 1], [0, 0, 0], [0, 0, 1]],
    outsideCurve: [[0, -1, 0]],
  };
  for (const [type, want] of Object.entries(expected)) {
    assert.deepEqual(sorted(cellsFor(type, 'DF', [0, 0, 0]).material), sorted(want), type);
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

// coordinates.md — "Rotation covers up and over". An outside curve entered at FU
// (climbing the near side of a wall) is the same row rotated: the train crests the
// wall and ends up on top of the next cube, 2 forwards and 1 up, exiting DF.
test('an outside curve entered at FU crests the wall onto its top', () => {
  const head = step([0, 0, 0], 'FU', 'outsideCurve');
  assert.deepEqual(head.cell, [0, 1, 2], 'should move 2 forwards and 1 up');
  assert.equal(head.pose, 'DF');
});

test('every move from every pose lands on a valid pose', () => {
  for (const pose of POSES) {
    for (const type of PIECE_TYPES) {
      const head = step([0, 0, 0], pose, type);
      assert.ok(isValidPose(head.pose), `${type} from ${pose} exits to invalid ${head.pose}`);
    }
  }
});

// The cube under the train is always part of the footprint — it is the cube the
// piece clicks into.
test('every piece occupies the cube under the train, from every pose', () => {
  for (const pose of POSES) {
    for (const type of PIECE_TYPES) {
      const { material } = cellsFor(type, pose, [3, 4, 5]);
      const cube = key(cubeOf([3, 4, 5], pose));
      assert.ok(material.some(c => key(c) === cube), `${type} at ${pose} misses its cube`);
    }
  }
});

// ---- What the train needs ------------------------------------------------

// coordinates.md, the clearance table in "What the train needs", from the train's cell.
test('train clearance matches the catalogue at DF', () => {
  const expected = {
    straight:     [[0, 0, 0]],
    cross:        [[0, 0, 0]],
    leftCurve:    [[0, 0, 0], [0, 0, 1], [-1, 0, 0], [-1, 0, 1]],
    rightCurve:   [[0, 0, 0], [0, 0, 1], [1, 0, 0], [1, 0, 1]],
    insideCurve:  [],
    outsideCurve: [[0, 0, 0], [0, 0, 1], [0, -1, 1]],
  };
  for (const [type, want] of Object.entries(expected)) {
    assert.deepEqual(sorted(cellsFor(type, 'DF', [0, 0, 0]).train), sorted(want), type);
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
    () => assertNoCollisions([place('straight', 'DF', [0, 0, 0]), place('straight', 'DF', [0, 0, 0])]),
    /collision/,
  );
});

test('a curve overlapping a straight collides', () => {
  // The left curve's train at the origin puts a cube at [-1,-1,0]; a straight
  // whose train is at [-1,0,0] puts its cube there too.
  assert.throws(
    () => assertNoCollisions([place('leftCurve', 'DF', [0, 0, 0]), place('straight', 'DF', [-1, 0, 0])]),
    /collision/,
  );
});

// coordinates.md:150 — "no cell is ever both material and train".
test('a cube parked in the train cell above a rail collides', () => {
  assert.throws(
    () => assertNoCollisions([place('straight', 'DF', [0, 0, 0]), place('straight', 'DF', [0, 1, 0])]),
    /clearance/,
  );
});

// coordinates.md:180-183 — "Trains never conflict with each other, only with
// material." Two rails facing each other across a gap both want the cell between
// them, and that is legal: there is only one train.
test('two pieces may want the same train cell', () => {
  assert.doesNotThrow(() => assertNoCollisions([
    place('straight', 'DF', [0, 0, 0]),   // standing on the floor of [0,0,0]
    place('straight', 'UF', [0, 0, 0]),   // hanging from its ceiling, same cell
  ]));
});

// coordinates.md:176-177 — the cross is one piece visited twice, and both visits
// want the same single cell above it. Nothing extra to claim.
test('a cross needs one train cell, not two', () => {
  assert.equal(cellsFor('cross', 'DF', [0, 0, 0]).train.length, 1);
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

// ---- Chaining without the closure requirement -----------------------------
//
// `chainTrack` asks "is this a track?" and refuses to answer anything else, which
// is right for the solver's output and no use for a track being built by hand: one
// of those is open at every keystroke but the last. `chainOpen` is the same walk
// with closure reported rather than required.

test('an open route places every piece and says it is open', () => {
  const half = routeOf('LIRIROSOL');
  const { placed, closed, faults } = chainOpen(half);

  assert.equal(placed.length, 9, 'every piece is laid down');
  assert.equal(closed, false);
  assert.deepEqual(faults, [], 'an unfinished track is not a broken one');
});

test('the head is where the train is once it has travelled the piece', () => {
  // The start cube is the origin and the train starts on it, in the cell above.
  // One straight in the canonical pose moves it one cell forwards and keeps its
  // pose, which is what makes a straight a straight.
  const { head } = chainOpen(['straight']);
  assert.deepEqual(head.cell, [0, 1, 1]);
  assert.equal(head.pose, 'DF');
});

// The refactor's own regression net: chainTrack is this plus three throws, so the
// two must place identical pieces on anything that is a track at all.
test('on a closed route it places exactly what chainTrack does', () => {
  for (const route of [loopRoute, inversionRoute, routeOf('LLLL')]) {
    const { placed, closed, faults } = chainOpen(route);
    assert.equal(closed, true);
    assert.deepEqual(faults, []);
    assert.deepEqual(placed, chainTrack(route));
  }
});

test('a collision is reported against the piece that causes it', () => {
  // Four left curves close a ring, so a fifth is asked for the cell the first is in.
  const { placed, faults } = chainOpen(routeOf('LLLLL'));

  assert.equal(faults.length, 1);
  assert.equal(faults[0].index, 4, 'the fifth piece is the one that cannot go down');
  assert.equal(faults[0].kind, 'collision');
  // The message is the one assertNoCollisions would have thrown, because it is the
  // same rule and not a second reading of it.
  assert.throws(() => assertNoCollisions(placed), new RegExp(escape(faults[0].message)));
});

// A route that is wrong in two ways reports the piece that goes wrong *first*,
// which is the only one a builder can act on: everything after it is downstream of
// a track that already could not be built.
test('the first fault is the one reported', () => {
  const { faults } = chainOpen([...routeOf('LLLLL'), ...routeOf('LLLLL')]);
  assert.equal(faults.length, 1);
  assert.equal(faults[0].index, 4);
});

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- The set -------------------------------------------------------------

// The six-face tour fits SET exactly — both straights and every left, inside and
// outside curve — which is a large part of why SET is shaped the way it is. If a
// future tuning of the set breaks this, the spike's headline scene stops being
// buildable and that should fail loudly rather than be noticed in a picture.
test('the six-face inversion route fits the set, exactly', () => {
  assert.equal(overflowingPool(inversionRoute, SET), null);
  const spent = countPieces(chainTrack(inversionRoute));
  assert.equal(spent.straight, SET.straight, 'it spends both straights');
  for (const pool of ['leftCurve', 'insideCurve', 'outsideCurve']) {
    assert.equal(spent[pool], SET[pool], `it spends every ${pool}`);
  }
});

// The flat rectangular loop does NOT fit, and that is the set doing its job
// rather than a defect. Ten straights up the long sides is exactly the kind of
// filler a browser-sized set cannot afford — measured: straights are what make
// this model slow, not cube count.
test('the flat loop route needs more straights than the set holds', () => {
  assert.equal(overflowingPool(loopRoute, SET), 'straight');
});

// The two colours must be equal, or the solver's mirror symmetry break becomes
// unsound — reflecting a layout swaps the two counts.
test('the set holds equal numbers of the two curve colours', () => {
  assert.equal(SET.leftCurve, SET.rightCurve, 'unequal colours would break mirror symmetry');
});

// The set has no cross, so nothing solved against it can cross itself. The
// crossing encoding is exercised by fixtures instead — see tests/cross.test.js.
test('the set holds no cross', () => {
  assert.equal(SET.cross, 0);
});

test('the set names every pool, and every type has one', () => {
  assert.deepEqual(Object.keys(SET).sort(), [...POOLS].sort());
  for (const type of PIECE_TYPES) assert.ok(POOLS.includes(POOL_OF[type]), type);
});

// The product listings count green and blue together ("8/16 combined"), and a
// reversible curve could legitimately be spent as either — a right curve fills
// the same cells as a left one and moves the head the same way, differing only in
// which face the rail ends on. Owen's curves are not reversible, so they are two
// mouldings and two pools.
test('left and right curves are separate pools', () => {
  assert.equal(POOL_OF.leftCurve, 'leftCurve');
  assert.equal(POOL_OF.rightCurve, 'rightCurve');
  assert.equal(POOLS.length, PIECE_TYPES.length, 'every piece type is its own pool');
});

// The test that pins which bookkeeping we mean. Eight curves of one colour would
// be fine against a shared pool of eight and is not fine here; four of each is
// fine either way.
test('one colour cannot be spent on the other colour\'s allowance', () => {
  // By type, because these lists are pool arithmetic rather than real tracks.
  assert.equal(overflowingPoolByType(Array(8).fill('leftCurve'), SET), 'leftCurve');
  assert.equal(overflowingPoolByType(Array(5).fill('rightCurve'), SET), 'rightCurve');
  const fourEach = [...Array(4).fill('leftCurve'), ...Array(4).fill('rightCurve')];
  assert.equal(overflowingPoolByType(fourEach, SET), null);
});

// ---- Scores --------------------------------------------------------------

// SCORES is a taste judgement and meant to be edited, so nothing asserts the
// numbers. What must hold is the shape: a straight is worth strictly less than
// anything that turns the train, or the table has stopped saying what it means.
test('every piece that turns the train outscores a straight', () => {
  for (const type of PIECE_TYPES.filter(t => t !== 'straight' && t !== 'cross')) {
    assert.ok(SCORES[type] > SCORES.straight, `${type} should beat a straight`);
  }
});

test('every piece type has a score', () => {
  assert.deepEqual(Object.keys(SCORES).sort(), [...PIECE_TYPES].sort());
});
