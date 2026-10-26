// The animations, driven against a real three.js scene and a hand-cranked clock.
//
// This is the promotion of a throwaway script. The build animation was verified
// by a Node file that did exactly what is below — a scene nothing draws, and a
// `requestAnimationFrame` stepped by hand — and it earned its keep immediately:
// two of its assertions failed when first written, and *both times the assertion
// was wrong rather than the code*. It was then deleted, so it lives here now.
//
// A sequenced tumble-then-build has strictly more ordering to get wrong than a
// build alone, and it has a property no eye can check reliably: that the cube
// arriving here is the *same object* as the one that was over there.
//
// The scene is three's own `Scene`, and every mesh the stage mounts is watched as
// it is added: each write to its matrix is recorded, and its removal. The one
// thing faked is the renderer, which only counts what it is asked to draw. Nothing
// here needs a DOM or WebGL, and `three` and `cannon-es` are runtime dependencies,
// so this belongs in the fast tier.

import test from 'node:test';
import { Vector3 } from 'three';
import assert from 'node:assert/strict';

import { chainTrack, cubeOf } from '../src/track.js';
import { routeOf, identify, LAYOUTS } from '../src/layouts.js';
import { createStage, together, deferred, OVERLAY } from '../site/src/lib/render/stage.js';
import { movePhase, turnPhase, MOVE, TURN } from '../site/src/lib/render/move.js';
import { fadeInPhase, fadeOutPhase, overlayFadePhase, changingFadePhase, FADE_IN, FADE_OUT } from '../site/src/lib/render/fade.js';
import { tumblePhase } from '../site/src/lib/render/tumble.js';
import { buildPhase, growPhase, trackPhase, PACE, FLIGHT } from '../site/src/lib/render/build.js';
import { paint, boundsOf, extentOf, fixedFrame, openScene, cubeIds, REACH, sceneFromRoute, apartScene, joinedScene, layoutScene, repeatsScene, knotScene, frameFit, cornersOf } from '../site/src/lib/scenes.js';
import { poseReadout, trackCell } from '../site/src/lib/catalogue.js';
import { ALARM_PERIOD, ALARM_SWELL, GRID_W, AXIS_HEAD_W, TRAIN_CELL_INSET, CUBE, RAIL } from '../site/src/lib/render/dimensions.js';
import { gridLines, cellBox } from '../site/src/lib/render/grid.js';
import { axisArrows, axisAnchor, labelSpots } from '../site/src/lib/render/axes.js';
import { toWorld, cubePosition, poseRotation, through } from '../site/src/lib/render/vec.js';
import { screenAxes, CAMERA } from '../site/src/lib/render/camera.js';
import { trackPath } from '../site/src/lib/render/rail.js';
import { CENTROID } from '../site/src/lib/shapes.js';
import { orbit, slid, zoomed } from '../site/src/lib/render/controls.js';

// ---- The watched stage -----------------------------------------------------

const THEME = { grid: '#4f75b8', gridOpacity: 0.22, trainCellOpacity: 0.4, outlineBefore: '#2b4a80' };

/** What a matrix says: where the mesh is, and the images of its local axes. */
const transformOf = ({ elements: e }) => ({
  position: [e[12], e[13], e[14]],
  basis: [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]],
});

// Every mesh a stage has ever mounted, by the three object, so a cube can be
// asked for its record.
const HANDLES = new WeakMap();

/** The record of what has been written to a stage cube's mesh. */
const handleOf = cube => HANDLES.get(cube.mesh.mesh);

/**
 * Watch a mesh from the moment it is added: its mounting transform, then every
 * matrix write after it — `setPosition` ends a placement and `makeTranslation` is
 * a fixed overlay's move — and whether it has been taken away.
 */
function watch(mesh) {
  const handle = {
    mesh,
    transforms: [],
    disposed: false,
    get name() { return mesh.name; },
  };
  const record = () => handle.transforms.push(transformOf(mesh.matrix));
  record();
  for (const method of ['setPosition', 'makeTranslation']) {
    const original = mesh.matrix[method];
    mesh.matrix[method] = function write(...args) {
      const out = original.apply(this, args);
      record();
      return out;
    };
  }
  HANDLES.set(mesh, handle);
  return handle;
}

/**
 * A stage on a 900×700 stand-in canvas, drawing through a renderer that only
 * counts. `handles` is every mesh ever mounted, in order; lights are not meshes.
 */
function staged(options = {}) {
  const renderer = { draws: 0, draw() { renderer.draws += 1; } };
  const canvas = { clientWidth: 900, clientHeight: 700 };
  const stage = createStage(canvas, { theme: THEME, renderer, ...options });
  const handles = [];
  stage.scene.addEventListener('childadded', ({ child }) => {
    if (child.isMesh) handles.push(watch(child));
  });
  stage.scene.addEventListener('childremoved', ({ child }) => {
    const handle = HANDLES.get(child);
    if (handle) handle.disposed = true;
  });
  return { stage, handles, renderer };
}

/**
 * A clock that only moves when told to. `loop.js` caps a single delta at 0.1 s, so
 * the step has to be under that or the loop silently runs slower than the caller
 * thinks — which is the same trap that makes headless screenshotting useless here.
 *
 * It holds every frame asked for, since the stage's loop and its on-demand draw
 * each ask for their own.
 */
function fakeClock() {
  let now = 0;
  let next = 1;
  let pending = new Map();
  globalThis.requestAnimationFrame = cb => { pending.set(next, cb); return next++; };
  globalThis.cancelAnimationFrame = id => { pending.delete(id); };
  return {
    /** Run `seconds` of animation in 16 ms frames, calling `onFrame` after each. */
    run(seconds, onFrame = () => {}) {
      for (let i = 0; i < Math.round(seconds / 0.016); i++) {
        if (!pending.size) return;          // nothing asked for another frame
        const due = [...pending.values()];
        pending = new Map();
        now += 16;
        for (const cb of due) cb(now);
        onFrame(now / 1000);
      }
    },
    at: () => now / 1000,
    running: () => pending.size > 0,
  };
}

const piecesOf = shape => paint(chainTrack(routeOf(shape)));

/** Where a piece's mesh belongs when it has landed: its cube, in world units. */
const restingPlace = piece => cubePosition(piece);

/** How far apart two rotation bases are, entry by entry. */
const gap = (a, b) => Math.max(...a.flatMap((col, c) => col.map((v, r) => Math.abs(v - b[c][r]))));

const SET = 'LIRIROSOLORLLSORII';
const OTHER = 'LRRIIOOSRLLOOLSRII';   // the same 18 cubes, arranged differently
const RING = 'LLLL';

// ---- Drawing on demand ----------------------------------------------------

test('a still track is drawn once, and a moving one once a frame', () => {
  const clock = fakeClock();
  const still = staged();
  still.stage.run([trackPhase(still.stage, piecesOf(SET), { drive: false })]);
  still.stage.start();
  clock.run(1);
  // Eighteen cubes mounted, the phase run and finished, and one picture for all of it.
  assert.equal(still.renderer.draws, 1, `${still.renderer.draws} draws of a picture that does not move`);
  assert.equal(clock.running(), false, 'a still track kept asking for frames');

  const moving = staged();
  moving.stage.run([trackPhase(moving.stage, piecesOf(SET), { drive: true })]);
  moving.stage.start();
  const frames = [];
  clock.run(1, () => frames.push(moving.renderer.draws));
  // One draw per frame the loop ran, however many writes the frame made.
  frames.slice(1).forEach((n, i) => assert.ok(n - frames[i] <= 1, 'a frame was drawn twice'));
  assert.ok(frames.at(-1) > 50, `only ${frames.at(-1)} draws in a second of driving`);
});

test('a camera move on a still stage is drawn', () => {
  const clock = fakeClock();
  const { stage, renderer } = staged();
  stage.run([trackPhase(stage, piecesOf(RING), { drive: false })]);
  stage.start();
  clock.run(1);
  const drawn = renderer.draws;
  stage.frameTo({ zoom: 2 });
  clock.run(1);
  assert.equal(renderer.draws, drawn + 1, 'a reframe was not drawn, or drawn more than once');
});

// ---- A finished track -----------------------------------------------------

test('a track phase draws every cube at once, in its place', () => {
  const { handles, stage } = staged();
  const pieces = piecesOf(SET);

  stage.run([trackPhase(stage, pieces, { drive: false })]);

  // Everything exists before a single frame has been drawn — which is what makes
  // this the first paint of a prerendered page rather than an animation.
  assert.equal(handles.length, 18, 'one mesh per cube');
  assert.equal(stage.cubes.size, 18);
  assert.deepEqual([...stage.cubes.keys()].sort(), identify(pieces).sort());

  const cubes = pieces.filter(p => !p.revisit);
  for (const [i, id] of identify(pieces).entries()) {
    const cube = stage.cubes.get(id);
    assert.deepEqual(cube.position, restingPlace(cubes[i]), `${id} is misplaced`);
    assert.deepEqual(cube.basis, poseRotation(cubes[i].pose), `${id} is misposed`);
    // And the mesh is where the cube says it is.
    const { position, basis } = handleOf(cube).transforms.at(-1);
    assert.deepEqual(position, restingPlace(cubes[i]), `${id}'s mesh is misplaced`);
    assert.ok(gap(basis, poseRotation(cubes[i].pose)) < 1e-12, `${id}'s mesh is misposed`);
  }
});

test('a crossed cross is one cube drawn once', () => {
  const { handles, stage } = staged();
  const pieces = piecesOf('XSLLLSXSRRRS');   // the figure of eight

  stage.run([trackPhase(stage, pieces, { drive: false })]);

  assert.equal(pieces.length, 12, 'twelve steps');
  assert.equal(handles.length, 11, 'eleven cubes');
  assert.equal(stage.cubes.size, 11);
});

// ---- A cold build ---------------------------------------------------------

test('a build mints one piece per beat and lands each one exactly', () => {
  const clock = fakeClock();
  const { handles, stage } = staged();
  const pieces = piecesOf(SET);
  const cubes = pieces.filter(p => !p.revisit);
  const ids = identify(pieces);

  stage.run([buildPhase(stage, pieces, { pace: PACE, drive: false })]);
  stage.start();

  // Nothing exists until the clock moves: a build starts from an empty stage.
  assert.equal(handles.length, 0);

  let seen = 0;
  clock.run(0.4, () => {
    assert.ok(handles.length >= seen, 'meshes were disposed mid-build');
    seen = handles.length;
  });
  // Four beats of 0.1 s in, four or five pieces have set off — never all eighteen.
  assert.ok(seen >= 4 && seen <= 6, `${seen} pieces had set off after 0.4 s`);

  clock.run(3);
  assert.equal(handles.length, 18, 'the whole set was built');

  for (const [i, id] of ids.entries()) {
    const cube = stage.cubes.get(id);
    assert.deepEqual(cube.position, restingPlace(cubes[i]), `${id} landed off its cell`);
    assert.deepEqual(cube.basis, poseRotation(cubes[i].pose), `${id} landed mispose`);
    // The last thing written to the mesh is its pose exactly, not nearly.
    assert.ok(gap(handleOf(cube).transforms.at(-1).basis, poseRotation(cubes[i].pose)) < 1e-12,
      `${id} landed turned`);
  }
});

test('a minted arrival is a straight line down the connector axis', () => {
  const clock = fakeClock();
  const { stage } = staged();
  const pieces = piecesOf(RING);
  const cubes = pieces.filter(p => !p.revisit);
  const ids = identify(pieces);

  // Slowly, so there are plenty of frames inside each flight to measure.
  stage.run([buildPhase(stage, pieces, { pace: 0.6, drive: false })]);
  stage.start();
  clock.run(4);

  for (const [i, id] of ids.entries()) {
    const cube = stage.cubes.get(id);
    const heading = poseRotation(cubes[i].pose)[1];
    const home = restingPlace(cubes[i]);
    let frames = 0;
    for (const { position } of handleOf(cube).transforms) {
      const offset = position.map((v, k) => v - home[k]);
      // The offset must be a multiple of the heading and nothing else. Two of the
      // three axes are therefore *exactly* zero, not nearly: an arrival that drifts
      // off the lane is an arrival onto the rail face, which is the mistake
      // `build.js` is written to prevent.
      const along = offset.reduce((s, v, k) => s + v * heading[k], 0);
      const off = offset.map((v, k) => v - along * heading[k]);
      assert.ok(Math.max(...off.map(Math.abs)) < 1e-9,
        `${id} strayed ${off} off its axis`);
      frames += 1;
    }
    assert.ok(frames > 10, `${id} only had ${frames} frames of flight`);
  }
});

