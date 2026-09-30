// The scene factories the components are built on.
//
// A scene is `{ pieces, drive, camera }` — everything `TrackViewer` needs.
// `drive` marks the scenes that are a real route, and so can have a train run
// on them: a single piece and the pose gallery are catalogues, not tracks.

import { chainTrack, chainOpen, cellsFor, cubeOf, startCell, step, SCORES } from '../../../src/track.js';
import { routeOf, identify } from '../../../src/layouts.js';
import { COLORS, ALARM } from './render/dimensions.js';
import { DIR, toWorld } from './render/vec.js';
import { CAMERA, REFERENCE_WIDTH, REFERENCE_HEIGHT } from './render/camera.js';

/** chainTrack returns the model's view of a route; colour is ours to add. */
export const paint = placed => placed.map(piece => ({ ...piece, color: COLORS[piece.type] }));

/** How many cubes a chained route actually spends — revisits are not cubes. */
export const cubesIn = pieces => pieces.filter(p => !p.revisit).length;

/** What a chained route is worth under SCORES, counted the same way. */
export const scoreOf = pieces =>
  pieces.reduce((total, p) => total + (p.revisit ? 0 : SCORES[p.type]), 0);

/**
 * Point the camera at the middle of a layout and back off far enough to see it
 * all. Solver output is a different shape every time, so hand-tuning a camera
 * per scene does not scale — this reads the pieces instead.
 */
export function frame(pieces, extra = {}) {
  const cells = pieces.flatMap(p => p.material ?? [cubeOf(p.cell, p.pose)]);
  const axis = a => cells.map(c => c[a]);
  const lo = [0, 1, 2].map(a => Math.min(...axis(a)));
  const hi = [0, 1, 2].map(a => Math.max(...axis(a)));
  // The centre of the occupied cells, in world units, allowing for a cube being
  // one cell wide: the far edge is hi + 1.
  const centre = toWorld([0, 1, 2].map(a => (lo[a] + hi[a] + 1) / 2 - 0.5));
  // Drive the zoom off the bounding box's diagonal rather than its longest
  // side: the view is isometric, so depth eats screen width too, and a tall
  // narrow layout needs backing off as much as a long flat one.
  const diagonal = Math.hypot(...[0, 1, 2].map(a => hi[a] - lo[a] + 1));
  return { zoom: Math.min(8, 38 / diagonal), target: centre.join(','), ...extra };
}

/** A whole scene from a route, auto-framed. */
export const sceneFromRoute = (route, extra = {}) => {
  const pieces = paint(chainTrack(route));
  return { pieces, drive: true, camera: frame(pieces), ...extra };
};

/**
 * A track as far as it has been built, which is what a track being *typed* is.
 *
 * `sceneFromRoute` goes through `chainTrack` and so refuses anything that is not
 * already a finished loop. That is right for showing an answer and no use at all
 * for reaching one by hand, where the route is open at every keystroke but the
 * last. So this goes through `chainOpen` instead and reports rather than refuses:
 *
 *   pieces    everything the letters lay down, painted
 *   closed    whether it is a track yet
 *   offender  the piece the model will not accept, or null
 *
 * The route is cut off *at* the offender rather than before it: Owen's call is that
 * a piece with nowhere to go is drawn where it was asked to go, overlapping whatever
 * it runs into, and flashes red there. Anything after it is dropped, since the
 * viewer stops taking letters at that point anyway.
 *
 * An over-crossed cross is the one fault that places no cube of its own — the third
 * traversal is a revisit — so what flashes is the cross already sitting in that cell.
 */
/**
 * Which cube each *step* of a route is, lined up with the placed list rather than
 * squeezed down to one entry per cube.
 *
 * `identify` skips revisits, which is right — a crossed cross is one cube — but it
 * means its answers no longer line up with the pieces they name. Anything matching
 * cubes to positions in a route needs them lined up, so a revisit gets a `null`.
 */
export function cubeIds(placed) {
  const ids = identify(placed);
  let k = 0;
  return placed.map(piece => (piece.revisit ? null : ids[k++]));
}

