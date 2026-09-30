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
// So an animation is not a viewer. It is a **phase**: something with an
// `advance(delta, elapsed)` that moves cubes it was handed, and returns `false`
// when it has nothing left to do, plus an optional `dispose` for anything it owns
// that the cubes do not. The train is the whole of that last part, and it is not a
// detail: a phase that puts a train on the track and is then replaced would
// otherwise leave it hanging in mid-air over the wreckage for ever.
//
// The camera is deliberately *not* something a phase touches. It is set once and
// held for the life of the viewer — see `fixedFrame` in `scenes.js` for why that is
// a fixed box rather than anything derived from what is being shown.
//
// **Drawing is on demand.** Everything that changes the picture — a cube placed, an
// overlay set, the camera moved — calls `invalidate`. While the loop is running its
// tick draws once at the end of the frame, however many writes the frame made; when
// it is not, an invalidation asks for one frame and draws in it. So a still viewer
// is drawn once and then costs nothing.

import { AmbientLight, DirectionalLight, Mesh, MeshBasicMaterial, MeshLambertMaterial, OrthographicCamera, Scene, Vector3 } from 'three';
import { geometryFor, movingMesh, soupGeometry, carriedShade } from './meshes.js';
import { createLoop } from './loop.js';
import { createCamera } from './camera.js';
import { sharedRenderer } from './renderer.js';
import { cellBox, cellFace } from './grid.js';
import { PROJ } from '../../../../src/track.js';
import { originCell, axisArrows, axisAnchor, LABEL_SPOTS } from './axes.js';
import { TRAIN_CELL_INSET, LIGHT } from './dimensions.js';
import { toWorld } from './vec.js';
import { trainAt } from './rail.js';
import { trainBody } from './train.js';

/**
 * The names the overlays' meshes carry, so a test can find them in the scene. A
 * ghost's tint follows its name, `ghost-before` or `ghost-after`.
 */
export const OVERLAY = { grid: 'cell-grid', origin: 'origin-axes', trainCell: 'train-cell', ghost: 'ghost' };

// The overlays draw after the solids, and in this order among themselves. With
// depth writes off that is what PolyCSS's painter's order came to, measured to the
// pixel in the fidelity spike.
const ORDER = { grid: 1, ghost: 2, fill: 3 };

// Made on first use and shared by every stage on the page: the train as it is lit
// standing (a ghost), and as it is lit carried round a lap (a driven train).
let standing = null;
let carried = null;
const standingTrain = () => (standing ??= soupGeometry(trainBody()));
const carriedTrain = () => (carried ??= soupGeometry(trainBody(), { shade: carriedShade }));

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

/** A flat, see-through overlay paint. */
const overlay = (color, opacity) => new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

/** A mesh of fixed polygons, placed by translation alone. */
function fixedMesh(geometry, material, { name, order = 0, at = [0, 0, 0] } = {}) {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = order;
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeTranslation(...at);
  mesh.matrixWorldNeedsUpdate = true;
  return mesh;
}

/**
 * Bind a stage to a 2D `canvas`, sized by its stylesheet.
 *
 * `theme` is the overlay paint (see `readTheme` in renderer.js); `renderer` is what
 * draws — the page's shared one, or a stand-in for the tests.
 */