// ---- The sequence: the same cubes, rearranged -----------------------------

/**
 * Stand `from` up, then rearrange it into `to` the way `TrackViewer` does: the
 * collapse and the build running *together*, with the build joining in at
 * `handover` and taking each cube off the pile as it reaches it.
 */
function sequence(shapeFrom, shapeTo, { handover = 0.7, pace = PACE, limit = 2.5 } = {}) {
  const clock = fakeClock();
  const { handles, stage } = staged();
  const from = piecesOf(shapeFrom);
  const to = piecesOf(shapeTo);

  stage.run([trackPhase(stage, from, { drive: false })]);
  const before = new Map([...stage.cubes].map(([id, cube]) => [id, handleOf(cube)]));

  const collapse = tumblePhase(stage, from, { drop: 1, limit });
  const taken = [];
  stage.run([together(collapse, buildPhase(stage, to, {
    pace,
    delay: handover,
    onPickUp: id => { taken.push({ id, at: clock.at() }); collapse.release(id); },
    drive: false,
  }))]);
  stage.start();
  return { stage, handles, clock, from, to, before, taken, handover, pace };
}

test('the build picks up the cubes the tumble dropped', () => {
  const { stage, handles, clock, to, before } = sequence(SET, OTHER);
  const cubes = to.filter(p => !p.revisit);
  const ids = identify(to);

  clock.run(6);

  // The point of the whole exercise: not one new mesh, not one disposed. `2L` in
  // the new layout is the very object that was `2L` in the old one. Eighteen cubes
  // in, eighteen cubes out, and nothing is drawn for the floor, so this is the
  // whole scene.
  assert.equal(handles.length, 18, 'a mesh was created or destroyed');
  assert.equal(stage.cubes.size, 18);
  for (const [id, mesh] of before) {
    assert.equal(handleOf(stage.cubes.get(id)), mesh, `${id} is not the same cube`);
    assert.equal(mesh.disposed, false, `${id} was disposed`);
  }

  // And it ends as a legal track, in the right places.
  for (const [i, id] of ids.entries()) {
    const cube = stage.cubes.get(id);
    assert.deepEqual(cube.position, restingPlace(cubes[i]), `${id} landed off its cell`);
    assert.deepEqual(cube.basis, poseRotation(cubes[i].pose), `${id} landed mispose`);
    assert.ok(gap(handleOf(cube).transforms.at(-1).basis, poseRotation(cubes[i].pose)) < 1e-12,
      `${id} landed turned`);
  }
});

test('the build joins in at the handover, not after the pile has settled', () => {
  const { clock, taken, handover, pace } = sequence(SET, OTHER, { handover: 0.7 });
  clock.run(10);

  // Every cube is accounted for, in route order, on the beat — starting at the
  // handover rather than at the collapse's deadline. This is the whole point: the
  // 18-cube pile is still moving at 4-10 cubes a second until about 2.5 s, so
  // waiting for it left more than a second of nothing happening.
  assert.equal(taken.length, 18, 'not every cube was picked up');
  assert.ok(Math.abs(taken[0].at - handover) < 0.05,
    `the first pick-up was at ${taken[0].at}s, not ${handover}s`);
  for (const [i, t] of taken.entries()) {
    assert.ok(Math.abs(t.at - (handover + i * pace)) < 0.05,
      `${t.id} was picked up at ${t.at}s, off its beat`);
  }
});

test('a cube not yet picked up keeps falling instead of freezing', () => {
  // The reason the two phases overlap rather than run in sequence. Ending the
  // collapse and *then* building leaves every piece the build has not reached yet
  // stopped dead in mid-air, which is worse than the dwell it removes.
  const { stage, clock, to, handover, pace } = sequence(SET, OTHER, { handover: 0.4 });
  const ids = identify(to);
  const last = ids.at(-1);
  const claimedAt = handover + (ids.length - 1) * pace;

  // Track the last cube to be claimed, over the window between the handover and its
  // own turn — during which nothing but the physics is moving it.
  const seen = [];
  clock.run(10, seconds => {
    if (seconds > handover && seconds < claimedAt) seen.push(stage.cubes.get(last).position);
  });

  assert.ok(seen.length > 20, `only ${seen.length} frames in the window`);
  const moved = seen.filter((p, i) => i > 0
    && p.some((v, k) => Math.abs(v - seen[i - 1][k]) > 1e-9)).length;
  // It does not have to move on *every* frame — it may fall asleep and be nudged
  // awake — but a frozen piece moves on none of them.
  assert.ok(moved > seen.length / 4,
    `${last} moved on only ${moved} of ${seen.length} frames after the handover`);
});

test('a cube the new layout has no use for finishes falling and stays put', () => {
  // `SSRRIIRRLLIISSSLLS` holds six straights where the model set holds two, so most
  // of the set's cubes have a slot and several have none.
  const { stage, clock, to, taken } = sequence(SET, 'SSRRIIRRLLIISSSLLS');
  const claimed = new Set(identify(to));
  const leftovers = [...stage.cubes.keys()].filter(id => !claimed.has(id));
  assert.ok(leftovers.length > 0, 'this layout was supposed to leave cubes over');

  // Long enough for the collapse to have hit its limit and stopped.
  clock.run(10);
  const resting = new Map(leftovers.map(id => [id, stage.cubes.get(id).position]));
  clock.run(4);

  const lifted = new Set(taken.map(t => t.id));
  for (const id of leftovers) {
    // Nothing ever picks it up — it is not flown anywhere, it is just dropped.
    assert.ok(!lifted.has(id), `${id} was picked up despite having nowhere to go`);
    assert.deepEqual(stage.cubes.get(id).position, resting.get(id), `${id} is still moving`);
    assert.equal(handleOf(stage.cubes.get(id)).disposed, false, `${id} was disposed`);
  }
});

test('a slot with no cube on the floor is minted from off-frame', () => {
  const { stage, clock, to, before } = sequence(SET, 'SSRRIIRRLLIISSSLLS');
  const cubes = to.filter(p => !p.revisit);
  const ids = identify(to);
  const minted = ids.filter(id => !before.has(id));

  clock.run(8);
  assert.ok(minted.length > 0, 'this layout was supposed to need new cubes');
  for (const id of minted) {
    assert.ok(stage.cubes.has(id), `${id} was never made`);
    const handle = handleOf(stage.cubes.get(id));
    assert.ok(![...before.values()].includes(handle), `${id} reused a cube from the floor`);
    assert.ok(handle.transforms.length > 1, `${id} did not fly`);
    assert.deepEqual(stage.cubes.get(id).position, restingPlace(cubes[ids.indexOf(id)]), `${id} landed off its cell`);
  }
});

test('the fixed frame holds every layout the project knows', () => {
  // `Layout`'s camera is set once and never touched, which is only safe if the frame
  // really does contain anything it might be asked to show. The number is not a
  // guess: it is the solver's own box constraint, which every layout in
  // `src/layouts.js` was solved under. This is the check that keeps it true — a
  // layout added later that reaches further has to fail here rather than be silently
  // cropped in the viewer.
  for (const [name, layout] of Object.entries(LAYOUTS)) {
    const { lo, hi } = boundsOf(piecesOf(layout.shape));
    for (const k of [0, 1, 2]) {
      assert.ok(-REACH <= lo[k] && hi[k] <= REACH,
        `${name} reaches ${lo[k]}..${hi[k]} on axis ${k}, outside the ±${REACH} frame`);
    }
    // And the ground: nothing digs below it, which is what lets the frame be
    // asymmetric vertically and spend the space below on the fall instead.
    assert.ok(lo[1] >= 0, `${name} digs below the ground`);
  }
});

test('the frame is the same whatever is being shown', () => {
  // The property Owen asked for, stated directly: the camera description does not
  // depend on the layout, so a shape change cannot move the camera. Nothing else in
  // the stage is even able to — `panPhase` was deleted along with the growing box.
  const shot = fixedFrame({ drop: 1 });
  for (const shape of [SET, OTHER, RING, 'SSRRIIRRLLIISSSLLS', 'XSLLLSXSRRRS']) {
    assert.deepEqual(fixedFrame({ drop: 1 }), shot, `${shape} changed the frame`);
  }
  // Only the drop moves it, and it moves it outwards.
  assert.ok(fixedFrame({ drop: 4 }).zoom < shot.zoom, 'a deeper fall should zoom out');
  assert.equal(Object.keys(shot).sort().join(','), 'target,zoom');
});

test('reach widens the frame, and unset means the solver box', () => {
  // The sweeps were solved in bigger boxes than src/layouts.js was — the crossed
  // one at 8 against REACH's 6 — so the front page passes the sweep's own
  // `question.box` as `reach`. Everything the fixed frame promises still holds at
  // any one reach: the frame is a constant, so a shape change cannot move it.
  const shot = fixedFrame({ drop: 1 });
  assert.deepEqual(fixedFrame({ drop: 1, reach: REACH }), shot,
    'reach at the solver box should be the default frame');
  assert.deepEqual(fixedFrame({ drop: 1, reach: undefined }), shot,
    'an unset reach should be the default frame');
  const wide = fixedFrame({ drop: 1, reach: 8 });
  assert.ok(wide.zoom < shot.zoom, 'a wider reach should zoom out');
  assert.deepEqual(fixedFrame({ drop: 1, reach: 8 }), wide, 'the wide frame is not constant');
});

test('speed scales the whole build, and only its duration', () => {
  // One tempo over all four durations, so a faster build is the *same* build run
  // faster rather than a differently-shaped one. Two things to hold: it really is
  // proportional end to end, and it changes nothing about where a piece ends up.
  const finish = speed => {
    const clock = fakeClock();
    const { stage } = staged();
    const pieces = piecesOf(SET);
    const cubes = pieces.filter(p => !p.revisit);
    const ids = identify(pieces);

    stage.run([buildPhase(stage, pieces, { pace: PACE, speed, drive: false })]);
    stage.start();

    let done = null;
    clock.run(20, seconds => {
      const built = ids.every((id, i) => stage.cubes.get(id)?.position
        .every((v, k) => Math.abs(v - restingPlace(cubes[i])[k]) < 1e-9));
      if (done === null && built) done = seconds;
    });
    return { done, stage, ids, cubes };
  };

  const slow = finish(1);
  const fast = finish(2);
  assert.ok(slow.done && fast.done, 'a build did not finish');
  // Half the time, to within the 16 ms the frame boundaries can fall either way.
  assert.ok(Math.abs(fast.done - slow.done / 2) < 0.05,
    `speed 1 took ${slow.done}s and speed 2 took ${fast.done}s`);

  // And the destination is untouched: tempo is timing, not geometry.
  for (const [i, id] of fast.ids.entries()) {
    assert.deepEqual(fast.stage.cubes.get(id).position, restingPlace(fast.cubes[i]));
    assert.deepEqual(fast.stage.cubes.get(id).basis, poseRotation(fast.cubes[i].pose));
  }
});

test('a replaced phase takes its train off the track with it', () => {
  // The train is the one thing a phase owns that the stage does not, so it is the
  // one thing that can be abandoned — and a phase whose queue is replaced mid-lap
  // used to leave it hanging in mid-air over the collapsing track for ever. Which
  // it did, visibly, and which counting meshes is the way to keep pinned.
  const clock = fakeClock();
  const { handles, stage } = staged();
  const from = piecesOf(SET);
  const to = piecesOf(OTHER);
  const alive = () => handles.filter(h => !h.disposed).length;

  stage.run([trackPhase(stage, from, { drive: true })]);
  assert.equal(alive(), 19, '18 cubes and a train');

  stage.run([
    tumblePhase(stage, from, { drop: 1, limit: 1.2 }),
    buildPhase(stage, to, { pace: PACE, drive: true }),
  ]);
  assert.equal(alive(), 18, 'just the cubes: the first train has gone');

  stage.start();
  clock.run(10);
  // The build's own train has set off by now — one train, not two, and not three.
  assert.equal(alive(), 19, '18 cubes and exactly one train');
  assert.equal(handles.length, 20, 'two trains were ever made, and one was thrown away');
});

// Where the train's mesh stands, so two placements can be compared.
const standing = handle => handle.transforms.at(-1).position;
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