export function openScene(letters) {
  const { placed, closed, faults } = chainOpen(routeOf(letters));
  const fault = faults[0] ?? null;
  const kept = fault ? placed.slice(0, fault.index + 1) : placed;
  // Which *step* is at fault is not always which *cube* is: the third traversal of
  // a cross places nothing, so what flashes is the cross already in that cell.
  //
  // Whether that is reachable is open. Every over-crossing route the project knows
  // collides first — including `THRICE` in tests/cross.test.js, which reports the
  // collision at step 13 and the third traversal at 14 — and a search over 4.6
  // million fault-free prefixes beginning with a cross, out to fourteen pieces,
  // turned up none where the crossing is the first fault. It stays because without
  // it that case silently flashes nothing at all: the revisit has no cube, so the
  // ID would be null and the alarm would go nowhere.
  const at = fault === null ? -1 : fault.index;
  const blamed = at >= 0 && kept[at].revisit
    ? kept.findIndex(p => !p.revisit
      && cubeOf(p.cell, p.pose).join(',') === cubeOf(kept[at].cell, kept[at].pose).join(','))
    : at;

  const pieces = paint(kept).map((piece, i) => (i === blamed ? { ...piece, color: ALARM } : piece));
  return {
    pieces,
    closed: closed && !fault,
    offender: fault && { ...fault, id: cubeIds(kept)[blamed] },
  };
}

/**
 * A layout about to fall over. The pieces are the same ones a track scene draws
 * — the physics reads them straight out of `chainTrack` — but the shot is not:
 * what has to fit in frame is the pile, which lands `drop` cubes below the
 * track and spreads sideways getting there.
 */
export function tumbleScene(route, { drop = 3 } = {}) {
  const pieces = paint(chainTrack(route));
  return { pieces, drop, camera: frameBox(boundsOf(pieces), { drop }) };
}

// ---- Boxes, and the one frame a rearrangement is watched from ---------------

/** The box of cells a set of pieces occupies. */
export const boundsOf = pieces => {
  const cells = pieces.flatMap(p => p.material ?? [cubeOf(p.cell, p.pose)]);
  const bound = pick => [0, 1, 2].map(a => pick(...cells.map(c => c[a])));
  return { lo: bound(Math.min), hi: bound(Math.max) };
};

/**
 * The box of cells a set of pieces *and their train* occupies — the lattice a
 * layout is drawn in. `boundsOf` is material only, which is right for anything
 * about where cubes are; the train rides a cell above them and has to be inside.
 */
export const extentOf = pieces => {
  const cells = pieces.flatMap(p => [...(p.material ?? [cubeOf(p.cell, p.pose)]), ...(p.train ?? [])]);
  const bound = pick => [0, 1, 2].map(a => pick(...cells.map(c => c[a])));
  return { lo: bound(Math.min), hi: bound(Math.max) };
};

const SPREAD = 2;   // cubes of room either side for a pile to sprawl into

/**
 * A camera for a box, with `drop` cubes of headroom below it to fall through and
 * room either side for the pile that lands.
 *
 * `frame` reads a piece's `material` and nothing else, so the box goes in as one
 * piece made of nothing but its two extreme corners.
 */
export const frameBox = ({ lo, hi }, { drop = 0 } = {}) => frame([{ material: [
  [lo[0] - SPREAD, lo[1] - drop, lo[2] - SPREAD],
  [hi[0] + SPREAD, hi[1], hi[2] + SPREAD],
] }]);

/**
 * The box a track being typed is framed in, given the box it was framed in before.
 *
 * It only ever **grows**. A track under construction is not a shape that changes,
 * it is a shape that extends, so a frame derived afresh each keystroke would shrink
 * and re-centre on a backspace — the camera chasing the content, which is the thing
 * `fixedFrame` below exists to avoid. Growing only means the camera settles: it
 * moves while the track is reaching new ground and then stops, and nothing ever
 * gets smaller.
 *
 * The floor is what stops a two-piece sketch being drawn at arm's length.
 */
const SKETCH_FLOOR = { lo: [-1, 0, -1], hi: [1, 1, 1] };

/**
 * Where the builder's frame starts: wide, so there is room to see where a track is
 * going before it gets there. Someone clicking pieces on is not watching one letter
 * at a time the way a sketch is, and they can zoom in themselves.
 */
export const BUILD_FLOOR = { lo: [-4, 0, -4], hi: [4, 3, 4] };

export function growBox(pieces, box = SKETCH_FLOOR) {
  const { lo, hi } = pieces.length ? boundsOf(pieces) : box;
  return {
    lo: box.lo.map((v, a) => Math.min(v, lo[a])),
    hi: box.hi.map((v, a) => Math.max(v, hi[a])),
  };
}

/**
 * A camera for a box, tight — no allowance for anything to fall or sprawl into.
 *
 * `frameBox` is the other one, and its `SPREAD` is room for a *pile*: two cubes
 * either side of the track, which is most of a small layout's width again. Nothing
 * falls in a sketch, so paying for that would draw a four-piece ring at half the
 * size it could be. Same trick as `frameBox` — one piece made of two corners.
 */
