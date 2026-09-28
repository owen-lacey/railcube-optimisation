// The animations, driven against a fake PolyCSS scene and a hand-cranked clock.
//
// This is the promotion of a throwaway script. The build animation was verified
// last session by a Node file that did exactly what is below — a scene that only
// records what it is asked to draw, and a `requestAnimationFrame` stepped by hand
// — and it earned its keep immediately: two of its assertions failed when first
// written, and *both times the assertion was wrong rather than the code*. It was
// then deleted, so this session started by rewriting it.
//
// A sequenced tumble-then-build has strictly more ordering to get wrong than a
// build alone, and it has a property no eye can check reliably: that the cube
// arriving here is the *same object* as the one that was over there. So the script
// lives in the suite now.
//
// Nothing here needs a DOM. `cannon-es` and `@layoutit/polycss` are both runtime
// dependencies, so this belongs in the fast tier.

import test from 'node:test';
import assert from 'node:assert/strict';

import { chainTrack } from '../src/track.js';
import { routeOf, identify, LAYOUTS } from '../src/layouts.js';
import { createStage, together, GRID_CLASS } from '../site/src/lib/render/stage.js';
import { tumblePhase } from '../site/src/lib/render/tumble.js';
import { buildPhase, growPhase, trackPhase, PACE, FLIGHT } from '../site/src/lib/render/build.js';
import { paint, boundsOf, extentOf, fixedFrame, openScene, cubeIds, REACH } from '../site/src/lib/scenes.js';
import { ALARM, ALARM_FLASH, ALARM_PERIOD, GRID_W } from '../site/src/lib/render/dimensions.js';
import { gridLines } from '../site/src/lib/render/grid.js';
import { toWorld, poseRotation, through } from '../site/src/lib/render/vec.js';
import { CENTROID } from '../site/src/lib/shapes.js';
import { CUBE } from '../site/src/lib/render/dimensions.js';

// ---- The fake scene --------------------------------------------------------

/**
 * A stand-in for a PolyCSS scene that draws nothing and remembers everything.
 *
 * `movingMesh` only ever calls `scene.add`, then `setPolygons`, `setTransform` and
 * `dispose` on what comes back, so this is the whole of the surface the renderer
 * touches. Recording the calls is what lets the ordering assertions below be about
 * what was actually drawn rather than about internal state.
 */
function fakeScene(now = () => 0) {
  const handles = [];
  const scene = {
    add(mesh) {
      const handle = {
        mesh,
        bakes: 0,
        bakeAt: [],
        transforms: [],
        disposed: false,
        classes: new Set(),
        element: { classList: { add: name => handle.classes.add(name) } },
        setPolygons() { handle.bakes += 1; handle.bakeAt.push(now()); },
        setTransform(t) { handle.transforms.push(t); },
        dispose() { handle.disposed = true; },
      };
      handles.push(handle);
      return handle;
    },
  };
  return { handles, cameraEl: fakeCamera(), sceneEl: { getScene: () => scene } };
}

/** `createCamera` reads two sizes off the element and writes attributes to it. */
const fakeCamera = () => ({
  clientWidth: 900,
  clientHeight: 700,
  attributes: {},
  setAttribute(name, value) { this.attributes[name] = value; },
});

/**
 * A clock that only moves when told to. `loop.js` caps a single delta at 0.1 s, so
 * the step has to be under that or the loop silently runs slower than the caller
 * thinks — which is the same trap that makes headless screenshotting useless here.
 */
function fakeClock() {
  let now = 0;
  let pending = null;
  globalThis.requestAnimationFrame = cb => { pending = cb; return 1; };
  globalThis.cancelAnimationFrame = () => { pending = null; };
  return {
    /** Run `seconds` of animation in 16 ms frames, calling `onFrame` after each. */
    run(seconds, onFrame = () => {}) {
      for (let i = 0; i < Math.round(seconds / 0.016); i++) {
        if (!pending) return;               // the loop stopped of its own accord
        const cb = pending;
        pending = null;
        now += 16;
        cb(now);
        onFrame(now / 1000);
      }
    },
    at: () => now / 1000,
    running: () => pending !== null,
  };
}

const piecesOf = shape => paint(chainTrack(routeOf(shape)));

/** Where a piece's mesh belongs when it has landed: its cell, in world units. */
const restingPlace = piece => toWorld(piece.cell);

const SET = 'LIRIROSOLORLLSORII';
const OTHER = 'LRRIIOOSRLLOOLSRII';   // the same 18 cubes, arranged differently
const RING = 'LLLL';

// ---- A finished track -----------------------------------------------------