test('a held train stands where it enters its piece, and one past the last is the first', () => {
  const clock = fakeClock();
  const { handles, stage } = staged();
  const pieces = piecesOf(SET);
  const path = trackPath(pieces);
  const entries = path.filter((_, k) => k % (path.length / pieces.length) === 0);
  let held = 2;
  const told = [];

  stage.run([trackPhase(stage, pieces, { trainAt: () => held, onTrainAt: i => told.push(i) })]);
  stage.start();
  const train = handles.at(-1);

  clock.run(0.05);
  assert.ok(near(standing(train), entries[2].pos), 'at the entry of piece 2');
  const writes = train.transforms.length;
  clock.run(1);
  assert.equal(train.transforms.length, writes, 'a held train is not written again');
  assert.deepEqual(told, [], 'a held train is not reported as driving');

  for (const [i, { pos }] of entries.entries()) {
    held = i;
    clock.run(0.05);
    assert.ok(near(standing(train), pos), `at the entry of piece ${i}`);
  }
  held = 0;
  clock.run(0.05);
  const before = train.transforms.length;
  held = pieces.length;
  clock.run(0.05);
  assert.equal(train.transforms.length, before, 'a whole lap on is the start, so nothing moves');
});

test('a held train marks the cube of the piece it is on, and never the cell it is in', () => {
  // Read off the model, not the body: the piece's own cube, where it is drawn.
  const clock = fakeClock();
  const marked = [];
  const cells = [];
  const { stage } = staged({ onTrainPiece: cube => marked.push(cube), onTrainCell: cell => cells.push(cell) });
  for (const shape of [SET, 'XSLLLSXSRRRS']) {
    const pieces = piecesOf(shape);
    let held = 0;
    stage.run([trackPhase(stage, pieces, { trainAt: () => held })]);
    stage.start();
    for (const [i, { cell, pose }] of pieces.entries()) {
      held = i;
      clock.run(0.05);
      assert.deepEqual(marked.at(-1), cubeOf(cell, pose), `${shape} piece ${i}`);
    }
  }
  assert.deepEqual(cells, [], 'a held train marked the cell it is in');
});

test('a held train\'s cube is outlined on the lattice, one mesh moved, and goes with the train', () => {
  const clock = fakeClock();
  const { handles, stage } = staged();
  const pieces = piecesOf(SET);
  const marks = () => handles.filter(h => h.name === OVERLAY.piece && !h.disposed);
  let held = 0;

  stage.run([trackPhase(stage, pieces, { trainAt: () => held })]);
  stage.start();
  clock.run(0.05);
  assert.equal(marks().length, 0, 'a cube was outlined with no lattice to outline it on');

  stage.setGrid(gridLines(extentOf(pieces)));
  assert.equal(marks().length, 1);
  for (const [i, { cell, pose }] of pieces.entries()) {
    held = i;
    clock.run(0.05);
    assert.equal(marks().length, 1, 'the outline was remounted rather than moved');
    assert.ok(near(marks()[0].transforms.at(-1).position, toWorld(cubeOf(cell, pose))), `piece ${i}`);
  }

  const [mark] = marks();
  stage.run([tumblePhase(stage, pieces, { drop: 1, limit: 1 })]);
  assert.equal(mark.disposed, true, 'the outline outlived its train');
});

test('a held train reports the pose it enters its piece in', () => {
  const clock = fakeClock();
  const reported = [];
  const { stage } = staged({ onTrainPose: pose => reported.push(pose) });
  for (const shape of [SET, 'XSLLLSXSRRRS']) {
    const pieces = piecesOf(shape);
    let held = 0;
    stage.run([trackPhase(stage, pieces, { trainAt: () => held })]);
    stage.start();
    for (const [i, { pose }] of pieces.entries()) {
      held = i;
      clock.run(0.05);
      assert.equal(reported.at(-1), pose, `${shape} piece ${i}`);
    }
  }
});

test('a driven train reports the pose of each piece it enters, in route order, once each', () => {
  const clock = fakeClock();
  const reported = [];
  const { stage } = staged({ onTrainPose: pose => reported.push(pose) });
  const pieces = piecesOf(SET);

  stage.run([trackPhase(stage, pieces, { drive: true })]);
  stage.start();
  clock.run(20);

  const poses = reported.filter(Boolean);
  assert.ok(poses.length > pieces.length, 'not even a lap was reported');
  assert.equal(reported.includes(null), false, 'the train was reported gone while running');
  // Route order, laps on end, with a pose a piece shares with the one before it said once.
  const laps = Math.ceil(poses.length / pieces.length) + 1;
  const route = Array.from({ length: laps * pieces.length }, (_, i) => pieces[i % pieces.length].pose)
    .filter((pose, i, all) => i === 0 || pose !== all[i - 1]);
  assert.deepEqual(poses, route.slice(0, poses.length));

  stage.run([tumblePhase(stage, pieces, { drop: 1, limit: 1 })]);
  assert.equal(reported.at(-1), null, 'the train went and nobody was told');
});

test('a handed-over train drives along the rail like an unheld one, reporting each piece it is on', () => {
  const clock = fakeClock();
  const pieces = piecesOf(SET);
  const free = staged();
  free.stage.run([trackPhase(free.stage, pieces)]);
  free.stage.start();
  const handed = staged();
  const told = [];
  handed.stage.run([trackPhase(handed.stage, pieces, { trainAt: () => null, onTrainAt: i => told.push(i) })]);
  handed.stage.start();
  clock.run(30);

  const a = free.handles.at(-1).transforms, b = handed.handles.at(-1).transforms;
  assert.ok(b.length > told.length / 2, 'written as it goes, not once a piece');
  assert.equal(a.length, b.length, 'written on the same frames');
  assert.ok(a.every((t, k) => near(t.position, b[k].position)), 'and to the same places');
  const order = pieces.map((_, i) => i);
  const runs = told.filter((i, k) => k === 0 || i !== told[k - 1]);
  assert.deepEqual(runs.slice(0, pieces.length + 1), [...order, 0], 'piece by piece, and round');
});

test('a handed-over train marks the cube of the piece it is on until it finishes the piece', () => {
  const clock = fakeClock();
  const marked = [];
  const { stage } = staged({ onTrainPiece: cube => marked.push(cube) });
  const pieces = piecesOf(SET);
  stage.run([trackPhase(stage, pieces, { trainAt: () => null })]);
  stage.start();
  clock.run(30);

  const laps = Math.ceil(marked.length / pieces.length) + 1;
  const route = Array.from({ length: laps * pieces.length }, (_, i) => {
    const { cell, pose } = pieces[i % pieces.length];
    return cubeOf(cell, pose);
  });
  assert.ok(marked.length > pieces.length, 'not even a lap was marked');
  assert.deepEqual(marked, route.slice(0, marked.length), 'one cell a piece, in route order');
});

test('a hold let go drives on from the piece it held', () => {
  const clock = fakeClock();
  const { stage } = staged();
  let held = null;
  const told = [];

  stage.run([trackPhase(stage, piecesOf(RING), { trainAt: () => held, onTrainAt: i => told.push(i) })]);
  stage.start();
  clock.run(1);
  held = 2;
  clock.run(1);
  held = null;
  const from = told.length;
  clock.run(3);

  const after = told.slice(from).filter((i, k, all) => k === 0 || i !== all[k - 1]);
  assert.deepEqual(after.slice(0, 3), [2, 3, 0], 'it carried on from piece 2, not the clock');
});

test('a paused stage draws one still frame, stops, and carries on from there', () => {
  const clock = fakeClock();
  const { handles, stage } = staged();

  stage.run([trackPhase(stage, piecesOf(RING))]);
  stage.start();
  clock.run(1);
  const train = handles.at(-1);
  const before = standing(train);
  const writes = train.transforms.length;

  stage.setPaused(true);
  stage.start();
  clock.run(1);
  assert.equal(clock.running(), false, 'a paused stage stops asking for frames');
  assert.equal(train.transforms.length, writes + 1, 'one still frame, and only one');
  assert.ok(near(standing(train), before), 'the still frame is where the train had got to');

  stage.setPaused(false);
  stage.start();
  clock.run(0.05);
  const moved = Math.hypot(...standing(train).map((v, i) => v - before[i]));
  assert.ok(moved > 0 && moved < CUBE, `it carries on from where it stopped (${moved})`);
});

test('a track shown while paused gets its train, standing still', () => {
  const clock = fakeClock();
  const { handles, stage } = staged();
  const pieces = piecesOf(RING);

  stage.setPaused(true);
  stage.run([trackPhase(stage, pieces)]);
  stage.start();
  clock.run(1);

  const train = handles.at(-1);
  // One transform to mount it, unturned at the origin, and one to put it on the track.
  assert.equal(train.transforms.length, 2, 'the train is put on the track once');
  assert.equal(clock.running(), false);
  assert.ok(near(standing(train), trackPath(pieces)[0].pos), 'at the start of the lap');
});

test('a picked-up cube also finishes down the connector axis', () => {
  // The doctrine, and the reason a pick-up is two legs rather than one arc: the
  // cubes click male-to-female along the direction of travel, so however a piece
  // gets across the scene, the *last* thing it does is come into line with the rail
  // and slide on. Three wrong answers were shipped before that one.
  //
  // Measured by walking each piece's flight backwards from where it landed for as
  // long as it stayed on its own axis. That run has to be the whole of the slide.
  const { stage, clock, to } = sequence(SET, OTHER, { pace: 0.6 });
  const cubes = to.filter(p => !p.revisit);
  const ids = identify(to);

  clock.run(20);
  for (const [i, id] of ids.entries()) {
    const heading = poseRotation(cubes[i].pose)[1];
    const home = restingPlace(cubes[i]);
    const offAxis = ({ position }) => {
      const offset = position.map((v, k) => v - home[k]);
      const along = offset.reduce((s, v, k) => s + v * heading[k], 0);
      return Math.max(...offset.map((v, k) => Math.abs(v - along * heading[k])));
    };

    const flight = handleOf(stage.cubes.get(id)).transforms;
    let onAxis = 0;
    while (onAxis < flight.length && offAxis(flight.at(-1 - onAxis)) < 1e-9) onAxis += 1;

    // The slide is FLIGHT seconds of 16 ms frames. A frame or two of slack either
    // side, because where the frame boundaries fall against the beat is arbitrary.
    assert.ok(onAxis >= FLIGHT / 0.016 - 2,
      `${id} was only on its axis for ${onAxis} frames of the ${FLIGHT}s slide`);
  }
});

test('a pick-up carries a cube by its centre of mass, not by a corner', () => {
  // An arc's geometry is keyed to a cell a whole cube outside its own material, so
  // turning about that origin flings the piece round rather than turning it. The
  // conversion is `originAt`, and the property is that the *centre of mass* travels
  // smoothly even though the origin it is drawn about need not.
  const { stage, clock } = sequence(RING, RING, { limit: 0.8, pace: 0.6 });
  const type = 'leftCurve';

  const path = [];
  clock.run(6, () => {
    const cube = stage.cubes.get('1L');
    path.push(cube.position.map((v, k) => v + through(cube.basis, CENTROID[type])[k]));
  });

  const steps = path.slice(1).map((com, i) => Math.hypot(...com.map((v, k) => v - path[i][k])));
  // A cube is 44 units across and a frame is 16 ms. Anything moving further than a
  // cube in one frame is not being carried, it is being teleported — which is what
  // a rotation about the wrong point looks like the moment the piece turns.
  assert.ok(Math.max(...steps) < CUBE,
    `the centre of mass jumped ${Math.max(...steps).toFixed(1)} units in one frame`);
});

// ---- Growing: a track being typed -----------------------------------------
//
// The other two animations replace what is on the stage. This one *extends* it, and
// the whole of the difference is what happens to a cube that is already there: the
// build picks it up off the floor and carries it, this leaves it alone. A piece
// already down must not so much as twitch when the next letter is typed, and
// "leaves it alone" is a claim about writes rather than about pixels — which is
// exactly what watching the meshes can settle.

/** Type a shape onto a stage, one growth at a time, and run each out. */
function typing({ pace = 0.1, arrival = 'flip' } = {}) {
  const clock = fakeClock();
  const { handles, stage } = staged();
  let shown = [];

  const type = (shape, startPose = 'DF') => {
    const view = openScene(shape, startPose);
    // What the viewer does before running the phase: every cube past the point the
    // two layouts stop agreeing is detached, and leaves.
    let prefix = 0;
    const key = p => `${p.type}${p.pose}${p.cell}`;
    while (prefix < shown.length && prefix < view.pieces.length
      && key(shown[prefix]) === key(view.pieces[prefix])) prefix += 1;
    const ids = cubeIds(shown);
    const leaving = [];
    for (let i = prefix; i < shown.length; i++) {
      const cube = ids[i] && stage.detach(ids[i]);
      if (cube) leaving.push({ cube, piece: shown[i] });
    }

    stage.run([growPhase(stage, view.pieces, {
      pace, leaving, arrival, drive: view.closed, alarm: view.offender && { id: view.offender.id, pulse: true },
    })]);
    stage.start();
    shown = view.pieces;
    return view;
  };

  return { handles, stage, clock, type, alive: () => handles.filter(h => !h.disposed).length };
}