export const frameTight = ({ lo, hi }) => frame([{ material: [lo, hi] }]);

const rad = d => d * Math.PI / 180;

/**
 * Where a world point lands on screen at zoom 1 under the default camera, as
 * `[across, down]` — the camera `polyView` sets up in camera.js (see `slid` in
 * controls.js for the same arithmetic inverted).
 */
function onScreen([a, b, c]) {
  const [turn, tilt] = [rad(CAMERA['rot-y']), rad(CAMERA['rot-x'])];
  const [x, y] = [b * Math.cos(turn) - a * Math.sin(turn), b * Math.sin(turn) + a * Math.cos(turn)];
  return [x, y * Math.cos(tilt) - c * Math.sin(tilt)];
}

/** The world displacement that moves the screen by `[dx, dy]` at zoom 1: `onScreen` inverted, across the screen. */
function offScreen([dx, dy]) {
  const [turn, tilt] = [rad(CAMERA['rot-y']), rad(CAMERA['rot-x'])];
  const [c, s, q] = [Math.cos(turn), Math.sin(turn), Math.cos(tilt)];
  return [-dx * s + dy * q * c, dx * c + dy * q * s, -dy * Math.sin(tilt)];
}

/**
 * A camera that fits `points` (world units) as they land on screen, from the
 * default angle. `frame` backs off by a box's diagonal, which is room for any
 * angle; a viewer that is only ever seen from one can have that room back.
 */
export function frameFit(points) {
  const shown = points.map(onScreen);
  const span = a => [Math.min(...shown.map(p => p[a])), Math.max(...shown.map(p => p[a]))];
  const [across, down] = [span(0), span(1)];
  const zoom = Math.min(REFERENCE_WIDTH / (across[1] - across[0]), REFERENCE_HEIGHT / (down[1] - down[0]));
  const mid = [0, 1, 2].map(a => (Math.min(...points.map(p => p[a])) + Math.max(...points.map(p => p[a]))) / 2);
  const [cx, cy] = onScreen(mid);
  const shift = offScreen([(across[0] + across[1]) / 2 - cx, (down[0] + down[1]) / 2 - cy]);
  return { zoom, target: mid.map((v, a) => v + shift[a]).join(',') };
}

/** The eight outer corners of a box of cells, in world units. */
export const cornersOf = ({ lo, hi }) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map(k => toWorld([0, 1, 2].map(a => (k >> a) & 1 ? hi[a] + 0.5 : lo[a] - 0.5)));

/**
 * How far from the start cell the frame reaches, in cells — and therefore the
 * largest layout `Layout` can show without cropping.
 *
 * It is the **solver's own box constraint**, not a number picked to look right:
 * `solveTrack` is told no material cell may sit further than `box` from the
 * origin, and every layout in `src/layouts.js` was solved at 3, 4, 5 or 6. Checked
 * rather than assumed — the worst reach over all eight of them is exactly 6, so
 * this holds every answer the project has produced, and the check is in
 * `tests/stage.test.js` so a bigger layout added later fails loudly.
 */
const REACH = 6;

/**
 * The one frame a rearrangement is watched from — fixed, and the same whatever is
 * being shown.
 *
 * Framing per layout means a camera that moves every time you type, because the
 * layouts are neither the same size nor in the same place: over the four known
 * 18-cube layouts of the model set the extents run 6x7x9, 8x5x7, 8x5x6 and 9x5x4,
 * and their centres move by whole cubes. Growing a box to take each new layout in
 * is better but still moves, on the change that grows it. So the box is not derived
 * from the layouts at all. Every route starts at the origin and none may dig below
 * the ground, so a box reaching REACH cells around that start cell holds any of
 * them, and the camera has nothing to respond to.
 *
 * It is not the expensive option it sounds like: zoom 1.90, against 1.96 for the
 * union of just two 18-cube layouts. Almost all of the cost of framing a
 * rearrangement is the room to fall, which any of these has to reserve.
 *
 * `reach` is still the solver's box constraint, just not always *this* model's:
 * the sweeps were solved at 8 and 6, so a viewer showing one passes the sweep's
 * own `question.box` and gets the same never-moving frame, sized to hold every
 * answer that sweep contains.
 */
export const fixedFrame = ({ drop = 1, reach = REACH } = {}) =>
  frameBox({ lo: [-reach, 0, -reach], hi: [reach, reach, reach] }, { drop });

export { REACH };

// ---- The 24-pose gallery --------------------------------------------------