test('a track phase draws every cube at once, in its place', () => {
  const { handles, cameraEl, sceneEl } = fakeScene();
  const stage = createStage(cameraEl, sceneEl);
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
  }
});

test('a crossed cross is one cube drawn once', () => {
  const { handles, cameraEl, sceneEl } = fakeScene();
  const stage = createStage(cameraEl, sceneEl);
  const pieces = piecesOf('XSLLLSXSRRRS');   // the figure of eight

  stage.run([trackPhase(stage, pieces, { drive: false })]);

  assert.equal(pieces.length, 12, 'twelve steps');
  assert.equal(handles.length, 11, 'eleven cubes');
  assert.equal(stage.cubes.size, 11);
});

// ---- A cold build ---------------------------------------------------------

test('a build mints one piece per beat and lands each one exactly', () => {
  const { handles, cameraEl, sceneEl } = fakeScene();
  const stage = createStage(cameraEl, sceneEl);
  const clock = fakeClock();
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
    // A landed piece has nothing on its container, and `polyRotation` of the
    // identity emits no transform at all — so the last thing written to it is a
    // rotation that PolyCSS will throw away.
    const last = cube.mesh.handle.transforms.at(-1);
    assert.ok(Math.max(...last.rotation.map(Math.abs)) < 1e-9, `${id} landed turned`);
    // A minted piece has its polygons written once, by `scene.add`, in the pose it
    // will land in — so `setPolygons` is never called on it at all. Any bake here
    // would be a piece being re-lit mid-flight, which is the per-frame
    // `setPolygons` that collapsed the frame rate the first time round.
    assert.equal(cube.mesh.handle.bakes, 0, `${id} was re-baked in flight`);
  }
});

