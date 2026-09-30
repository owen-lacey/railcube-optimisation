// The collision shape of each piece: a chain of boxes, and where its mass sits.
//
// Split out of `physics.js` because two things want this and only one of them
// wants a physics engine. `physics.js` builds a cannon world out of these; the
// renderer only wants `CENTROID`, because a piece that is being *moved* about its
// centre of mass rather than about the cell its geometry is keyed to needs to know
// where that point is. Importing the world for it would put cannon-es in the
// bundle of every static piece card.
//
// So: shapes and masses here, with no dependency on cannon. The world next door.
//
// Everything is in the renderer's world frame (right, forwards, up; one cube =
// CUBE units) and in the canonical DF pose, same as the drawn geometry.

import { CUBE } from './render/dimensions.js';
import { ARC_MAP, ARC_R } from './render/pieces.js';
import { toWorld, add, sub, unit, cross, through } from './render/vec.js';
import { MOVES, cellsFor, startCell } from '../../../src/track.js';

const SEGMENTS = 6;       // collision boxes per quarter arc
const DENSITY = 1 / 4000; // arbitrary: only mass *ratios* between pieces matter

const dot = (a, b) => a.reduce((acc, v, k) => acc + v * b[k], 0);
const negate = a => a.map(v => -v);

/**
 * The sweep maps for the three arc pieces. `pieces.js` builds the right curve by
 * mirroring the left one's finished polygons rather than by mapping, so the
 * mirror is applied to the map here for the same effect.
 */
const ARC = {
  leftCurve: ARC_MAP.leftCurve,
  rightCurve: (u, w, t) => { const [x, y, z] = ARC_MAP.leftCurve(u, w, t); return [-x, y, z]; },
  insideCurve: ARC_MAP.insideCurve,
};

/** Flip a basis's middle column if it came out left-handed. A box is symmetric,
 *  so which way its length points is free — the handedness is not. */
const rightHanded = ([a, b, c]) => (dot(a, cross(b, c)) > 0 ? [a, b, c] : [a, negate(b), c]);

/**
 * One arc piece as a chain of boxes strung along its sweep.
 *
 * The 2×2 block of cells the model says an arc occupies is its bounding box, not
 * its material: a quarter donut fills about 60% of that, and colliding with the
 * whole block would leave the pile resting on corners that are not there.
 *
 * The frame at each station is read off the map by difference rather than
 * derived by hand — `map` is affine in (u, w), so one subtraction gives each
 * transverse axis exactly, and the same trick on t gives the tangent. That way
 * the mirrored right curve needs no special case.
 */
function arcBoxes(map) {
  const dt = (Math.PI / 2) / SEGMENTS;
  // A straight box laid along a curve pokes out past the swept volume at its
  // corners. Pull the transverse extents in by that bulge, so a piece starts
  // inside its own footprint instead of inside its neighbour's.
  const bulge = (CUBE / 2 + ARC_R) * (1 / Math.cos(dt / 2) - 1);
  const half = CUBE / 2 - bulge;
  const length = 2 * ARC_R * Math.sin(dt / 2); // the chord, so segments meet without overlapping
  return Array.from({ length: SEGMENTS }, (_, j) => {
    const t = (j + 0.5) * dt;
    const centre = map(0, 0, t);
    const eu = unit(sub(map(1, 0, t), centre));
    const ew = unit(sub(map(0, 1, t), centre));
    const et = unit(sub(map(0, 0, t + 1e-4), map(0, 0, t - 1e-4)));
    return { centre, half: [half, length / 2, half], basis: rightHanded([eu, et, ew]) };
  });
}

/** A whole cube, axis-aligned in the canonical pose. */
const CUBE_BOX = [{ centre: [0, 0, 0], half: [CUBE / 2, CUBE / 2, CUBE / 2], basis: null }];

/**
 * The collision shape of each piece type, in the canonical DF pose. The outside
 * curve is in with the cubes on purpose: it *is* one cube, with one edge rounded
 * off, and a box is a truer shape for it than anything more elaborate.
 */
export const BOXES = {
  straight: CUBE_BOX,
  cross: CUBE_BOX,
  outsideCurve: CUBE_BOX,
  leftCurve: arcBoxes(ARC.leftCurve),
  rightCurve: arcBoxes(ARC.rightCurve),
  insideCurve: arcBoxes(ARC.insideCurve),
};

const volumeOf = box => 8 * box.half[0] * box.half[1] * box.half[2];

