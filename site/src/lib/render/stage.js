// What the animations share: a scene, a camera, one clock, and — the point of
// this file — one set of cubes that outlives any single animation.
//
// The three viewers each used to own all of that. That was fine while a viewer
// showed one thing: `viewer.js` drew a finished track, `tumble.js` collapsed one,
// `build.js` assembled one, and each built its own camera, its own loop and its
// own meshes and disposed them at the end.
//
// It stopped being fine when `Layout` had to tumble the layout that is there and
// then build the new one, because the cubes have to *survive the handover*. The
// first left curve of the new shape is not a new mesh that happens to look like
// the old one — it is the same cube, picked up off the floor and carried to its
// new slot. That is the whole point of the sequence: it shows a set of pieces
// being rearranged, not one track deleted and another drawn. Object constancy
// cannot live inside either animation, so it lives here.
//
// The camera pushed the same way, from the other end: `createCamera` keeps its
// own `described` state and writes attributes on every resize, so two of them on
// one element clobber each other. One element, one camera binding.
//
// So an animation is no longer a viewer. It is a **phase**: something with an
// `advance(delta, elapsed)` that moves cubes it was handed, and returns `false`
// when it has nothing left to do, plus an optional `dispose` for anything it owns
// that the cubes do not. The train is the whole of that last part, and it is not a
// detail: a phase that puts a train on the track and is then replaced would
// otherwise leave it hanging in mid-air over the wreckage for ever.
//
// The camera is deliberately *not* something a phase touches. It is set once and
// held for the life of the viewer — see `fixedFrame` in `scenes.js` for why that is
// a fixed box rather than anything derived from what is being shown.

import { GEOMETRY } from './pieces.js';
import { movingMesh } from './meshes.js';
import { createLoop } from './loop.js';
import { createCamera } from './camera.js';

/**
 * Two or more phases as one, advancing together off the same clock and finishing
 * when the last of them does.
 *
 * The queue is otherwise strictly sequential, which was right until the collapse
 * and the build had to *overlap*. They have to because the alternative is worse
 * than the dwell it removes: a collapse handed over early leaves every piece the
 * build has not reached yet frozen in mid-air, since the physics stops with the
 * phase. Run together, the build plucks pieces out of a pile that is still falling
 * and the rest carry on — which is both what a hand does and the thing that lets
 * the build start while there is still something to watch.
 */
export function together(...phases) {
  const live = phases.filter(Boolean);
  return {
    advance(delta, elapsed) {
      for (const phase of live) {
        if (phase.done) continue;
        if (phase.advance(delta, elapsed) === false) phase.done = true;
      }
      return live.every(phase => phase.done) ? false : undefined;
    },
    dispose() { for (const phase of live) phase.dispose?.(); },
  };
}

/**
 * Bind a stage to a mounted `<poly-camera>` containing a `<poly-scene>`.
 * The caller is responsible for having awaited `customElements.whenDefined`.
 */
export function createStage(cameraEl, sceneEl) {
  const scene = sceneEl.getScene();
  const { frameTo, applyCamera } = createCamera(cameraEl);

  // The cubes, by piece ID (`1L` is the first left curve — see `identify` in
  // src/layouts.js). This is the registry object constancy is made of: a phase
  // asks for the cube with an ID and either gets the one that is already there,
  // wherever it has ended up, or mints it.
  const cubes = new Map();

  let queue = [];        // phases still to run, head first
  let phaseAt = 0;       // loop time the head phase started, so its clock is its own

  /**
   * The cube with this ID, mounted if it is not on the stage yet.
   *
   * A cube records the orientation and position last written to it, which is
   * what a pick-up needs: the builder has to start a piece's flight from
   * wherever the collapse left it, and only the thing that wrote it knows that.
   */
  function cube(id, { type, color, basis, position }) {
    const existing = cubes.get(id);
    if (existing) return existing;

    const mesh = movingMesh(scene, GEOMETRY[type](color), basis, position);
    // Geometry is authored about the piece's own cell, always — every mesh in the
    // project agrees on that, and PolyCSS rotates about the geometry origin, so
    // anything wanting to turn a piece about its centre of mass converts with
    // `originAt` from shapes.js rather than re-authoring the polygons.
    const made = {
      id,
      type,
      basis,
      position,
      bake(next, at) { mesh.bake(next, at); made.basis = next; made.position = at; },
      place(next, at) { mesh.place(next, at); made.basis = next; made.position = at; },
      dispose() { mesh.dispose(); cubes.delete(id); },
      mesh,
    };
    cubes.set(id, made);
    return made;
  }

  /** Is this cube already on the stage — i.e. is it there to be picked up? */
  const held = id => cubes.has(id);

  /**
   * Advance the head phase, and move on when it says it is finished.
   *
   * Each phase gets a clock of its own, because each indexes off its own start:
   * the tumble compares against its settle limit, the build against a piece's
   * beat. A finished phase hands over on the *next* frame rather than this one,
   * so the phase taking over gets a clean zero and no delta belonging to its
   * predecessor.
   */
  const loop = createLoop((delta, elapsed) => {
    if (!queue.length) return false;
    if (queue[0].advance(delta, elapsed - phaseAt) === false) {
      queue.shift().dispose?.();
      phaseAt = elapsed;
      if (!queue.length) return false;
    }
  });

  /**
   * Run these phases, one after another. Anything still queued is dropped and
   * disposed — so starting a new sequence takes the previous one's train off the
   * track rather than abandoning it there.
   */
  function run(phases) {
    for (const phase of queue) phase.dispose?.();
    queue = phases.filter(Boolean);
    phaseAt = loop.at();
  }

  /**
   * Back to an empty stage: the cubes, the queue and the clock all gone. The camera
   * description survives, because the element it was written to does.
   *
   * A sequenced viewer must *not* call this between phases — the surviving cubes
   * are the whole point. It is for a viewer that draws one thing and then a
   * different thing, and for unmounting.
   */
  function clear() {
    loop.reset();
    for (const phase of queue) phase.dispose?.();
    queue = [];
    phaseAt = 0;
    for (const item of [...cubes.values()]) item.dispose();
    cubes.clear();
  }

  return {
    scene,
    cubes,
    cube,
    held,
    frameTo,
    applyCamera,
    run,
    start: loop.start,
    stop: loop.stop,
    clear,
  };
}