export function createStage(canvas, { theme, renderer = sharedRenderer, onTrainCell, onCamera } = {}) {
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, LIGHT.ambient));
  const sun = new DirectionalLight(0xffffff, LIGHT.directional);
  // The rig's direction points *at* the light, and so does a three light's position.
  sun.position.set(...LIGHT.direction.split(',').map(Number));
  scene.add(sun);

  const paint = {
    solid: new MeshLambertMaterial({ vertexColors: true }),
    // The driven train's lighting is baked into its colours, so it is drawn unlit.
    carried: new MeshBasicMaterial({ vertexColors: true }),
    grid: overlay(theme.grid, theme.gridOpacity),
    fill: overlay(theme.grid, theme.gridOpacity),
    // The origin's arrows are the lattice's blue at full strength, so they read as
    // solid marks and not as more lattice.
    origin: new MeshBasicMaterial({ color: theme.grid }),
    before: overlay(theme.ghostBefore, theme.ghostOpacity),
    after: overlay(theme.ghostAfter, theme.ghostOpacity),
  };
  const cellGeometry = soupGeometry(cellBox(TRAIN_CELL_INSET));

  // ---- Drawing ------------------------------------------------------------

  const camera = new OrthographicCamera();
  const size = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  let dirty = true;
  let requested = null;   // a frame asked for to draw in while the loop is idle

  function draw() {
    const { width, height } = size();
    if (!dirty || !width || !height) return;
    renderer.draw(canvas, scene, camera, width, height);
    dirty = false;
  }

  /** The picture has changed: draw it at the end of this frame, or in the next. */
  function invalidate() {
    dirty = true;
    if (loop.running() || requested !== null) return;
    requested = requestAnimationFrame(() => {
      requested = null;
      draw();
    });
  }

  const {
    frameTo: applyDescription, applyCamera, view, adjust, applied,
  } = createCamera(camera, size, () => { invalidate(); onCamera?.(); });

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
   *
   * Geometry is authored about the piece's own cube, always, and a mesh turns
   * about its geometry origin — so anything wanting to turn a piece about its
   * centre of mass converts with `originAt` from shapes.js.
   */
  function cube(id, { type, color, basis, position }) {
    const existing = cubes.get(id);
    if (existing) return existing;

    const mesh = movingMesh(scene, geometryFor(type, color), paint.solid, basis, position);
    const made = {
      id,
      type,
      color,
      basis,
      position,
      place(next, at) {
        mesh.place(next, at);
        made.basis = next;
        made.position = at;
        invalidate();
      },
      // Repaint where it stands: a swap to that colour's shared geometry.
      recolour(next) {
        mesh.reshape(geometryFor(type, next));
        made.color = next;
        invalidate();
      },
      // A detached cube's ID may already belong to a newer one, which this must not
      // take off the stage with it.
      dispose() {
        mesh.dispose();
        if (cubes.get(id) === made) cubes.delete(id);
        invalidate();
      },
      mesh,
    };
    cubes.set(id, made);
    invalidate();
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

  /** A train for a phase to drive, carrying the lighting of its authored pose round the lap. */
  const train = (basis, position) => movingMesh(scene, carriedTrain(), paint.carried, basis, position);

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
  function frameTo(description) {
    pan = null;
    framed = description ?? {};
    applyDescription(framed);
  }

  /**
   * Ease to a new camera description over `seconds`.
   *
   * Panning from nothing is just framing: a viewer's first shot is not a move.
   */
  function panTo(description, seconds = PAN) {
    if (!framed || framed.zoom === undefined) return frameTo(description);
    pan = { from: framed, to: description ?? {}, seconds, spent: 0 };
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
  function tick(delta, elapsed) {
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
    return undefined;
  }

  // One draw at the end of every frame the loop runs, whatever that frame wrote.
  const loop = createLoop((delta, elapsed) => {
    const going = tick(delta, elapsed);
    draw();
    return going;
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
   * description survives.
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
    invalidate();
  }

  /** Take an overlay's meshes out of the scene, with the geometry each owns. */
  function remove(meshes, { owned = true } = {}) {
    for (const mesh of meshes) {
      mesh.removeFromParent();
      if (owned) mesh.geometry.dispose();
    }
    invalidate();
  }

  // ---- The cell lattice ---------------------------------------------------
  //
  // Not a cube and not in the registry, so `clear()` between two shapes leaves it
  // standing; whoever set it takes it down with `setGrid(null)`. One mesh, mounted
  // once per box and never written to after. It is an overlay, not an object: one
  // flat colour on every face, so no side of a line reads as lit or in shade.

  let grid = null;

  /** Replace the lattice with these polygons, or take it away with `null`. */
  function setGrid(polygons) {
    if (grid) remove([grid]);
    grid = polygons ? fixedMesh(soupGeometry(polygons), paint.grid, { name: OVERLAY.grid, order: ORDER.grid }) : null;
    if (grid) scene.add(grid);
    showTrainCell();
    invalidate();
  }

  // ---- The origin's axes --------------------------------------------------
  //
  // An overlay like the lattice, and for the same reasons: not a cube, so `clear()`
  // leaves it standing.

  let origin = [];    // the origin cell's outline, then the arrows
  let tips = [];      // where each axis label goes, `{ name, at }` in world units

  /** Outline the origin cell and stand the arrows at `box`'s corner, or take them away with null. */
  function setOrigin(box) {
    remove(origin);
    origin = [];
    tips = [];
    if (!box) return;
    const anchor = axisAnchor(box);
    origin = [
      fixedMesh(soupGeometry(originCell()), paint.origin, { name: OVERLAY.origin }),
      fixedMesh(soupGeometry(axisArrows()), paint.origin, { name: OVERLAY.origin, at: anchor }),
    ];
    for (const mesh of origin) scene.add(mesh);
    tips = LABEL_SPOTS.map(({ name, position }) => ({ name, at: position.map((c, k) => c + anchor[k]) }));
    invalidate();
  }

  /**
   * Where each axis label belongs on screen, `{ name, x, y }` in client pixels.
   *
   * HTML text cannot be placed in the 3D scene, so each label's spot is projected
   * through the camera and the canvas's place on the page.
   */
  function originTips() {
    const { left, top, width, height } = canvas.getBoundingClientRect();
    const point = new Vector3();
    return tips.map(({ name, at }) => {
      point.set(...at).project(camera);
      return { name, x: left + (point.x + 1) / 2 * width, y: top + (1 - point.y) / 2 * height };
    });
  }

  // ---- The lattice cell the train is in -----------------------------------
  //
  // Part of the lattice, so it is only drawn while there is one. The driver reports
  // the cell whatever the viewer shows; the stage decides whether there is anything
  // to draw it on. One mesh — a see-through box filling one cell, authored about
  // the origin — mounted once and moved by its matrix, never rebuilt.

  let trainCell = null;   // the cell last reported, or null when there is no train
  let trainMark = null;

  function showTrainCell() {
    if (!grid || !trainCell) {
      if (trainMark) remove([trainMark], { owned: false });
      trainMark = null;
      return;
    }
    if (trainMark) {
      trainMark.matrix.makeTranslation(...toWorld(trainCell));
      trainMark.matrixWorldNeedsUpdate = true;
    } else {
      trainMark = fixedMesh(cellGeometry, paint.fill, {
        name: OVERLAY.trainCell, order: ORDER.fill, at: toWorld(trainCell),
      });
      scene.add(trainMark);
    }
    invalidate();
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
  // them, and whoever set them takes them down with `setGhosts([])`. A tinted ghost
  // is flat and see-through in its tint; one with no tint is the train itself, lit.
  // Either way the face it stands on is marked, in its tint or the lattice's paint.

  let ghosts = [];
  let floors = [];   // the patch of floor under each ghost, one geometry apiece

  /**
   * Replace the ghost trains with these, `{ type, cell, pose, tint? }` each: a train
   * standing on a piece of that type placed there — see `trainAt`. The piece need
   * not be drawn.
   */
  function setGhosts(list) {
    remove(ghosts, { owned: false });
    remove(floors);
    floors = list.map(({ cell, pose, tint }) => fixedMesh(
      soupGeometry(cellFace(PROJ[pose[0]], TRAIN_CELL_INSET)), tint ? paint[tint] : paint.fill,
      { name: `${OVERLAY.ghost}-floor-${tint ?? 'solid'}`, order: ORDER.ghost, at: toWorld(cell) },
    ));
    for (const mesh of floors) scene.add(mesh);
    ghosts = list.map(({ type, cell, pose, tint }) => {
      const { basis, position } = trainAt(type, cell, pose);
      const { mesh } = movingMesh(scene, standingTrain(), tint ? paint[tint] : paint.solid, basis, position);
      mesh.name = tint ? `${OVERLAY.ghost}-${tint}` : OVERLAY.ghost;
      if (tint) mesh.renderOrder = ORDER.ghost;
      return mesh;
    });
    invalidate();
  }

  // ---- Filled cells ---------------------------------------------------------
  //
  // Cells picked out whether or not a train is driving, in the train cell's own
  // paint — for a picture of one cell rather than a track going through it. An
  // overlay like the ghosts: `clear()` leaves them, and `setFill([])` takes them down.

  let fills = [];

  /** Fill these cells, `[x, y, z]` each, replacing any filled before. */
  function setFill(cells) {
    remove(fills, { owned: false });
    fills = cells.map(cell => fixedMesh(cellGeometry, paint.fill, {
      name: OVERLAY.trainCell, order: ORDER.fill, at: toWorld(cell),
    }));
    for (const mesh of fills) scene.add(mesh);
    invalidate();
  }

  return {
    scene,
    camera,
    cubes,
    cube,
    held,
    drop,
    detach,
    train,
    frameTo,
    panTo,
    applyCamera,
    applied,
    zoom: () => applied().zoom,
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
    invalidate,
  };
}