test('growing a track does not touch a single piece already standing', () => {
  const { handles, clock, type } = typing();

  type('LIRIROSOL');
  clock.run(4);
  assert.equal(handles.length, 9, 'nine cubes went down');

  // Exactly what has been written to each of them, before the next letter.
  const writes = handles.map(h => h.transforms.length);
  const shapes = handles.map(h => h.mesh.geometry);

  type('LIRIROSOLO');
  clock.run(4);
  assert.equal(handles.length, 10, 'the tenth cube arrived');

  for (const [i, handle] of handles.slice(0, 9).entries()) {
    assert.equal(handle.transforms.length, writes[i], `cube ${i} was moved by the next letter`);
    assert.equal(handle.mesh.geometry, shapes[i], `cube ${i} was repainted by the next letter`);
    assert.equal(handle.disposed, false, `cube ${i} was thrown away and remade`);
  }
});

test('a new piece is minted in flight', () => {
  const { handles, stage, clock, type } = typing();

  type('LI');
  clock.run(4);
  const arrival = handles.at(-1);
  assert.ok(arrival.transforms.length > 1, 'a mint did not fly');
  assert.deepEqual(stage.cubes.get('1I').position, restingPlace(openScene('LI').pieces[1]));
});

test('a faded arrival slides in square at a steady rate, fading in, and lands solid', () => {
  const { stage, clock, type } = typing({ arrival: 'fade' });
  const [, piece] = openScene('LI').pieces;
  const basis = poseRotation(piece.pose);
  const home = restingPlace(piece);

  type('LI');
  const seen = [];
  clock.run(4, () => {
    const cube = stage.cubes.get('1I');
    if (cube) seen.push({ opacity: cube.opacity, basis: cube.basis, out: cube.position.map((v, k) => v - home[k]) });
  });

  const flight = seen.filter(s => s.opacity < 1);
  assert.ok(flight.length > 3, 'it did not fade in');
  for (const [i, s] of flight.entries()) {
    assert.ok(gap(s.basis, basis) < 1e-9, `frame ${i} was turned`);
    if (i) assert.ok(s.opacity > flight[i - 1].opacity, `frame ${i} got fainter`);
  }
  // Steady: the distance still to go falls by the same amount every frame.
  const along = flight.map(s => s.out.reduce((sum, v, k) => sum + v * basis[1][k], 0));
  const steps = along.slice(1).map((v, i) => along[i] - v);
  assert.ok(Math.max(...steps) - Math.min(...steps) < 1e-6, 'it eased rather than sliding steadily');
  assert.equal(stage.cubes.get('1I').opacity, 1, 'it landed see-through');
  assert.deepEqual(stage.cubes.get('1I').position, home);
});

test('backspace slides one cube off and leaves the rest standing', () => {
  const { handles, stage, clock, type, alive } = typing();

  type('LIRI');
  clock.run(4);
  assert.equal(alive(), 4);
  const kept = ['1L', '1I', '1R'].map(id => handleOf(stage.cubes.get(id)));
  const writes = kept.map(h => h.transforms.length);
  const leaving = handleOf(stage.cubes.get('2I'));
  const moved = leaving.transforms.length;
  const [last] = openScene('LIRI').pieces.slice(-1);

  type('LIR');
  assert.equal(stage.cubes.has('2I'), false, 'the removed piece still holds its ID');
  clock.run(FLIGHT / 2);
  assert.equal(leaving.disposed, false, 'the removed piece vanished rather than leaving');
  assert.ok(leaving.transforms.length > moved, 'the removed piece did not move');
  clock.run(4);

  assert.equal(alive(), 3, 'exactly one cube came off');
  assert.equal(leaving.disposed, true, 'the removed piece was never taken away');
  // It went back out the way a piece comes in: along its own heading, to the
  // standoff behind its slot.
  const out = leaving.transforms.at(-1).position.map((v, k) => v - restingPlace(last)[k]);
  const heading = poseRotation(last.pose)[1];
  const along = out.reduce((sum, v, k) => sum + v * heading[k], 0);
  assert.ok(along > CUBE, `it stopped ${along.toFixed(1)} units out along its heading`);
  assert.ok(Math.hypot(...out.map((v, k) => v - along * heading[k])) < 1e-6, 'it left off the axis');

  for (const [i, handle] of kept.entries()) {
    assert.equal(handle.disposed, false, `cube ${i} was disposed by a backspace`);
    assert.ok(handles.includes(handle), `cube ${i} is not the same mesh it was`);
    assert.equal(handle.transforms.length, writes[i], `cube ${i} was moved by a backspace`);
  }
});

test('a piece put back while its predecessor is leaving is a new cube', () => {
  const { handles, stage, clock, type, alive } = typing();

  type('LIRI');
  clock.run(4);
  const old = handleOf(stage.cubes.get('2I'));

  type('LIR');
  clock.run(FLIGHT / 3);        // part-way out
  type('LIRI');
  assert.equal(old.disposed, true, 'the leaving cube outlived the phase that owned it');
  clock.run(4);

  const now = handleOf(stage.cubes.get('2I'));
  assert.notEqual(now, old, 'the put-back piece reused the one that was leaving');
  assert.deepEqual(stage.cubes.get('2I').position, restingPlace(openScene('LIRI').pieces[3]));
  assert.equal(alive(), 4);
  assert.equal(handles.length, 5, 'one cube minted for the put-back piece, and only one');
});

test('a piece still arriving when the next is added carries on home', () => {
  const { stage, clock, type } = typing();

  type('L');
  clock.run(FLIGHT / 3);        // the first piece is part-way down its lane
  const flying = stage.cubes.get('1L');
  assert.notDeepEqual(flying.position, restingPlace(openScene('L').pieces[0]), 'it had already landed');
  const handle = handleOf(flying);

  type('LL');
  clock.run(4);

  assert.equal(handleOf(stage.cubes.get('1L')), handle, 'it was replaced rather than carried on');
  assert.deepEqual(stage.cubes.get('1L').position, restingPlace(openScene('L').pieces[0]),
    'it was left frozen where it had got to');
  assert.deepEqual(stage.cubes.get('1L').basis, poseRotation(openScene('L').pieces[0].pose));
});

test('there is no train until the loop closes, and then there is one', () => {
  const { clock, type, alive } = typing();

  type('LLL');
  clock.run(4);
  assert.equal(alive(), 3, 'three cubes and no train: an open track is not a loop');

  const closed = type('LLLL');
  assert.equal(closed.closed, true);
  clock.run(4);
  assert.equal(alive(), 5, 'four cubes and exactly one train');
});

test('a piece with nowhere to go is drawn there, and pulses', () => {
  const { stage, clock, type } = typing();

  // Four left curves close a ring, so a fifth is asked to go where the first is.
  const view = type('LLLLL');
  assert.equal(view.offender.id, '5L', 'the fifth left curve is the one at fault');
  assert.equal(view.pieces.length, 5, 'it is drawn, not dropped');
  assert.equal(view.closed, false);

  clock.run(1);
  const offender = handleOf(stage.cubes.get('5L'));
  const others = ['1L', '2L', '3L', '4L'].map(id => handleOf(stage.cubes.get(id)));
  const shapes = others.map(h => h.mesh.geometry);

  // It lands in ALARM — `openScene` paints it — so the first repaint due is the
  // pale one, half a period after it lands, and they alternate from there. A
  // repaint is a swap of the mesh's geometry, so that is what is counted.
  let flashes = 0;
  let showing = offender.mesh.geometry;
  clock.run(ALARM_PERIOD * 2, () => {
    if (offender.mesh.geometry !== showing) flashes += 1;
    showing = offender.mesh.geometry;
  });
  assert.ok(flashes >= 3 && flashes <= 5, `${flashes} repaints over two periods`);

  // One mesh, about twice a second. Nothing else is repainted at all.
  for (const [i, handle] of others.entries()) {
    assert.equal(handle.mesh.geometry, shapes[i], `cube ${i} was repainted by the alarm`);
  }

  // And it really is drawn on top of the first curve rather than off to one side.
  assert.deepEqual(stage.cubes.get('5L').position, stage.cubes.get('1L').position);
});

// The rejected piece lies exactly on top of the one it ran into, so left alone the
// two would share faces and the depth buffer would draw stripes of both. Once down,
// it is drawn a touch larger and see-through, so they never share a face and the
// piece it hit shows through it.
const widthOf = mesh => {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.max.x - mesh.geometry.boundingBox.min.x;
};

/** Is this mesh drawn as a clash over `under`, a piece of the same type? */
const clashing = (mesh, under) => mesh.material.transparent && mesh.material.opacity < 1
  && Math.abs(widthOf(mesh) / widthOf(under) - ALARM_SWELL) < 1e-6;

const ALARMED = {
  'a finished drawing': (stage, pieces, alarm) => trackPhase(stage, pieces, { drive: false, alarm }),
  'a build': (stage, pieces, alarm) => buildPhase(stage, pieces, { drive: false, alarm }),
};

for (const [name, phaseOf] of Object.entries(ALARMED)) {
  test(`a rejected piece in ${name} is drawn see-through over what it hit, and pulses`, () => {
    const clock = fakeClock();
    const { stage } = staged();
    const view = openScene('LLLLL');
    stage.run([phaseOf(stage, view.pieces, { id: view.offender.id, pulse: true })]);
    stage.start();
    clock.run(1);

    const offender = stage.cubes.get('5L').mesh.mesh;
    const others = ['1L', '2L', '3L', '4L'].map(id => stage.cubes.get(id).mesh.mesh);
    let flashes = 0;
    let showing = offender.geometry;
    clock.run(ALARM_PERIOD * 2, () => {
      assert.ok(clashing(offender, others[0]), 'it is not drawn swollen and see-through');
      if (offender.geometry !== showing) flashes += 1;
      showing = offender.geometry;
    });
    assert.ok(flashes >= 3 && flashes <= 5, `${flashes} repaints over two periods`);
    for (const [i, mesh] of others.entries()) {
      assert.equal(mesh.material.transparent, false, `cube ${i} is see-through`);
    }
    assert.equal(clock.running(), true, 'the pulse stopped');
  });
}

// A cube carried over to a new layout is still drawn as it was in the old one until
// something repaints it. `SSLLLSS` is stuck on its `4S`; in `SSISLILISS` that same
// cube is an ordinary straight, and the one stuck is `5S`.
const CARRIED = {
  'a finished drawing': (stage, pieces, alarm) => trackPhase(stage, pieces, { drive: false, alarm }),
  'a build': (stage, pieces, alarm) => buildPhase(stage, pieces, { drive: false, alarm }),
  'a move': (stage, pieces) => movePhase(stage, pieces, { frame: fixedFrame() }),
};

for (const [name, phaseOf] of Object.entries(CARRIED)) {
  test(`a rejected piece carried into ${name} where it is no longer rejected is drawn as its own piece`, () => {
    const clock = fakeClock();
    const { stage } = staged();
    const before = openScene('SSLLLSS');
    stage.run([trackPhase(stage, before.pieces, { drive: false, alarm: { id: before.offender.id, pulse: false } })]);
    stage.start();
    clock.run(1);
    const carried = stage.cubes.get('4S');
    assert.equal(before.offender.id, '4S');
    assert.ok(clashing(carried.mesh.mesh, stage.cubes.get('1S').mesh.mesh), 'it was never drawn as rejected');

    const after = openScene('SSISLILISS');
    stage.run([phaseOf(stage, after.pieces, { id: after.offender.id, pulse: false })]);
    stage.start();
    clock.run(3);

    assert.equal(stage.cubes.get('4S'), carried, 'it is not the same cube');
    const mesh = carried.mesh.mesh;
    assert.equal(mesh.material.transparent, false, 'it is still see-through');
    assert.equal(widthOf(mesh), widthOf(stage.cubes.get('1S').mesh.mesh), 'it is still swollen');
    assert.equal(carried.color, after.pieces[8].color, 'it is still painted as the rejected piece');
  });
}