test('a minted arrival is a straight line down the connector axis', () => {
  const { cameraEl, sceneEl } = fakeScene();
  const stage = createStage(cameraEl, sceneEl);
  const clock = fakeClock();
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
    for (const { position } of cube.mesh.handle.transforms) {
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
  const { handles, cameraEl, sceneEl } = fakeScene(clock.at);
  const stage = createStage(cameraEl, sceneEl);
  const from = piecesOf(shapeFrom);
  const to = piecesOf(shapeTo);

  stage.run([trackPhase(stage, from, { drive: false })]);
  const before = new Map([...stage.cubes].map(([id, cube]) => [id, cube.mesh.handle]));

  const collapse = tumblePhase(stage, from, {
    drop: 1, limit, keep: new Set(identify(to)),
  });
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
  // the new layout is the very object that was `2L` in the old one.
  // Not one new mesh and not one disposed: eighteen cubes in, eighteen cubes out.
  // Nothing is drawn for the floor, so this is the whole scene.
  assert.equal(handles.length, 18, 'a mesh was created or destroyed');
  assert.equal(stage.cubes.size, 18);
  for (const [id, mesh] of before) {
    assert.equal(stage.cubes.get(id).mesh.handle, mesh, `${id} is not the same cube`);
    assert.equal(mesh.disposed, false, `${id} was disposed`);
  }

  // And it ends as a legal track, in the right places.
  for (const [i, id] of ids.entries()) {
    const cube = stage.cubes.get(id);
    assert.deepEqual(cube.position, restingPlace(cubes[i]), `${id} landed off its cell`);
    assert.deepEqual(cube.basis, poseRotation(cubes[i].pose), `${id} landed mispose`);
    assert.ok(Math.max(...cube.mesh.handle.transforms.at(-1).rotation.map(Math.abs)) < 1e-9,
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

test('a picked-up cube is baked when it is picked up, and never again', () => {
  const { clock, to, before, taken } = sequence(SET, OTHER);
  const claimed = new Set(identify(to));
  clock.run(10);

  const when = new Map(taken.map(t => [t.id, t.at]));
  for (const [id, mesh] of before) {
    if (!claimed.has(id)) continue;
    // The re-bake at pick-up puts the final pose in the vertices, so the piece is
    // lit correctly the moment it lands. Anything after it would be a piece re-lit
    // mid-flight — the per-frame `setPolygons` that collapsed the frame rate the
    // first time round.
    const after = mesh.bakeAt.filter(t => t > when.get(id) + 0.02);
    assert.equal(after.length, 0, `${id} was re-baked ${after.length} times in flight`);
    assert.ok(mesh.bakeAt.some(t => Math.abs(t - when.get(id)) < 0.02),
      `${id} was not baked at its pick-up`);
  }
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
    assert.equal(stage.cubes.get(id).mesh.handle.disposed, false, `${id} was disposed`);
  }
});

test('a slot with no cube on the floor is minted from off-frame', () => {
  const { stage, clock, to, before } = sequence(SET, 'SSRRIIRRLLIISSSLLS');
  const ids = identify(to);
  const minted = ids.filter(id => !before.has(id));

  clock.run(8);
  assert.ok(minted.length > 0, 'this layout was supposed to need new cubes');
  for (const id of minted) {
    assert.ok(stage.cubes.has(id), `${id} was never made`);
    // A mint's polygons go in through `scene.add`, already in the pose it will
    // land in, so it is never baked at all — same as on a cold build.
    assert.equal(stage.cubes.get(id).mesh.handle.bakes, 0, `${id} was re-baked`);
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
    const { cameraEl, sceneEl } = fakeScene();
    const stage = createStage(cameraEl, sceneEl);
    const clock = fakeClock();
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
  const { handles, cameraEl, sceneEl } = fakeScene();
  const stage = createStage(cameraEl, sceneEl);
  const clock = fakeClock();
  const from = piecesOf(SET);
  const to = piecesOf(OTHER);
  const alive = () => handles.filter(h => !h.disposed).length;

  stage.run([trackPhase(stage, from, { drive: true })]);
  assert.equal(alive(), 19, '18 cubes and a train');

  stage.run([
    tumblePhase(stage, from, { drop: 1, limit: 1.2, keep: new Set(identify(to)) }),
    buildPhase(stage, to, { pace: PACE, drive: true }),
  ]);
  assert.equal(alive(), 18, 'just the cubes: the first train has gone');

  stage.start();
  clock.run(10);
  // The build's own train has set off by now — one train, not two, and not three.
  assert.equal(alive(), 19, '18 cubes and exactly one train');
  assert.equal(handles.length, 20, 'two trains were ever made, and one was thrown away');
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

    const flight = stage.cubes.get(id).mesh.handle.transforms;
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
// exactly what the fake scene can settle.

/** Type a shape onto a stage, one growth at a time, and run each out. */
function typing(shapes, { pace = 0.1 } = {}) {
  const { handles, cameraEl, sceneEl } = fakeScene();
  const stage = createStage(cameraEl, sceneEl);
  const clock = fakeClock();
  let shown = [];

  const type = shape => {
    const view = openScene(shape);
    // What the viewer does before running the phase: every cube past the point the
    // two layouts stop agreeing comes off.
    let prefix = 0;
    const key = p => `${p.type}${p.pose}${p.cell}`;
    while (prefix < shown.length && prefix < view.pieces.length
      && key(shown[prefix]) === key(view.pieces[prefix])) prefix += 1;
    for (const id of cubeIds(shown).slice(prefix)) if (id) stage.drop(id);

    stage.run([growPhase(stage, view.pieces, {
      pace, drive: view.closed, alarm: view.offender?.id ?? null,
    })]);
    stage.start();
    shown = view.pieces;
    return view;
  };

  return { handles, stage, clock, type, alive: () => handles.filter(h => !h.disposed).length };
}

test('growing a track does not touch a single piece already standing', () => {
  const { handles, clock, type } = typing(['LIRIROSOL']);

  type('LIRIROSOL');
  clock.run(4);
  assert.equal(handles.length, 9, 'nine cubes went down');

  // Exactly what has been written to each of them, before the next letter.
  const writes = handles.map(h => h.transforms.length);
  const bakes = handles.map(h => h.bakes);

  type('LIRIROSOLO');
  clock.run(4);
  assert.equal(handles.length, 10, 'the tenth cube arrived');

  for (const [i, handle] of handles.slice(0, 9).entries()) {
    assert.equal(handle.transforms.length, writes[i], `cube ${i} was moved by the next letter`);
    assert.equal(handle.bakes, bakes[i], `cube ${i} was re-lit by the next letter`);
    assert.equal(handle.disposed, false, `cube ${i} was thrown away and remade`);
  }
});

test('a new piece is minted in flight and never baked', () => {
  const { handles, stage, clock, type } = typing([]);

  type('LI');
  clock.run(4);
  const arrival = handles.at(-1);
  // A mint's polygons go in through `scene.add`, in the pose it will land in, so
  // `setPolygons` is never called on it at all. This is the assertion that was
  // wrong the first three times it was written.
  assert.equal(arrival.bakes, 0, 'a mint was baked');
  assert.ok(arrival.transforms.length > 1, 'a mint did not fly');
  assert.deepEqual(stage.cubes.get('1I').position, restingPlace(openScene('LI').pieces[1]));
});

test('backspace takes one cube off and leaves the rest standing', () => {
  const { handles, stage, clock, type, alive } = typing([]);

  type('LIRI');
  clock.run(4);
  assert.equal(alive(), 4);
  const kept = ['1L', '1I', '1R'].map(id => stage.cubes.get(id).mesh.handle);

  type('LIR');
  clock.run(4);

  assert.equal(alive(), 3, 'exactly one cube came off');
  assert.equal(stage.cubes.has('2I'), false, 'the deleted piece is off the stage');
  for (const [i, handle] of kept.entries()) {
    assert.equal(handle.disposed, false, `cube ${i} was disposed by a backspace`);
    assert.ok(handles.includes(handle), `cube ${i} is not the same mesh it was`);
  }
});

test('there is no train until the loop closes, and then there is one', () => {
  const { clock, type, alive } = typing([]);

  type('LLL');
  clock.run(4);
  assert.equal(alive(), 3, 'three cubes and no train: an open track is not a loop');

  const closed = type('LLLL');
  assert.equal(closed.closed, true);
  clock.run(4);
  assert.equal(alive(), 5, 'four cubes and exactly one train');
});

test('a piece with nowhere to go is drawn there, and pulses', () => {
  const { stage, clock, type } = typing([]);

  // Four left curves close a ring, so a fifth is asked to go where the first is.
  const view = type('LLLLL');
  assert.equal(view.offender.id, '5L', 'the fifth left curve is the one at fault');
  assert.equal(view.pieces.length, 5, 'it is drawn, not dropped');
  assert.equal(view.closed, false);

  clock.run(1);
  const offender = stage.cubes.get('5L').mesh.handle;
  const others = ['1L', '2L', '3L', '4L'].map(id => stage.cubes.get(id).mesh.handle);

  // It lands in ALARM — `openScene` paints it — so the first repaint due is the
  // pale one, half a period after it lands, and they alternate from there.
  const before = offender.bakes;
  clock.run(ALARM_PERIOD * 2);
  const flashes = offender.bakes - before;
  assert.ok(flashes >= 3 && flashes <= 5, `${flashes} repaints over two periods`);

  // One mesh, about twice a second. Nothing else is repainted at all — a track
  // being re-lit every frame is the thing this whole file exists to catch.
  for (const [i, handle] of others.entries()) {
    assert.equal(handle.bakes, 0, `cube ${i} was repainted by the alarm`);
  }

  // And it really is drawn on top of the first curve rather than off to one side.
  assert.deepEqual(stage.cubes.get('5L').position, stage.cubes.get('1L').position);
});

test('a stuck track keeps asking for frames, and an unstuck one stops', () => {
  const { clock, type } = typing([]);

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

test('the frame only ever grows, and eases rather than snapping', () => {
  const { cameraEl, sceneEl } = fakeScene();
  const stage = createStage(cameraEl, sceneEl);
  const clock = fakeClock();

  // The first shot is not a move: there is nothing to pan from.
  stage.panTo({ zoom: 4, target: '0,0,0' });
  assert.equal(Number(cameraEl.attributes.zoom).toFixed(3), (4 * 0.88).toFixed(3));

  stage.run([{ advance: () => undefined }]);
  stage.start();
  stage.panTo({ zoom: 2, target: '20,0,0' }, 0.4);

  const zooms = [];
  clock.run(0.6, () => zooms.push(Number(cameraEl.attributes.zoom)));

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
  const { cameraEl, sceneEl } = fakeScene();
  const stage = createStage(cameraEl, sceneEl);
  const clock = fakeClock();

  stage.frameTo({ zoom: 4, target: '0,0,0' });
  stage.run([{ advance: () => false }]);        // finished on its first frame
  stage.panTo({ zoom: 2, target: '0,0,0' }, 0.4);
  stage.start();
  clock.run(1);

  assert.equal(Number(cameraEl.attributes.zoom).toFixed(3), (2 * 0.88).toFixed(3));
  assert.equal(clock.running(), false, 'the loop ran on after the pan finished');
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

test('the lattice is one prism per line, and stays on the cell boundaries', () => {
  const box = { lo: [-3, 0, -2], hi: [0, 1, 1] };   // 4 × 2 × 4 cells
  const polygons = gridLines(box);
  const [nx, ny, nz] = [4, 2, 4];
  const lines = (ny + 1) * (nz + 1) + (nx + 1) * (nz + 1) + (nx + 1) * (ny + 1);
  assert.equal(polygons.length, 4 * lines);

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
  const { handles, cameraEl, sceneEl } = fakeScene();
  const stage = createStage(cameraEl, sceneEl);
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
  // Tagged for the stylesheet to repaint as an overlay, and nothing else is.
  assert.deepEqual(handles.filter(h => h.classes.has(GRID_CLASS)), [first, second]);
});
