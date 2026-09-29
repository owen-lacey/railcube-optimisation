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
import { movingMesh, meshLike } from './meshes.js';
import { createLoop } from './loop.js';
import { createCamera } from './camera.js';
import { cellBox } from './grid.js';
import { originCell, axisArrows, axisAnchor, LABEL_SPOTS } from './axes.js';
import { TRAIN_CELL_INSET, CUBE } from './dimensions.js';
import { toWorld } from './vec.js';
import { trainAt } from './rail.js';
import { trainBody } from './train.js';

/** The class the lattice's mesh carries, for the stylesheet to find it by. */
export const GRID_CLASS = 'cell-grid';

/** The class the origin's axes carry, for the same reason. */
export const ORIGIN_CLASS = 'origin-axes';

/** The class of the invisible specks the axis labels are placed by. */
export const MARKER_CLASS = 'origin-marker';

// A speck is a cell's box inset almost to nothing: a fifth of a scene unit a side.
const MARKER_INSET = CUBE * 0.49;

/** The class the train's cell carries, for the same reason. */
export const TRAIN_CELL_CLASS = 'train-cell';

/** The class a ghost train carries; its tint is `ghost-<tint>` beside it. */
export const GHOST_CLASS = 'ghost';

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
export function createStage(cameraEl, sceneEl, { onTrainCell, onCamera } = {}) {
  const scene = sceneEl.getScene();
  const { frameTo: applyDescription, applyCamera, view, adjust } = createCamera(cameraEl, () => onCamera?.());

  // The cubes, by piece ID (`1L` is the first left curve — see `identify` in
  // src/layouts.js). This is the registry object constancy is made of: a phase
  // asks for the cube with an ID and either gets the one that is already there,
  // wherever it has ended up, or mints it.
  const cubes = new Map();

  let queue = [];        // phases still to run, head first
  let phaseAt = 0;       // loop time the head phase started, so its clock is its own
  let framed = null;     // the camera description in force, or being panned away from
  let pan = null;        // { to, seconds, spent }, null when the camera is still
  let paused = false;
  let lost = 0;          // loop time spent on paused frames, which is not time that passed

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
      color,
      basis,
      position,
      bake(next, at) { mesh.bake(next, at); made.basis = next; made.position = at; },
      place(next, at) { mesh.place(next, at); made.basis = next; made.position = at; },
      // Repaint where it stands. Costs a bake, so it is for a piece being pointed
      // at rather than for a track being themed.
      recolour(next) {
        mesh.recolour(GEOMETRY[type](next), made.basis, made.position);
        made.color = next;
      },
      // A detached cube's ID may already belong to a newer one, which this must not
      // take off the stage with it.
      dispose() { mesh.dispose(); if (cubes.get(id) === made) cubes.delete(id); },
      mesh,
    };
    cubes.set(id, made);
    return made;
  }

  /** Is this cube already on the stage — i.e. is it there to be picked up? */
  const held = id => cubes.has(id);

  /** Take one cube off the stage, leaving every other one where it is. */
  function drop(id) {
    cubes.get(id)?.dispose();
  }

  /**
   * Take a cube out of the registry but leave it drawn, and hand it over.
   *
   * For a piece that is *leaving*: it still has somewhere to go before it is gone,
   * so it cannot be disposed yet, but its ID has to be free at once. Otherwise a
   * piece removed and put straight back would find the departing cube still
   * holding its ID, take it for one already standing, and leave it stranded
   * wherever the departure had got to. Whoever detaches a cube disposes it.
   */
  function detach(id) {
    const item = cubes.get(id);
    cubes.delete(id);
    return item ?? null;
  }

  // ---- The camera ---------------------------------------------------------
  //
  // A phase never touches this — see the header. The stage owns it because the one
  // viewer whose camera moves (`Sketch`, where the track grows as it is typed) needs
  // the movement to overlap whatever is being animated rather than to be queued
  // behind it, and because a pan has to outlive the phase that asked for one.

  const PAN = 0.35;      // seconds; long enough to read as a move, short enough not to wait
  const smooth = t => t * t * (3 - 2 * t);
  const numbers = target => String(target).split(',').map(Number);

  /** A camera description part-way between two, at `t` in 0..1. */
  const between = (from, to, t) => ({
    ...to,
    zoom: Number(from.zoom) + (Number(to.zoom) - Number(from.zoom)) * t,
    target: numbers(from.target)
      .map((v, k) => v + (numbers(to.target)[k] - v) * t)
      .join(','),
  });

  /** Apply a camera description at once, cancelling any pan under way. */
  function frameTo(camera) {
    pan = null;
    framed = camera ?? {};
    applyDescription(framed);
  }

  /**
   * Ease to a new camera description over `seconds`.
   *
   * Panning from nothing is just framing: a viewer's first shot is not a move.
   */
  function panTo(camera, seconds = PAN) {
    if (!framed || framed.zoom === undefined) return frameTo(camera);
    pan = { from: framed, to: camera ?? {}, seconds, spent: 0 };
  }

  /** Advance a pan, and say whether one is still running. */
  function stepPan(delta) {
    if (!pan) return false;
    pan.spent += delta;
    const t = Math.min(1, pan.spent / pan.seconds);
    framed = t === 1 ? pan.to : between(pan.from, pan.to, smooth(t));
    applyDescription(framed);
    if (t === 1) pan = null;
    return true;
  }

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
    // Paused, a frame is a still: the head phase is drawn where it has got to and
    // the loop stops. That one frame is what puts a train on a track shown while
    // paused, which would otherwise sit unturned at the origin until play. Its delta
    // is not time that passed, so it goes into `lost` and nothing moves on by it.
    if (paused) {
      lost += delta;
      queue[0]?.advance(0, elapsed - lost - phaseAt);
      return false;
    }
    const now = elapsed - lost;
    // The camera is stepped first and independently: a pan outlives the phase that
    // asked for it, so the loop must not stop while one is still running.
    const panning = stepPan(delta);
    if (!queue.length) return panning ? undefined : false;
    if (queue[0].advance(delta, now - phaseAt) === false) {
      queue.shift().dispose?.();
      phaseAt = now;
      if (!queue.length) return panning ? undefined : false;
    }
  });

  /** The stage's own time: the loop's, less what was spent on paused frames. */
  const clock = () => loop.at() - lost;

  /**
   * Hold everything where it is, or let it go again. It does not start or stop the
   * loop: a `start()` while paused draws one still frame, and one after unpausing
   * carries on from exactly where the pause caught it.
   */
  function setPaused(next) {
    paused = Boolean(next);
  }

  /**
   * Run these phases, one after another. Anything still queued is dropped and
   * disposed — so starting a new sequence takes the previous one's train off the
   * track rather than abandoning it there.
   */
  function run(phases) {
    for (const phase of queue) phase.dispose?.();
    queue = phases.filter(Boolean);
    phaseAt = clock();
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
    lost = 0;
    for (const phase of queue) phase.dispose?.();
    queue = [];
    phaseAt = 0;
    pan = null;
    for (const item of [...cubes.values()]) item.dispose();
    cubes.clear();
  }

  // ---- The cell lattice ---------------------------------------------------
  //
  // Not a cube and not in the registry, so `clear()` between two shapes leaves it
  // standing; whoever set it takes it down with `setGrid(null)`. One mesh, mounted
  // once per box and never written to after.
  //
  // It is an overlay, not an object, and PolyCSS has no unlit material to say so:
  // every face is shaded from its normal and painted opaque. So the mesh is tagged
  // `GRID_CLASS` and the viewer's stylesheet repaints its faces flat and translucent.

  let grid = null;

  /** Replace the lattice with these polygons, or take it away with `null`. */
  function setGrid(polygons) {
    grid?.dispose();
    grid = polygons ? scene.add(meshLike(polygons), {}) : null;
    grid?.element.classList.add(GRID_CLASS);
    showTrainCell();
  }

  // ---- The origin's axes --------------------------------------------------
  //
  // An overlay like the lattice, and for the same reasons: not a cube, so `clear()`
  // leaves it standing, and painted by the stylesheet through `ORIGIN_CLASS`.

  let origin = [];    // the origin cell's outline, then the arrows
  let markers = [];   // one invisible speck per axis label, which the label finds by

  /** Outline the origin cell and stand the arrows at `box`'s corner, or take them away with null. */
  function setOrigin(box) {
    for (const handle of origin) handle.dispose();
    for (const { handle } of markers) handle.dispose();
    origin = [];
    markers = [];
    if (!box) return;
    const anchor = axisAnchor(box);
    const arrows = scene.add(meshLike(axisArrows()), {});
    arrows.setTransform({ position: anchor, rotation: [0, 0, 0] });
    origin = [scene.add(meshLike(originCell()), {}), arrows];
    for (const handle of origin) handle.element.classList.add(ORIGIN_CLASS);
    markers = LABEL_SPOTS.map(({ name, position }) => {
      const handle = scene.add(meshLike(cellBox(MARKER_INSET)), {});
      handle.setTransform({ position: position.map((c, k) => c + anchor[k]), rotation: [0, 0, 0] });
      handle.element.classList.add(MARKER_CLASS);
      return { name, handle };
    });
  }

  /**
   * Where each axis label belongs on screen, `{ name, x, y }` in client pixels.
   *
   * HTML text cannot be placed in the 3D scene, and a projection worked out here
   * would be a second copy of PolyCSS's camera. So each label has an invisible
   * speck at its spot and the browser is asked where the speck landed. Reading it
   * forces a layout, so it is for after the camera has moved, not for every frame.
   */
  function originTips() {
    return markers.map(({ name, handle }) => {
      const { left, top, width, height } = handle.element.firstElementChild.getBoundingClientRect();
      return { name, x: left + width / 2, y: top + height / 2 };
    });
  }

  // ---- The lattice cell the train is in -----------------------------------
  //
  // Part of the lattice, so it is only drawn while there is one. The driver reports
  // the cell whatever the viewer shows; the stage decides whether there is anything
  // to draw it on. One mesh — a see-through box filling one cell, authored about
  // the origin — mounted once and moved with `setTransform`, so following the train
  // costs a transform per cell entered and never a `setPolygons`.

  let trainCell = null;   // the cell last reported, or null when there is no train
  let trainMark = null;

  function showTrainCell() {
    if (!grid || !trainCell) {
      trainMark?.dispose();
      trainMark = null;
      return;
    }
    if (!trainMark) {
      trainMark = scene.add(meshLike(cellBox(TRAIN_CELL_INSET)), {});
      trainMark.element.classList.add(TRAIN_CELL_CLASS);
    }
    trainMark.setTransform({ position: toWorld(trainCell), rotation: [0, 0, 0] });
  }

  /** The cell the train is in, or `null` when it has gone. */
  function markTrainCell(cell) {
    if (String(cell) === String(trainCell)) return;
    trainCell = cell;
    showTrainCell();
    onTrainCell?.(cell);
  }

  // ---- Ghost trains -------------------------------------------------------
  //
  // Trains that stand still, to show where a train *would* be: before a piece and
  // after it. Not cubes and not a phase's: a phase that finishes is disposed on the
  // next frame, and one that never finishes keeps the loop running for a picture
  // that does not move. So they are an overlay like the lattice — `clear()` leaves
  // them, and whoever set them takes them down with `setGhosts([])`. Each is tagged
  // `GHOST_CLASS` and `ghost-<tint>` for the viewer's stylesheet to paint; one with
  // no tint is left in the train's own colours, solid.

  let ghosts = [];

  /**
   * Replace the ghost trains with these, `{ type, cell, pose, tint? }` each: a train
   * standing on a piece of that type placed there — see `trainAt`. The piece need
   * not be drawn.
   */
  function setGhosts(list) {
    for (const ghost of ghosts) ghost.dispose();
    ghosts = list.map(({ type, cell, pose, tint }) => {
      const { basis, position } = trainAt(type, cell, pose);
      const mesh = movingMesh(scene, trainBody(), basis, position);
      mesh.handle.element.classList.add(GHOST_CLASS);
      if (tint) mesh.handle.element.classList.add(`${GHOST_CLASS}-${tint}`);
      return mesh;
    });
  }

  // ---- Filled cells ---------------------------------------------------------
  //
  // Cells picked out whether or not a train is driving, in the train cell's own
  // paint — for a picture of one cell rather than a track going through it. An
  // overlay like the ghosts: `clear()` leaves them, and `setFill([])` takes them down.

  let fills = [];

  /** Fill these cells, `[x, y, z]` each, replacing any filled before. */
  function setFill(cells) {
    for (const handle of fills) handle.dispose();
    fills = cells.map(cell => {
      const handle = scene.add(meshLike(cellBox(TRAIN_CELL_INSET)), {});
      handle.setTransform({ position: toWorld(cell), rotation: [0, 0, 0] });
      handle.element.classList.add(TRAIN_CELL_CLASS);
      return handle;
    });
  }

  return {
    scene,
    cubes,
    cube,
    held,
    drop,
    detach,
    frameTo,
    panTo,
    applyCamera,
    view,
    adjust,
    run,
    start: loop.start,
    stop: loop.stop,
    setPaused,
    clear,
    setGrid,
    setOrigin,
    originTips,
    setGhosts,
    setFill,
    markTrainCell,
  };
}