// A repeat is picked out without leaving its own colour: each cube of every run
// pulses between its swatch and a paler one, solid and its own size, and nothing
// else is repainted. The post's own repeated layout: runs of seven and six straights.
const REPEATED = 'LIIOILIOLOIIOIIXSSSSSSSRRSSSSSSRSXRL';

// Driven too, as the post draws it: a pulse must neither be stalled by the train
// nor stall it.
const HIGHLIGHTED = {
  'a finished drawing': (stage, pieces, highlight) => trackPhase(stage, pieces, { drive: false, highlight }),
  'a build': (stage, pieces, highlight) => buildPhase(stage, pieces, { drive: false, highlight }),
  'a driven drawing': (stage, pieces, highlight) => trackPhase(stage, pieces, { highlight }),
  'a held drawing': (stage, pieces, highlight) => trackPhase(stage, pieces, { trainAt: () => 3, highlight }),
  'a driven build': (stage, pieces, highlight) => buildPhase(stage, pieces, { highlight }),
  'a driven grow': (stage, pieces, highlight) => growPhase(stage, pieces, { drive: true, highlight }),
};

for (const [name, phaseOf] of Object.entries(HIGHLIGHTED)) {
  test(`highlighted pieces in ${name} pulse paler in their own colour, and nothing else does`, () => {
    const clock = fakeClock();
    const { stage, handles } = staged();
    const view = repeatsScene(REPEATED);
    const [picked] = view.highlight.groups;
    assert.equal(view.highlight.groups.length, 1);
    assert.equal(picked.length, 13);
    assert.deepEqual(view.notes.map(n => n.lines[0][0].text), ['7 in a row · 5 repeats', '6 in a row · 4 repeats']);
    stage.run([phaseOf(stage, view.pieces, { ...view.highlight, pulse: true })]);
    stage.start();
    clock.run(6);

    const ids = cubeIds(view.pieces);
    const colorOf = new Map(view.pieces.map((p, i) => [ids[i], p.color]));
    const lit = picked.map(id => stage.cubes.get(id));
    const rest = [...stage.cubes.keys()].filter(id => !picked.includes(id)).map(id => stage.cubes.get(id));
    const train = name.startsWith('a driven') ? handles.at(-1) : null;
    assert.equal(train && handles.length, train && stage.cubes.size + 1, 'the train never set off');
    const writes = train?.transforms.length;
    const shapes = rest.map(cube => cube.mesh.mesh.geometry);
    const seen = new Set();
    clock.run(ALARM_PERIOD * 2, () => {
      for (const cube of lit) {
        assert.equal(cube.look, 'solid', `${cube.id} is not drawn solid`);
        assert.equal(cube.mesh.mesh.material.transparent, false, `${cube.id} is see-through`);
        seen.add(cube.color === colorOf.get(cube.id) ? 'own' : cube.color);
      }
    });
    const paler = [...seen].filter(c => c !== 'own');
    assert.ok(seen.has('own') && paler.length === 1, `the straights showed ${[...seen]}`);
    assert.ok(parseInt(paler[0].slice(1), 16) > parseInt(colorOf.get(lit[0].id).slice(1), 16), 'the pulse is not paler');
    for (const [i, cube] of rest.entries()) {
      assert.equal(cube.mesh.mesh.geometry, shapes[i], `${cube.id} was repainted by the highlight`);
    }
    if (train) assert.ok(train.transforms.length > writes, 'the train stood still');
    assert.equal(clock.running(), true, 'the pulse stopped');
  });
}

test('held still, highlighted pieces are pale, and the drawing finishes', () => {
  const clock = fakeClock();
  const { stage } = staged();
  const view = repeatsScene(REPEATED);
  stage.run([trackPhase(stage, view.pieces, { drive: false, highlight: { ...view.highlight, pulse: false } })]);
  const cube = stage.cubes.get(view.highlight.groups[0][0]);
  const held = cube.mesh.mesh.geometry;
  stage.start();
  clock.run(ALARM_PERIOD * 2);

  assert.notEqual(cube.color, view.pieces.find(p => p.type === 'straight').color, 'it is not pale');
  assert.equal(cube.mesh.mesh.geometry, held, 'it was repainted');
  assert.equal(clock.running(), false, 'a still drawing is asking for frames');
});

// A knot's halves take turns: in each turn one half is pale and the other its own
// colour, and the cross, in both, is never repainted. The post's trefoil.
const KNOTTED = 'ILIOIXIRSISSRISSSOSRRSOXSLLISSLSSOSI';

/** Which of `ids` are drawn paler than their own colour. */
const palerOf = (stage, view, ids) => {
  const all = cubeIds(view.pieces);
  const colorOf = new Map(view.pieces.map((p, i) => [all[i], p.color]));
  return ids.filter(id => stage.cubes.get(id).color !== colorOf.get(id));
};

test('a knot\'s halves take turns being paler, and the cross is never repainted', () => {
  const clock = fakeClock();
  const { stage } = staged();
  const view = knotScene(KNOTTED);
  const [a, b] = view.highlight.groups;
  assert.deepEqual([a.length, b.length], [17, 17]);
  stage.run([trackPhase(stage, view.pieces, { drive: false, highlight: { ...view.highlight, pulse: true } })]);
  const cross = stage.cubes.get('1X');
  const held = cross.mesh.mesh.geometry;
  stage.start();

  const { turn } = view.highlight;
  for (let k = 0; k < 4; k += 1) {
    clock.run(k === 0 ? turn / 2 : turn);
    const [lit, unlit] = k % 2 === 0 ? [a, b] : [b, a];
    assert.deepEqual(palerOf(stage, view, lit), lit, `turn ${k}: not every piece of its half is pale`);
    assert.deepEqual(palerOf(stage, view, unlit), [], `turn ${k}: the other half is pale too`);
    assert.equal(cross.mesh.mesh.geometry, held, `turn ${k}: the cross was repainted`);
  }
  assert.equal(clock.running(), true, 'the turns stopped');
});

test('held still, a knot\'s first half is pale and the second its own colour', () => {
  const clock = fakeClock();
  const { stage } = staged();
  const view = knotScene(KNOTTED);
  const [a, b] = view.highlight.groups;
  stage.run([trackPhase(stage, view.pieces, { drive: false, highlight: { ...view.highlight, pulse: false } })]);
  stage.start();
  clock.run(view.highlight.turn * 3);

  assert.deepEqual(palerOf(stage, view, a), a);
  assert.deepEqual(palerOf(stage, view, b), []);
  assert.equal(clock.running(), false, 'a still drawing is asking for frames');
});

test('held still, a rejected piece is see-through dark red, and the drawing finishes', () => {
  const clock = fakeClock();
  const { stage } = staged();
  const view = openScene('LLLLL');
  stage.run([trackPhase(stage, view.pieces, { drive: false, alarm: { id: view.offender.id, pulse: false } })]);
  const offender = stage.cubes.get('5L').mesh.mesh;
  const held = offender.geometry;
  stage.start();
  clock.run(ALARM_PERIOD * 2);

  assert.ok(clashing(offender, stage.cubes.get('1L').mesh.mesh), 'it is not drawn swollen and see-through');
  assert.equal(offender.geometry, held, 'it was repainted');
  assert.equal(clock.running(), false, 'a still drawing is asking for frames');
});

test('a stuck track keeps asking for frames, and an unstuck one stops', () => {
  const { clock, type } = typing();

  type('LLLLL');
  clock.run(3);
  assert.equal(clock.running(), true, 'the alarm stopped pulsing');

  type('LLLL');       // backspace: closed, so the train keeps the loop running
  clock.run(3);
  assert.equal(clock.running(), true);

  type('LLL');        // open, nothing arriving, nothing at fault: nothing to draw
  clock.run(3);
  assert.equal(clock.running(), false, 'a settled open track is still asking for frames');
});

// ---- The camera that grows ------------------------------------------------

test('the frame eases rather than snapping', () => {
  const clock = fakeClock();
  const { stage } = staged();

  // The first shot is not a move: there is nothing to pan from.
  stage.panTo({ zoom: 4, target: '0,0,0' });
  assert.equal(stage.zoom().toFixed(3), (4 * 0.88).toFixed(3));

  stage.run([{ advance: () => undefined }]);
  stage.start();
  stage.panTo({ zoom: 2, target: '20,0,0' }, 0.4);

  const zooms = [];
  clock.run(0.6, () => zooms.push(stage.zoom()));

  // It arrives, and it gets there by moving rather than by jumping.
  assert.equal(zooms.at(-1).toFixed(3), (2 * 0.88).toFixed(3));
  assert.ok(zooms.length > 10, 'the pan took no time at all');
  assert.ok(Math.max(...zooms.slice(1).map((z, i) => Math.abs(z - zooms[i]))) < 0.2,
    'the camera jumped rather than eased');
});

test('a pan outlives the phase that asked for it', () => {
  // The loop stops when the queue empties, and the pan is not in the queue — so a
  // keystroke that adds nothing but reaches new ground would otherwise leave the
  // camera stranded part-way there.
  const clock = fakeClock();
  const { stage } = staged();

  stage.frameTo({ zoom: 4, target: '0,0,0' });
  stage.run([{ advance: () => false }]);        // finished on its first frame
  stage.panTo({ zoom: 2, target: '0,0,0' }, 0.4);
  stage.start();
  clock.run(1);

  assert.equal(stage.zoom().toFixed(3), (2 * 0.88).toFixed(3));
  assert.equal(clock.running(), false, 'the loop ran on after the pan finished');
});

// ---- Moving the cubes to a new layout -----------------------------------------

/**
 * One layout standing, then a move to another, the way `TrackViewer` runs one:
 * the cubes the new layout has no ID for detached, the move, and then the finished
 * track. The camera is already on the new layout's frame, as at the end of a pan.
 */
function moving(shapeFrom, shapeTo, { drive = false } = {}) {
  const clock = fakeClock();
  const { handles, stage } = staged();
  const from = piecesOf(shapeFrom);
  const to = piecesOf(shapeTo);
  const { camera } = sceneFromRoute(routeOf(shapeTo));
  stage.frameTo(camera);

  stage.run([trackPhase(stage, from, { drive })]);
  clock.run(0.1);
  const before = new Map([...stage.cubes].map(([id, cube]) => [id, cube]));
  const writes = new Map([...before].map(([id, cube]) => [id, handleOf(cube).transforms.length]));

  const keep = new Set(identify(to));
  const leaving = [...stage.cubes.keys()].filter(id => !keep.has(id)).map(id => stage.detach(id));
  stage.run([
    movePhase(stage, to, { leaving, frame: camera }),
    deferred(() => trackPhase(stage, to, { drive })),
  ]);
  stage.start();
  return { stage, handles, clock, to, before, writes, leaving };
}

test('a move carries the same cubes to their new slots', () => {
  const { stage, handles, clock, to, before } = moving(SET, OTHER);
  const cubes = to.filter(p => !p.revisit);
  const ids = identify(to);

  clock.run(MOVE / 2);
  const midway = ids.filter(id => !near(stage.cubes.get(id).position, restingPlace(cubes[ids.indexOf(id)])));
  assert.ok(midway.length > 0, 'nothing was in the air half-way through');
  clock.run(MOVE);

  assert.equal(handles.length, 18, 'a cube was minted for a layout that holds the same 18');
  for (const [i, id] of ids.entries()) {
    const cube = stage.cubes.get(id);
    assert.equal(cube, before.get(id), `${id} is not the cube it was`);
    assert.equal(handleOf(cube).disposed, false, `${id} was taken away`);
    assert.deepEqual(cube.position, restingPlace(cubes[i]), `${id} landed off its cell`);
    assert.ok(gap(cube.basis, poseRotation(cubes[i].pose)) < 1e-12, `${id} landed turned`);
  }
});

test('a move to the layout already standing writes to no cube', () => {
  const { clock, before, writes } = moving(SET, SET);
  clock.run(MOVE * 2);
  for (const [id, cube] of before) {
    assert.equal(handleOf(cube).transforms.length, writes.get(id), `${id} was moved into the place it was in`);
  }
});