/**
 * A piece's centre of mass, in its own local frame.
 *
 * This is not the origin its geometry is authored about: an arc's mass sits out
 * in the middle of its bend, a couple of cells away. It matters twice over. To
 * the physics, because cannon treats a body's position as its centre of mass, so
 * a body whose origin is elsewhere spins about the wrong point as it falls. And
 * to the renderer, because a piece being carried through the air reads as being
 * carried if it turns about its middle and as being flung if it turns about a
 * corner of its bounding box.
 *
 * Both uses need the same conversion, and it is worth writing down once:
 * a mesh turns about its geometry origin, and the geometry here is
 * always keyed to the piece's cell. So to draw a piece whose *centre of mass* is
 * at `com` under orientation `basis`, put the mesh at
 * `sub(com, through(basis, CENTROID[type]))` — see `originAt` below.
 */
export const CENTROID = Object.fromEntries(
  Object.keys(BOXES).map(type => [type, centroidOf(BOXES[type])]));

function centroidOf(boxes) {
  const total = boxes.reduce((m, b) => m + volumeOf(b), 0);
  return boxes.reduce(
    (acc, b) => add(acc, b.centre.map(v => v * volumeOf(b) / total)), [0, 0, 0]);
}

/**
 * Where to put a cell-keyed mesh so that its centre of mass lands on `com` while
 * it is turned by `basis`. The one line that keeps the drawn piece and the moved
 * piece in step, wherever the movement comes from.
 */
export const originAt = (type, basis, com) => sub(com, through(basis, CENTROID[type]));

/** And the other way: where a piece's centre of mass is, given its mesh origin. */
export const comAt = (type, basis, origin) => add(origin, through(basis, CENTROID[type]));

export const MASS = Object.fromEntries(Object.keys(BOXES).map(type =>
  [type, DENSITY * BOXES[type].reduce((m, b) => m + volumeOf(b), 0)]));

// ---- The shapes are checked against the model's own footprints -------------

/** Every corner of a box, in the piece's local frame. */
const cornersOf = ({ centre, half, basis }) =>
  [-1, 1].flatMap(sx => [-1, 1].flatMap(sy => [-1, 1].map(sz => {
    const local = [sx * half[0], sy * half[1], sz * half[2]];
    return add(centre, basis ? through(basis, local) : local);
  })));

/**
 * How far a collision box may stick out of the cells the model says its piece
 * fills. Not zero, because a straight box cannot end flush with a curved
 * piece's mouth: its end face is square to the middle of its own segment, so
 * the corners swing a little past the mouth plane. The consequence is that two
 * arcs clicked together start fractionally interpenetrated and the solver
 * pushes them apart over the first few frames, which in something that is
 * collapsing anyway is invisible.
 *
 * A tenth of a cube is the budget. The point of a number here is that it is
 * *small* and it is *checked* — a quarter-turn error in a sweep map, or a
 * mirror applied to the wrong axis, moves a box by whole cubes.
 */
const FOOTPRINT_SLOP = CUBE / 10;

/**
 * No collision box may stray further than that out of its piece's footprint.
 *
 * Run at import, in the same spirit as `assertRailMouths`: these shapes are
 * hand-approximated where the drawn geometry is exact, and an arc that collided
 * a quarter-turn out of place would still produce a perfectly plausible pile.
 * The model's footprint is the one independent statement of where a piece is,
 * so it is what the approximation gets measured against.
 */
export function assertFootprints() {
  for (const type of Object.keys(BOXES)) {
    const cells = cellsFor(type, 'DF', startCell('DF')).material.map(toWorld);
    const bound = pick => [0, 1, 2].map(a => pick(...cells.map(c => c[a])));
    const lo = bound(Math.min).map(v => v - CUBE / 2);
    const hi = bound(Math.max).map(v => v + CUBE / 2);
    const overshoot = Math.max(...BOXES[type].flatMap(cornersOf)
      .flatMap(corner => corner.map((v, a) => Math.max(lo[a] - v, v - hi[a]))));
    if (overshoot > FOOTPRINT_SLOP) {
      throw new Error(
        `${type}: a collision box strays ${overshoot.toFixed(2)} units outside its `
        + `footprint ${lo.join(',')}..${hi.join(',')} — over the ${FOOTPRINT_SLOP} allowed`);
    }
  }
}

if (Object.keys(BOXES).length !== Object.keys(MOVES).length) {
  throw new Error('the collision shapes have drifted from the piece catalogue');
}
assertFootprints();