const FACES = ['U', 'D', 'F', 'B', 'L', 'R'];

/**
 * One piece in each of the 24 valid poses: one row per face (U D F B L R), one
 * column per heading. Arc pieces span 2×2 cells, so they need a wider gap.
 */
export function poseGallery(type) {
  const gap = ['leftCurve', 'rightCurve', 'insideCurve'].includes(type) ? 4 : 2;
  const pieces = FACES.flatMap((face, row) =>
    FACES.filter(h => DIR[h].every((v, k) => v === 0 || DIR[face][k] === 0))
      .map((heading, col) => ({
        // The head goes wherever puts the cube on the gallery's grid.
        cell: startCell(face + heading).map((v, k) => v + [col * gap, 0, -row * gap][k]),
        type,
        pose: face + heading,
        color: COLORS[type],
      })));
  return {
    pieces,
    drive: false,
    camera: { zoom: 4.4 / gap, target: `${30 * gap},${-50 * gap},0`, 'rot-x': 65 },
  };
}

// ---- A single piece, on its own -------------------------------------------

/**
 * One piece on its own, framed close — for the component library. `pose` defaults
 * to the canonical one; `scale` multiplies the zoom, for a view with no room to spare.
 */
export function singlePiece(type, { pose = 'DF', scale = 1 } = {}) {
  // The arc pieces fill a 2×2 footprint, so centring on the one cell the piece
  // is keyed to puts it half out of shot. Ask the model which cells it really
  // occupies and let `frame` do the arithmetic, exactly as it does for a layout.
  const cell = startCell(pose);
  const { material } = cellsFor(type, pose, cell);
  const pieces = [{ cell, type, pose, color: COLORS[type], material }];
  // `frame`'s zoom is capped at 8, which is fine for layouts but flattens the
  // difference between a single cube and a 2×2 arc — both hit the cap, so the
  // arcs come out cropped. One piece is the subject of its own card, so the
  // zoom is taken from the piece's diagonal uncapped instead.
  const { target } = frame(pieces);
  const diagonal = Math.hypot(...[0, 1, 2].map(a =>
    Math.max(...material.map(c => c[a])) - Math.min(...material.map(c => c[a])) + 1));
  return {
    pieces,
    drive: false,
    // The classic turn rather than `CAMERA`'s: a piece alone has no track to set
    // off from the bottom left, and PieceCard's poses were picked to read this way.
    camera: { target, zoom: scale * 30 / diagonal, 'rot-x': 62, 'rot-y': 45 },
  };
}

// ---- What one piece does to the train --------------------------------------

/**
 * One piece at the start, with a ghost train on it where the train is before, and
 * another where it is after — the head `step` hands the next piece, standing on
 * the straight that would click in there. Each is half a cube along its piece, so
 * the after ghost stands over an empty cell. The lattice reaches both ghosts'
 * cells and no further.
 *
 * Framed on the lattice with `frame`'s zoom cap lifted: the cap is for layouts, and
 * a scene this small hits it every time and comes out drawn at half the size.
 */
export function pieceMove(type) {
  const before = { cell: startCell('DF'), pose: 'DF' };
  const after = step(before.cell, before.pose, type);
  const pieces = [{ ...before, type, color: COLORS[type], ...cellsFor(type, before.pose, before.cell) }];
  const grid = extentOf([...pieces, { material: [], train: [before.cell, after.cell] }]);
  const diagonal = Math.hypot(...[0, 1, 2].map(a => grid.hi[a] - grid.lo[a] + 1));
  return {
    pieces,
    drive: false,
    ghosts: [
      { ...before, type, tint: 'before' },
      { ...after, type: 'straight', tint: 'after' },
    ],
    grid,
    camera: { ...frameTight(grid), zoom: 42 / diagonal },
  };
}

// ---- Every pose inside one cell --------------------------------------------

/**
 * One cell with nothing in it, lattice only, for a train to be shown in each
 * of its 24 poses in turn — see `poseGhost`. Framed like `pieceMove`, on the cell.
 */
export function poseCycle() {
  const grid = { lo: [0, 0, 0], hi: [0, 0, 0] };
  return {
    pieces: [],
    drive: false,
    grid,
    camera: { ...frameTight(grid), zoom: 42 / Math.sqrt(3) },
  };
}

/**
 * The train in `pose` inside `poseCycle`'s cell: standing on the straight that
 * pose would click into next, so it is centred in the cell on that pose's floor.
 * The straight itself is not drawn. Untinted, so the train is solid.
 */
export const poseGhost = pose => ({ type: 'straight', cell: [0, 0, 0], pose });