test('a cube the new layout has no slot for fades where it stands, then goes', () => {
  const { stage, clock, leaving, writes } = moving(SET, RING);
  assert.equal(leaving.length, 14, 'the ring keeps four left curves of the eighteen');
  assert.ok(leaving.every(cube => !stage.cubes.has(cube.id)), 'a leaving cube still holds its ID');

  const opacities = [];
  clock.run(MOVE * 0.9, () => opacities.push(leaving[0].mesh.mesh.material.opacity));
  assert.ok(opacities.at(-1) < 0.2 && opacities.at(-1) > 0, `it was at ${opacities.at(-1)} near the end`);
  assert.ok(opacities.every((v, i) => i === 0 || v <= opacities[i - 1]), 'it brightened on the way out');
  for (const cube of leaving) {
    assert.equal(handleOf(cube).transforms.length, writes.get(cube.id), `${cube.id} moved as it faded`);
  }

  clock.run(MOVE);
  assert.ok(leaving.every(cube => handleOf(cube).disposed), 'a faded cube was never taken away');
  assert.equal(stage.cubes.size, 4);
});

test('a move replaced part-way through takes its fading cubes away at once', () => {
  const { stage, clock, leaving } = moving(SET, RING);
  clock.run(MOVE / 3);
  stage.run([trackPhase(stage, piecesOf(RING), { drive: false })]);
  assert.ok(leaving.every(cube => handleOf(cube).disposed), 'a fading cube was stranded half-seen');
});

test('a cube with no cube to carry comes in from beyond the nearest edge of the picture', () => {
  const { stage, clock, to, before } = moving(RING, SET);
  const cubes = to.filter(p => !p.revisit);
  const ids = identify(to);
  const minted = ids.filter(id => !before.has(id));
  assert.equal(minted.length, 14);

  const screen = at => {
    const { x, y } = new Vector3(...at).project(stage.camera);
    return [x * 450, y * 350];   // pixels from the middle of the 900×700 stand-in
  };
  for (const id of minted) {
    const cube = stage.cubes.get(id);
    const [sx, sy] = screen(restingPlace(cubes[ids.indexOf(id)]));
    const [ex, ey] = screen(handleOf(cube).transforms[0].position);
    // The edge nearest the slot, and the start beyond it, on its side.
    const across = 450 - Math.abs(sx) < 350 - Math.abs(sy);
    if (across) assert.ok(Math.abs(ex) > 450 && Math.sign(ex) === Math.sign(sx), `${id} set off at ${ex}, ${ey}`);
    else assert.ok(Math.abs(ey) > 350 && Math.sign(ey) === Math.sign(sy), `${id} set off at ${ex}, ${ey}`);
  }

  clock.run(MOVE * 2);
  for (const id of minted) {
    assert.deepEqual(stage.cubes.get(id).position, restingPlace(cubes[ids.indexOf(id)]), `${id} landed off its cell`);
  }
});

test('there is no train while the cubes move, and one once they have landed', () => {
  const { handles, clock } = moving(SET, OTHER, { drive: true });
  const alive = () => handles.filter(h => !h.disposed).length;
  assert.equal(alive(), 18, 'the old train outlived its layout');
  clock.run(MOVE / 2);
  assert.equal(alive(), 18, 'a train was put on a track still being moved');
  clock.run(MOVE);
  assert.equal(alive(), 19, '18 cubes and exactly one train');
});

test('a stretch moved whole keeps its shape, and goes straight to its place', () => {
  const clock = fakeClock();
  const { stage } = staged();
  const joined = layoutScene('SLSLR');
  stage.frameTo(joined.camera);
  stage.run([trackPhase(stage, apartScene(2)('SLSLR').pieces, { drive: false })]);
  clock.run(0.1);

  const ids = identify(joined.pieces);
  const [first, second] = [ids.slice(0, 2), ids.slice(2)].map(group => group.map(id => stage.cubes.get(id)));
  const writes = first.map(cube => handleOf(cube).transforms.length);
  const spread = () => second.flatMap((a, i) => second.slice(i + 1)
    .map(b => Math.hypot(...a.position.map((v, k) => v - b.position[k]))));
  const shape = spread();

  stage.run([movePhase(stage, joined.pieces, { frame: joined.camera })]);
  stage.start();
  let elapsed = 0;
  let home = null;
  clock.run(MOVE + 0.1, () => {
    elapsed += 0.016;
    spread().forEach((d, i) => assert.ok(Math.abs(d - shape[i]) < 1e-9, `the stretch bent at ${elapsed.toFixed(3)}s`));
    if (home === null && near(second[0].position, restingPlace(joined.pieces[2]))) home = elapsed;
  });

  assert.ok(home !== null && home >= MOVE, `the stretch was home at ${home}s, before its flight was over`);
  second.forEach((cube, i) => assert.ok(near(cube.position, restingPlace(joined.pieces[2 + i])), `${ids[2 + i]} landed off its cell`));
  first.forEach((cube, i) => assert.equal(handleOf(cube).transforms.length, writes[i], `${ids[i]} was moved, and it was standing`));
});

test('a stretch with a cube that stays put turns in place about it', () => {
  const clock = fakeClock();
  const { stage } = staged();
  const [a, b] = ['IROSIRR', 'SIL'];
  const states = ['apart', 'turned'];
  const [plain, turned] = [false, true].map(t => apartScene(a.length, { turned: t, states })(a + b));
  stage.frameTo(turned.camera);
  stage.run([trackPhase(stage, plain.pieces, { drive: false })]);
  clock.run(0.1);

  const ids = identify(turned.pieces);
  const second = ids.slice(a.length).map(id => stage.cubes.get(id));
  const [pivot] = second;
  const at = [...pivot.position];
  const reach = () => second.map(cube => Math.hypot(...cube.position.map((v, k) => v - pivot.position[k])));
  const shape = reach();

  stage.run([movePhase(stage, turned.pieces, { frame: turned.camera })]);
  stage.start();
  let elapsed = 0;
  clock.run(MOVE + 0.1, () => {
    elapsed += 0.016;
    assert.ok(near(pivot.position, at), `the start cube left its place at ${elapsed.toFixed(3)}s`);
    reach().forEach((d, i) => assert.ok(Math.abs(d - shape[i]) < 1e-9, `the group bent at ${elapsed.toFixed(3)}s`));
  });
  second.forEach((cube, i) => assert.ok(near(cube.position, restingPlace(turned.pieces[a.length + i])), `${ids[a.length + i]} landed off its cell`));
});

test('a changing outline fades on a paint of its own, and the rest stay', () => {
  const clock = fakeClock();
  const { stage, handles } = staged();
  stage.setOutlines([{ cell: [0, 0, 0], tint: 'after' }, { cell: [2, 0, 0], tint: 'after', changing: 'out' }]);
  const [still, fading] = handles.filter(h => h.name === OVERLAY.origin && !h.disposed).map(h => h.mesh.material);
  assert.notEqual(still, fading);

  stage.setChangingOpacity(0.25);
  assert.equal(fading.opacity, 0.25);
  assert.equal(still.opacity, 1);
  stage.setOverlayOpacity(0.5);
  assert.equal(fading.opacity, 0.125, 'it is drawn at the overlays\' share too');

  stage.setOverlayOpacity(1);
  stage.run([changingFadePhase(stage, { to: 0 })]);
  stage.start();
  clock.run(FADE_OUT + 0.1);
  assert.equal(stage.changingOpacity(), 0);
  assert.equal(fading.opacity, 0);
  assert.equal(still.opacity, 1);

  const cut = changingFadePhase(stage, { to: 1 });
  cut.dispose();
  assert.equal(stage.changingOpacity(), 1, 'cut short, it is left where it was going');
});

// ---- A new step fading in -----------------------------------------------------

/** A track standing finished in `pose`, and turned to start in `to`. */
function turned(shape, pose, to) {
  const clock = fakeClock();
  const { handles, stage } = staged();
  stage.run([trackPhase(stage, openScene(shape, pose).pieces, { drive: false })]);
  stage.start();
  clock.run(0.1);
  const before = new Map(stage.cubes);
  const next = openScene(shape, to).pieces;
  stage.run([turnPhase(stage, next)]);
  stage.start();
  return { stage, handles, clock, before, next };
}

test('a new start turns the same cubes about the origin cube, and lands them in their slots', () => {
  const { stage, handles, clock, before, next } = turned(SET, 'DF', 'LU');
  const reach = new Map([...before].map(([id, cube]) => [id, Math.hypot(...cube.position)]));
  const [from, to] = [before.get('1L').basis, poseRotation(next[0].pose)];
  let midway = false;
  clock.run(TURN + 0.1, () => {
    for (const [id, cube] of stage.cubes) {
      assert.ok(Math.abs(Math.hypot(...cube.position) - reach.get(id)) < 1e-9, `${id} left its sphere about the origin`);
    }
    const { basis } = stage.cubes.get('1L');
    if (gap(basis, from) > 0.1 && gap(basis, to) > 0.1) midway = true;
  });
  assert.ok(midway, 'nothing had turned half-way through');
  assert.equal(handles.length, before.size, 'a cube was minted for the same track');
  const ids = identify(next);
  next.filter(p => !p.revisit).forEach((piece, i) => {
    const cube = stage.cubes.get(ids[i]);
    assert.equal(cube, before.get(ids[i]), `${ids[i]} is not the cube it was`);
    assert.equal(handleOf(cube).disposed, false, `${ids[i]} was taken away`);
    assert.deepEqual(cube.position, restingPlace(piece), `${ids[i]} landed off its cell`);
    assert.ok(gap(cube.basis, poseRotation(piece.pose)) < 1e-12, `${ids[i]} landed turned`);
  });
});

test('a turn caught part-way turns on from where it got to', () => {
  const { stage, clock, next } = turned(SET, 'DF', 'LU');
  clock.run(TURN / 3);
  const again = openScene(SET, 'BR').pieces;
  stage.run([turnPhase(stage, again)]);
  clock.run(TURN + 0.1);
  const ids = identify(again);
  again.filter(p => !p.revisit).forEach((piece, i) => {
    assert.deepEqual(stage.cubes.get(ids[i]).position, restingPlace(piece), `${ids[i]} landed off its cell`);
  });
  assert.notDeepEqual(next, again);
});

test('a new layout that is not the same track turned is refused', () => {
  const clock = fakeClock();
  const { stage } = staged();
  stage.run([trackPhase(stage, piecesOf(SET), { drive: false })]);
  stage.start();
  clock.run(0.1);
  assert.throws(() => turnPhase(stage, piecesOf(OTHER)), /not turned about the origin/);
});

test('the overlays fade out together and back in to their own strengths', () => {
  const clock = fakeClock();
  const { stage, handles } = staged();
  const pieces = piecesOf(RING);
  stage.setGrid(gridLines(extentOf(pieces)));
  stage.setOrigin({ ...extentOf(pieces), cell: false });
  stage.setOutlines([{ cell: [0, 0, 0], tint: 'before' }]);
  // The lattice, the axes, and the outline — which carries the axes' name, after them.
  const live = name => handles.filter(h => h.name === name && !h.disposed);
  const opacities = () => [live(OVERLAY.grid)[0], ...live(OVERLAY.origin)].map(h => h.mesh.material.opacity);
  const strengths = opacities();
  assert.equal(strengths.length, 3);

  stage.run([overlayFadePhase(stage, { to: 0 })]);
  stage.start();
  clock.run(FADE_OUT / 2);
  assert.ok(opacities().every((o, i) => o > 0 && o < strengths[i]), 'not every overlay was fading');
  clock.run(FADE_OUT);
  assert.deepEqual(opacities(), [0, 0, 0]);
  assert.equal(stage.overlayOpacity(), 0);

  const origin = handles.find(h => h.name === OVERLAY.origin).mesh.material;
  assert.equal(origin.transparent, true, 'the faded axes were not drawn see-through');
  stage.run([overlayFadePhase(stage, { to: 1 })]);
  stage.start();
  clock.run(FADE_IN + 0.1);
  assert.deepEqual(opacities(), strengths);
  assert.equal(origin.transparent, false, 'the axes were left see-through');
});

