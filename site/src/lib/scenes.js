// The scene factories the components are built on.
//
// A scene is `{ pieces, drive, camera }` — everything `TrackViewer` needs.
// `drive` marks the scenes that are a real route, and so can have a train run
// on them: a single piece and the pose gallery are catalogues, not tracks.

import { chainTrack, cellsFor, SCORES } from '../../../src/track.js';
import { COLORS, START_COLOR } from './render/dimensions.js';
import { DIR, toWorld } from './render/vec.js';

/** chainTrack returns the model's view of a route; colour is ours to add. */
export const paint = placed => placed.map((piece, i) => ({
  ...piece,
  color: i === 0 ? START_COLOR : COLORS[piece.type],
}));

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
  const cells = pieces.flatMap(p => p.material ?? [p.cell]);
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
 * A layout about to fall over. The pieces are the same ones a track scene draws
 * — the physics reads them straight out of `chainTrack` — but the shot is not:
 * what has to fit in frame is the pile, which lands `drop` cubes below the
 * track and spreads sideways getting there.
 */
export function tumbleScene(route, { drop = 3 } = {}) {
  const pieces = paint(chainTrack(route));
  const cells = pieces.flatMap(p => p.material);
  const bound = pick => [0, 1, 2].map(a => pick(...cells.map(c => c[a])));
  const [lo, hi] = [bound(Math.min), bound(Math.max)];
  const spread = 2;   // cubes of room either side for the pile to sprawl into
  // `frame` reads a piece's `material`, and nothing else, so the extra corners
  // go in as one piece made of nothing but the two of them.
  const room = { material: [
    [lo[0] - spread, lo[1] - drop, lo[2] - spread],
    [hi[0] + spread, hi[1], hi[2] + spread],
  ] };
  return { pieces, drop, camera: frame([...pieces, room]) };
}

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
        cell: [col * gap, 0, -row * gap],
        type,
        pose: face + heading,
        color: COLORS[type],
      })));
  return {
    pieces,
    drive: false,
    camera: { zoom: 4.4 / gap, target: `${30 * gap},${-50 * gap},0`, 'rot-x': 65, 'rot-y': 45 },
  };
}

// ---- A single piece, on its own -------------------------------------------

/** One piece in the canonical pose, framed close — for the component library. */
export function singlePiece(type) {
  const pose = 'UF';
  // The arc pieces fill a 2×2 footprint, so centring on the one cell the piece
  // is keyed to puts it half out of shot. Ask the model which cells it really
  // occupies and let `frame` do the arithmetic, exactly as it does for a layout.
  const { material } = cellsFor(type, pose, [0, 0, 0]);
  const pieces = [{ cell: [0, 0, 0], type, pose, color: COLORS[type], material }];
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
    camera: { target, zoom: 30 / diagonal, 'rot-x': 62, 'rot-y': 45 },
  };
}
