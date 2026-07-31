// The scene catalogue — what the old spike selected with `?scene=` query
// parameters, as data instead.
//
// Every entry is `{ id, title, blurb, pieces, drive, camera }`. `drive` marks
// the scenes that are a real route, and so can have a train run on them: the
// pose tour is loose pieces and the gallery is a catalogue, neither of them a
// track.

import { chainTrack, cellsFor, SCORES } from '../../../src/track.js';
import { loopRoute, inversionRoute } from '../../../src/routes.js';
import { LAYOUTS, routeOf } from '../../../src/layouts.js';
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

// ---- The hand-built scenes ------------------------------------------------

export const loop = {
  id: 'loop',
  title: 'A simple closed loop',
  blurb: 'Fourteen pieces flat on the ground — four straights up each long side, one across '
    + 'each short side, a green left curve at every corner. The chain throws unless the route '
    + 'closes and no two pieces share a cell, so both hard constraints hold by construction.',
  ...sceneFromRoute(loopRoute),
};

export const inversion = {
  id: 'inversion',
  title: 'All six faces',
  blurb: 'One closed loop that puts the rail on every face of a cube: along the top, up both '
    + 'side walls, across the front and the back, and hanging upside down underneath. '
    + 'Fourteen pieces is not one over the minimum — it is the minimum, once the train needs '
    + 'room to fit.',
  // A compact 3D tangle rather than a flat layout: the view swings round behind
  // it, where the two interlocking rings read as separate instead of overlapping.
  ...sceneFromRoute(inversionRoute, {
    camera: { zoom: 7.5, target: '-40,0,30', 'rot-x': 60, 'rot-y': 225 },
  }),
};

// The pre-loop illustration, kept for the blog: NOT a legal track, just a tour
// of the pose system with a ground run, a wall climb up the far column, a crest
// onto its roof, and three loose pieces beside it.
const demoPieces = [
  { cell: [0, 0, 0], type: 'straight', pose: 'UF', color: '#f8fafc' }, // start cube — white
  { cell: [0, 0, 1], type: 'straight', pose: 'UF', color: '#ffd166' },
  { cell: [0, 0, 2], type: 'cross', pose: 'UF', color: '#b48ce8' }, // crossing — purple
  { cell: [0, 0, 3], type: 'straight', pose: 'UF', color: '#ffd166' },
  { cell: [0, 0, 4], type: 'straight', pose: 'FU', color: '#ffd166' }, // wall column: rail on front face, heading up
  { cell: [0, 1, 4], type: 'straight', pose: 'FU', color: '#ffd166' },
  { cell: [0, 2, 4], type: 'straight', pose: 'FU', color: '#ffd166' },
  { cell: [0, 3, 4], type: 'outsideCurve', pose: 'FU', color: '#ef6461' }, // red — crests the wall onto its top
  { cell: [0, 3, 3], type: 'straight', pose: 'UB', color: '#ffd166' }, // on the roof, heading back towards the viewer
  // Four left curves click into the free-standing donut ring from the product
  // photos: displacements sum to zero and the 2×2 footprints tile a 4×4 square.
  { cell: [4, 0, 0], type: 'leftCurve', pose: 'UF', color: '#6bbf59' },
  { cell: [2, 0, 1], type: 'leftCurve', pose: 'UL', color: '#6bbf59' },
  { cell: [1, 0, -1], type: 'leftCurve', pose: 'UB', color: '#6bbf59' },
  { cell: [3, 0, -2], type: 'leftCurve', pose: 'UR', color: '#6bbf59' },
  { cell: [-2, 0, 3], type: 'rightCurve', pose: 'UF', color: '#5b8def' }, // blue — standalone
  { cell: [-2, 0, 0], type: 'insideCurve', pose: 'UF', color: '#f2933a' }, // orange — valley turn, ground to wall
];

export const demo = {
  id: 'demo',
  title: 'A tour of the poses',
  blurb: 'Not a legal track — loose pieces, shown to explain the pose system. A ground run '
    + 'into a crossing, a wall climb, a crest onto the roof, the free-standing ring four left '
    + 'curves click into, and a blue and an orange curve on their own.',
  pieces: demoPieces,
  drive: false,
  camera: { zoom: 2.8, target: '20,30,25' },
};

// ---- The solved layouts ---------------------------------------------------

/** How each layout is introduced. One line each — the prose comes later. */
export const solvedLayouts = Object.entries(LAYOUTS).map(([name, layout]) => {
  const pieces = paint(chainTrack(routeOf(layout.shape)));
  const cubes = cubesIn(pieces);
  const held = Object.values(layout.set).reduce((a, b) => a + b, 0);
  return {
    id: `solved:${name}`,
    name,
    title: layout.note,
    shape: layout.shape,
    cubes,
    held,
    steps: layout.shape.length,
    score: scoreOf(pieces),
    box: layout.box,
    proved: layout.proved,
    pieces,
    drive: true,
    camera: frame(pieces),
  };
});

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

export const scenes = { loop, inversion, demo };