test('a new step fades the old layout out, then the new one in left group first, standing still', () => {
  const clock = fakeClock();
  const { stage } = staged();
  stage.run([trackPhase(stage, piecesOf(RING), { drive: false })]);
  clock.run(0.1);
  const leaving = [...stage.cubes.keys()].map(id => stage.detach(id));

  const apart = apartScene(2)('SLSLR').pieces;
  const ids = identify(apart);
  stage.run([fadeOutPhase(leaving), deferred(() => fadeInPhase(stage, apart))]);
  stage.start();

  clock.run(FADE_OUT / 2);
  assert.ok(leaving.every(cube => cube.opacity > 0 && cube.opacity < 1), 'the old layout did not fade out');
  assert.equal(stage.cubes.size, 0, 'the new layout came in before the old one had gone');
  clock.run(FADE_OUT / 2 + 0.05);
  assert.ok(leaving.every(cube => handleOf(cube).disposed), 'a faded cube was never taken away');

  const [left, right] = [ids.slice(0, 2), ids.slice(2)].map(group => group.map(id => stage.cubes.get(id)));
  const writes = [...left, ...right].map(cube => handleOf(cube).transforms.length);
  let frames = 0;
  clock.run(FADE_IN * 2 + 0.05, () => {
    if (right.some(cube => cube.opacity > 0)) {
      assert.ok(left.every(cube => cube.opacity === 1), 'the right group started before the left was in');
    }
    if (left.some(cube => cube.opacity > 0 && cube.opacity < 1)) frames += 1;
  });
  assert.ok(frames > 5, `the left group came in over only ${frames} frames`);
  assert.ok([...left, ...right].every(cube => cube.opacity === 1), 'a cube was left see-through');
  [...left, ...right].forEach((cube, i) => {
    assert.equal(handleOf(cube).transforms.length, writes[i], `${cube.id} moved as it faded in`);
    assert.ok(near(cube.position, restingPlace(apart[i])), `${cube.id} is not in its slot`);
  });
});

// ---- The cell lattice -------------------------------------------------------

test('the lattice box holds the train as well as the cubes', () => {
  const pieces = piecesOf(RING);
  const { lo, hi } = extentOf(pieces);

  // A flat ring's train rides one layer above its cubes.
  assert.equal(hi[1], boundsOf(pieces).hi[1] + 1);
  for (const cell of pieces.flatMap(p => [...p.material, ...p.train])) {
    for (const a of [0, 1, 2]) assert.ok(cell[a] >= lo[a] && cell[a] <= hi[a], `${cell} outside`);
  }
});

test('the lattice is one closed surface, and stays on the cell boundaries', () => {
  const box = { lo: [-3, 0, -2], hi: [0, 1, 1] };   // 4 × 2 × 4 cells
  const polygons = gridLines(box);
  const [nx, ny, nz] = [4, 2, 4];
  // Four faces per cell edge, and one per node per side of the box it lies on.
  const edges = nx * (ny + 1) * (nz + 1) + ny * (nx + 1) * (nz + 1) + nz * (nx + 1) * (ny + 1);
  const outside = 2 * ((ny + 1) * (nz + 1) + (nx + 1) * (nz + 1) + (nx + 1) * (ny + 1));
  assert.equal(polygons.length, 4 * edges + outside);

  // Closed and never doubled: every directed polygon edge is met by exactly one
  // edge running the other way. A hole at a corner, or two prisms overlapping
  // there, leaves an edge unmatched.
  const key = p => p.map(v => v.toFixed(6)).join(',');
  const directed = new Map();
  for (const { vertices } of polygons) {
    vertices.forEach((p, i) => {
      const k = `${key(p)}>${key(vertices[(i + 1) % vertices.length])}`;
      directed.set(k, (directed.get(k) ?? 0) + 1);
    });
  }
  for (const [k, n] of directed) {
    const [a, b] = k.split('>');
    assert.equal(n, 1, `edge ${k} is drawn ${n} times`);
    assert.equal(directed.get(`${b}>${a}`), 1, `edge ${k} is open`);
  }

  // Every vertex sits within half a line's width of the box's outer faces.
  const reach = CUBE / 2 + GRID_W / 2 + 1e-9;
  const [wlo, whi] = [toWorld(box.lo), toWorld(box.hi)];
  for (const [x, y, z] of polygons.flatMap(p => p.vertices)) {
    [x, y, z].forEach((v, k) => {
      assert.ok(v >= Math.min(wlo[k], whi[k]) - reach && v <= Math.max(wlo[k], whi[k]) + reach);
    });
  }
});

test('the lattice is one mesh, which clearing the cubes leaves standing', () => {
  const { handles, stage } = staged();
  const pieces = piecesOf(RING);

  stage.setGrid(gridLines(extentOf(pieces)));
  const first = handles.at(-1);
  stage.run([trackPhase(stage, pieces, { drive: false })]);
  stage.clear();
  assert.equal(first.disposed, false, 'clearing the cubes took the lattice');

  stage.setGrid(gridLines(extentOf(piecesOf(SET))));
  assert.equal(first.disposed, true, 'a replaced lattice was left behind');
  const second = handles.at(-1);
  assert.notEqual(second, first);

  stage.setGrid(null);
  assert.equal(second.disposed, true);
  // Painted as an overlay, and nothing else is.
  assert.deepEqual(handles.filter(h => h.name === OVERLAY.grid), [first, second]);
  assert.equal(first.mesh.material.transparent, true);
  assert.equal(first.mesh.material.depthWrite, false);
  // Drawn a second time into depth alone, after the ghosts and before the fill.
  const [depth] = first.mesh.children;
  assert.equal(depth.geometry, first.mesh.geometry);
  assert.equal(depth.material.colorWrite, false);
  assert.equal(depth.material.depthWrite, true);
  assert.ok(depth.renderOrder > first.mesh.renderOrder);
});

test('ghost trains are one mesh each, mark their face, and outlive clearing the cubes', () => {
  const { handles, stage } = staged();
  const ghosts = () => handles.filter(h => h.name === OVERLAY.ghost);
  const floors = () => handles.filter(h => h.name === `${OVERLAY.ghost}-floor`);

  stage.setGhosts([
    { type: 'straight', cell: [0, 1, 0], pose: 'DF' },
    { type: 'straight', cell: [0, -1, 1], pose: 'BD' },
  ]);
  const first = ghosts();
  assert.equal(first.length, 2);
  assert.equal(floors().length, 2, 'each ghost marks the face it stands on');
  // Half a cube along a straight is its middle: the body is in its train cell.
  const [x, y, z] = first[0].transforms.at(-1).position;
  [x, y, z].forEach((v, k) => assert.ok(Math.abs(v - [0, 0, RAIL][k]) < 1e-9, `${[x, y, z]}`));

  stage.run([trackPhase(stage, piecesOf(RING), { drive: false })]);
  stage.clear();
  assert.ok(first.every(h => !h.disposed), 'clearing the cubes took the ghosts');

  stage.setGhosts([{ type: 'straight', cell: [0, 1, 1], pose: 'DF' }]);
  assert.ok(first.every(h => h.disposed), 'replaced ghosts were left behind');
  stage.setGhosts([]);
  assert.ok(ghosts().every(h => h.disposed));
  assert.ok(floors().every(h => h.disposed), 'floor patches were left behind');
});

test('the lattice fills the cell the train is in, and moves the fill rather than redrawing it', () => {
  const clock = fakeClock();
  const { handles, stage } = staged();
  const pieces = piecesOf(SET);
  const marks = () => handles.filter(h => h.name === OVERLAY.trainCell);

  stage.run([trackPhase(stage, pieces, { drive: true })]);
  stage.start();
  clock.run(1);
  assert.equal(marks().length, 0, 'a cell was marked with no lattice to mark it on');

  // A lattice put up under a train that is already running marks its cell at once.
  stage.setGrid(gridLines(extentOf(pieces)));
  assert.equal(marks().length, 1);
  clock.run(20);

  // Still one mesh: moved, never remounted.
  assert.equal(marks().length, 1, 'the mark was remounted rather than moved');
  const [mark] = marks();
  // Round the whole loop: into a train cell of every piece that books any. Not
  // every one — the model books a curve's whole 2×2 block, and the arc cuts a
  // corner of it. And only cells of the track: an inside curve books no train
  // cells, because its train runs through the curve's own footprint.
  const worlds = cells => cells.map(c => String(toWorld(c)));
  const visited = new Set(mark.transforms.map(t => String(t.position)));
  for (const [i, piece] of pieces.entries()) {
    if (!piece.train.length) continue;
    assert.ok(worlds(piece.train).some(at => visited.has(at)), `piece ${i} was never marked`);
  }
  const track = new Set(pieces.flatMap(p => worlds([...p.train, ...p.material])));
  for (const at of visited) assert.ok(track.has(at), `${at} is off the track`);
  // One transform per cell entered, not one per frame.
  assert.ok(mark.transforms.length < 20 / 0.016 / 10, `${mark.transforms.length} transforms`);

  // The train's phase replaced: the mark goes with the train.
  stage.run([tumblePhase(stage, pieces, { drop: 1, limit: 1 })]);
  assert.equal(mark.disposed, true, 'the mark outlived its train');
});

test('the stage reports each cell the train enters once, lattice or not, and null when it goes', () => {
  const clock = fakeClock();
  const reported = [];
  const { stage } = staged({ onTrainCell: cell => reported.push(cell) });
  const pieces = piecesOf(SET);

  stage.run([trackPhase(stage, pieces, { drive: true })]);
  stage.start();
  clock.run(20);

  const cells = reported.filter(Boolean);
  assert.ok(cells.length > 0, 'nothing was reported with no lattice up');
  assert.ok(cells.every(c => c.length === 3 && c.every(Number.isInteger)), 'not whole-number cells');
  cells.slice(1).forEach((c, i) => assert.notEqual(String(c), String(cells[i]), 'a cell was reported twice running'));
  assert.ok(cells.length < 20 / 0.016 / 10, `${cells.length} reports is one per frame`);
  assert.equal(reported.includes(null), false, 'the train was reported gone while running');

  stage.run([tumblePhase(stage, pieces, { drop: 1, limit: 1 })]);
  assert.equal(reported.at(-1), null, 'the train went and nobody was told');
});

test('the blueprint\'s sheet zooms and pans with the camera, and ignores the orbit', () => {
  const { stage } = staged();
  stage.frameTo({ zoom: 2, target: '40,-20,10' });
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} is not ${b}`);
  const at = () => stage.backdrop();

  // Untouched, one dot is pinned to the frame's target, which is the canvas's middle,
  // and the dots are a cell's edge apart at the zoom applied.
  close(at().x, 450, 'pinned across');
  close(at().y, 350, 'pinned down');
  close(at().spacing, stage.zoom() * CUBE, 'spacing');

  // An orbit turns the scene about that same point, so the sheet does not move.
  stage.adjust(orbit(stage.view(), 120, -40));
  close(at().x, 450, 'orbited across');
  close(at().y, 350, 'orbited down');

  // A pan slides the scene under the pointer, and the sheet slides with it.
  stage.adjust(slid(stage.view(), 30, -12, stage.zoom()));
  close(at().x, 480, 'panned across');
  close(at().y, 338, 'panned down');

  // A zoom spreads the dots by as much as it spreads the scene.
  const before = at().spacing;
  stage.adjust(zoomed(stage.view(), stage.view().zoomBy * 2));
  close(at().spacing, before * 2, 'zoomed spacing');
});

test('the origin\'s outline and arrows are overlays that clear() leaves and setOrigin(null) takes away', () => {
  const { handles, stage } = staged();
  const axes = () => handles.filter(h => h.name === OVERLAY.origin);

  stage.setOrigin({ lo: [0, 0, 0], hi: [2, 2, 2] });
  assert.equal(axes().length, 2);
  stage.clear();
  assert.ok(axes().every(h => !h.disposed), 'clear() took the axes down');
  stage.setOrigin(null);
  assert.ok(axes().every(h => h.disposed));
});

test('a sum outlines each group\'s two ends, then the joined route\'s', () => {
  const [a, b] = ['SL', 'SLR'];
  const apart = apartScene(a.length)(a + b);
  const joined = joinedScene(a + b);
  const [first, second, whole] = [a, b, a + b].map(letters => openScene(letters).head);
  // The second group is drawn slid: its start cube's slide is its start outline,
  // and the same slide takes its own end to where its end is outlined.
  const [moved] = apart.pieces.filter(p => p.group === 1);
  const slid = openScene(b).pieces[0];
  const by = moved.cell.map((v, k) => v - slid.cell[k]);
  const plus = c => c.map((v, k) => v + by[k]);

  assert.deepEqual(apart.outlines, [
    { cell: [0, 0, 0], tint: 'before' }, { cell: trackCell(first), tint: 'after' },
    { cell: by, tint: 'before' }, { cell: plus(trackCell(second)), tint: 'after' },
  ]);
  // Each callout reads its group's own end, not where it is drawn, and points at
  // the cube the next piece would go in, where it is drawn.
  assert.deepEqual(apart.notes.map(n => n.lines), [first, second].map(h => poseReadout(h)));
  assert.deepEqual(apart.notes.map(n => n.cell), [trackCell(first), plus(trackCell(second))]);
  assert.deepEqual(joined.outlines, [{ cell: [0, 0, 0], tint: 'before' }, { cell: trackCell(whole), tint: 'after' }]);
  assert.equal(joined.ghosts, undefined, 'no train is drawn');
  assert.deepEqual(joined.notes.map(n => n.lines), [poseReadout(whole)]);
  assert.deepEqual(joined.notes.map(n => n.cell), [trackCell(whole)]);
});

test('a turned sum lays the second group from where the first ends, turning or joining it in place', () => {
  const [a, b] = ['IROSIRR', 'SIL'];
  const end = openScene(a).head.pose;
  assert.notEqual(end, 'DF', 'the first group must end turned for this to test anything');
  const second = scene => scene.pieces.filter(p => p.group === 1);
  const offset = scene => second(scene)[0].cell.map((v, k) => v - laid.pieces[0].cell[k]);
  const laid = openScene(b, end);

  // Turned, the second group is the one laid from the first's end, slid, and its
  // callout reads its own end from there.
  const rotating = ['apart', 'turned'];
  const [plain, turned] = [false, true].map(t => apartScene(a.length, { turned: t, states: rotating })(a + b));
  const by = offset(turned);
  assert.deepEqual(second(turned).map(p => ({ ...p, group: undefined })), laid.pieces.map(p => ({
    ...p, group: undefined, cell: p.cell.map((v, k) => v + by[k]),
    material: p.material.map(c => c.map((v, k) => v + by[k])), train: p.train.map(c => c.map((v, k) => v + by[k])),
  })));
  assert.deepEqual(turned.notes[1].lines, poseReadout(laid.head));
  // Turning keeps its start cube where it was, and the shot with it.
  assert.deepEqual(turned.outlines[2], plain.outlines[2]);
  assert.deepEqual(turned.camera, plain.camera);
  assert.notDeepEqual(second(turned).map(p => p.pose), second(plain).map(p => p.pose));

  // Joined from turned, every second-group cube keeps its orientation: a slide only.
  const apart = apartScene(a.length, { turned: true, states: ['turned'] })(a + b);
  const joined = joinedScene(a + b);
  assert.deepEqual(second(apart).map(p => p.pose), joined.pieces.slice(a.length).map(p => p.pose));

  // A sum turns on one shot, then joins on a tight one of the joined track's own.
  const [apartShot, turnedShot] = [false, true].map(t => apartScene(a.length, { turned: t })(a + b).camera);
  assert.deepEqual(turnedShot, apartShot);
  assert.deepEqual(joined.camera, frameFit([...joined.pieces.flatMap(p => p.material), trackCell(joined.head)]
    .flatMap(c => cornersOf({ lo: c, hi: c }))));
  assert.ok(joined.camera.zoom > apartShot.zoom, 'the joined track was not drawn closer than the two groups');

  assert.throws(() => apartScene(a.length, { states: ['turned'] })(a + b), /do not hold the one drawn/);
});

test('setOutlines outlines each cell where it is, without arrows, and clear() leaves them', () => {
  const { handles, stage } = staged();
  const outlines = () => handles.filter(h => h.name === OVERLAY.origin && !h.disposed);
  const cells = [[0, 0, 0], [3, 0, 3]];

  stage.setOutlines(cells.map(cell => ({ cell })));
  assert.deepEqual(
    outlines().map(h => String(new Vector3().setFromMatrixPosition(h.mesh.matrix).toArray())),
    cells.map(c => String(toWorld(c))),
  );
  stage.clear();
  assert.equal(outlines().length, 2, 'clear() took the outlines down');
  stage.setOutlines([{ cell: [0, 0, 0] }]);
  assert.equal(outlines().length, 1);
  stage.setOutlines([]);
  assert.equal(outlines().length, 0);
});

test('a step\'s end is outlined in the origin\'s paint and its start in a deeper blue, thinner, both fading with the overlays', () => {
  const { handles, stage } = staged();
  const shown = () => handles.filter(h => h.name === OVERLAY.origin && !h.disposed).map(h => h.mesh);
  const reach = mesh => {
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox.max.x;
  };

  stage.setOutlines([{ cell: [0, 0, 0] }, { cell: [1, 0, 0], tint: 'before' }, { cell: [2, 0, 0], tint: 'after' }]);
  const [origin, before, after] = shown();
  assert.equal(after.material, origin.material, 'the end is in the origin\'s paint');
  assert.equal(`#${before.material.color.getHexString()}`, THEME.outlineBefore);
  assert.ok(reach(before) < reach(after) && reach(after) < reach(origin), 'start thinner than end, end thinner than origin');

  stage.setOverlayOpacity(0.5);
  for (const mesh of [before, after]) {
    assert.equal(mesh.material.opacity, 0.5);
    assert.equal(mesh.material.transparent, true);
  }
});

test('each axis label is projected to where its spot lands on the canvas', () => {
  // The canvas sits at (100, 50) on the page, and a label is placed in client pixels.
  const canvas = {
    clientWidth: 900,
    clientHeight: 700,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 900, height: 700 }),
  };
  const stage = createStage(canvas, { theme: THEME, renderer: { draw() {} } });
  stage.frameTo({ zoom: 4, target: '0,0,0' });
  stage.setOrigin({ lo: [0, 0, 0], hi: [2, 2, 2] });
  const tips = stage.originTips();
  assert.deepEqual(tips.map(t => t.name), ['x', 'y', 'z']);

  // Up is up the screen: the z label stands above the other two, and the reader's
  // x (left) is left of their y (forwards, away up and to the right).
  const [x, y, z] = tips;
  assert.ok(z.y < Math.min(x.y, y.y), 'the z label is not the highest');
  assert.ok(x.x < y.x, 'x is not to the left of y');
  for (const { x: px, y: py } of tips) {
    assert.ok(px > 100 && px < 1000 && py > 50 && py < 750, `a label is off the canvas at ${px}, ${py}`);
  }
});

test('the arrows stand outside the box\'s corner and reach left, forwards and up, in the reader\'s frame', () => {
  const polys = axisArrows();
  assert.ok(polys.every(p => p.vertices.length >= 3 && p.vertices.flat().every(Number.isFinite)));
  // The world is X right, Y forwards, Z up; the reader's x is left, so it runs toward -X.
  const dirs = [-1, 1, 1];
  const along = k => polys.flatMap(p => p.vertices.map(v => v[k] * dirs[k]));
  for (const k of [0, 1, 2]) {
    assert.ok(Math.abs(Math.min(...along(k))) <= AXIS_HEAD_W * CUBE * Math.SQRT2 + 1, `axis ${k} does not start at the corner`);
    assert.ok(Math.max(...along(k)) >= CUBE * 1.5, `axis ${k} is too short to read`);
  }
  // Each label sits past its own arrow's tip, on its own axis.
  for (const [k, { name, position }] of labelSpots().entries()) {
    assert.equal(name, 'xyz'[k]);
    assert.ok(position[k] * dirs[k] > Math.max(...along(k)) - 1, `${name}'s label is not past its tip`);
    for (const other of [0, 1, 2].filter(o => o !== k)) {
      assert.ok(Math.abs(position[other]) < 1e-9, `${name}'s label is off its axis`);
    }
  }
  // Clear of the box: the anchor is outside its high x corner and its low y and z ones.
  const [ax, ay, az] = axisAnchor({ lo: [0, 0, 0], hi: [3, 3, 3] });
  assert.ok(ax > 3.5 * CUBE && ay < -CUBE / 2 && az < -CUBE / 2, 'the arrows start inside the box');
});

test('from the default angle, the z label sits below the box on screen, not over it', () => {
  // The arrows stand at the box's corner nearest the camera, so z climbs up the
  // box's near edge on screen; it must top out before the box begins.
  const box = { lo: [0, 0, 0], hi: [3, 3, 3] };
  const { up } = screenAxes(CAMERA);
  const height = p => new Vector3(...p).dot(up);
  const anchor = axisAnchor(box);
  const z = labelSpots().find(({ name }) => name === 'z').position.map((v, a) => v + anchor[a]);
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => toWorld([0, 1, 2].map(a =>
    (i >> a) & 1 ? box.hi[a] + 0.5 : box.lo[a] - 0.5)));
  const letter = CUBE / 2;   // room for the glyph above its spot
  assert.ok(height(z) + letter < Math.min(...corners.map(height)), 'the z label overlaps the box');
});

test('the train cell\'s fill is six outward faces, clear of the lattice\'s lines', () => {
  assert.equal(TRAIN_CELL_INSET, GRID_W / 2, 'the fill and the lines overlap, or leave a gap');
  const faces = cellBox(TRAIN_CELL_INSET);
  assert.equal(faces.length, 6);
  const edge = CUBE / 2 - TRAIN_CELL_INSET;
  for (const { vertices } of faces) {
    for (const v of vertices.flat()) assert.ok(Math.abs(Math.abs(v) - edge) < 1e-9, `${v} is not on the box`);
    // Wound outward: the normal points the same way as the face's centre.
    const [p, q, r] = vertices;
    const n = [0, 1, 2].map(k => {
      const [a, b] = [(k + 1) % 3, (k + 2) % 3];
      return (q[a] - p[a]) * (r[b] - p[b]) - (q[b] - p[b]) * (r[a] - p[a]);
    });
    const centre = [0, 1, 2].map(k => vertices.reduce((sum, v) => sum + v[k], 0) / 4);
    assert.ok(n.reduce((dot, x, k) => dot + x * centre[k], 0) > 0, 'a face is wound inward');
  }
});

test('a reset eases the hand-moved view back the short way round, and a gesture takes over from it', () => {
  const clock = fakeClock();
  const { stage } = staged();
  stage.frameTo({ zoom: 2, target: '0,0,0' });
  const shot = stage.applied();
  const home = stage.view();

  // Turned to 300°, which is 15° short of −45° going up, and 345° going down.
  stage.adjust({ ...home, rotX: 20, rotY: 300, zoomBy: 3, offset: [4, -2, 0] });
  stage.reset();
  clock.run(0.25);
  const midway = stage.view();
  assert.equal(stage.touched(), true, 'still on its way back');
  assert.ok(midway.rotY > 300 && midway.rotY < 315, `turned the long way: ${midway.rotY}`);
  assert.ok(midway.zoomBy > 1 && midway.zoomBy < 3);

  clock.run(0.5);
  assert.equal(stage.touched(), false, 'the hand is off once it gets there');
  assert.deepEqual(stage.applied(), shot);
  assert.equal(clock.running(), false, 'a settled camera stops asking for frames');

  // A gesture part-way back is the reader's, and the reset gives way to it.
  stage.adjust({ ...home, rotY: 100 });
  stage.reset();
  clock.run(0.1);
  stage.adjust(orbit(stage.view(), 40, 0));
  const taken = stage.view();
  clock.run(1);
  assert.deepEqual(stage.view(), taken, 'the reset carried on over the gesture');

  stage.reset({ instant: true });
  assert.equal(stage.touched(), false, 'an instant reset is there at once');
});

test('a reset moves while everything else is paused', () => {
  const clock = fakeClock();
  const { stage } = staged();
  stage.frameTo({ zoom: 2, target: '0,0,0' });
  stage.setPaused(true);
  stage.adjust({ ...stage.view(), rotY: 100 });
  stage.reset();
  clock.run(1);
  assert.equal(stage.touched(), false);
});

test('a reserved corner is taken at once the first time, then eased away from and back, paused or not', () => {
  const clock = fakeClock();
  const { stage } = staged();
  stage.frameTo({ zoom: 2, target: '0,0,0' });
  const whole = stage.zoom();
  const box = { edge: 'top-left', width: 300, height: 200 };

  // The first box arrives once measured, after the first paint: no slide in.
  stage.reserve([box]);
  const clear = stage.zoom();
  assert.ok(clear < whole, 'framed smaller, clear of the box');
  clock.run(0.1);
  assert.equal(stage.zoom(), clear, 'the first box is not eased');

  stage.setPaused(true);
  stage.reserve([]);
  clock.run(0.19);
  const midway = stage.zoom();
  assert.ok(midway > clear && midway < whole, `not eased: ${midway}`);
  clock.run(0.5);
  assert.equal(stage.zoom(), whole, 'framed in the whole viewer once there');
  assert.equal(clock.running(), false, 'a settled camera stops asking for frames');

  stage.reserve([box]);
  clock.run(0.5);
  assert.equal(stage.zoom(), clear, 'back clear of the box');

  stage.reserve([], { instant: true });
  assert.equal(stage.zoom(), whole, 'an instant reserve is there at once');
});
