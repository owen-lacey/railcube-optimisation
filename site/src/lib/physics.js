// The track falling apart: a cannon-es rigid-body world built from a chained
// route. Physics only — no PolyCSS, no DOM. `render/tumble.js` is the binding
// that draws what this works out.
//
// Everything here is in the renderer's world frame (right, forwards, up; one
// cube = CUBE units), not the model's cell frame, because a body's whole job is
// to hand a mesh a position and a rotation, and those are what the renderer
// speaks. That frame is right-handed, which is what lets cannon's rotations be
// used as-is; the model's own frame is left-handed (see `src/track.js`) and
// would mirror every curve. Gravity therefore points along −up, not −y.
//
// Nothing holds the pieces together. The real cubes click into each other with
// magnets; here they are loose bodies resting on each other, so a closed loop —
// most of which is unsupported, some of it upside down — collapses the instant
// the clock starts. That is the point.

import * as CANNON from 'cannon-es';
import { CUBE } from './render/dimensions.js';
import { ARC_MAP, ARC_R } from './render/pieces.js';
import { toWorld, poseRotation, through, add, sub, unit, cross } from './render/vec.js';
import { MOVES, cellsFor } from '../../../src/track.js';

const GRAVITY = 900;      // scene units per second², ~9.8 m/s² with a cube as 22 cm
const DENSITY = 1 / 4000; // arbitrary: only mass *ratios* between pieces matter
const SEGMENTS = 6;       // collision boxes per quarter arc

// When a body counts as having stopped, which is worth getting right because a
// sleeping body costs nothing to draw. cannon's default speed limit — a tenth of
// a unit per second — assumes a unit is a metre; here a unit is about a
// centimetre, so on that number a pile that has visibly finished falling is
// still creeping fast enough to stay awake for ever. The limit below is that
// default restated at this scale, and it was measured, not guessed: without it
// not one body of an 18-cube pile had slept after 30 simulated seconds.
const SLEEP_SPEED = CUBE / 10;  // two units a second, ~2 mm/s on a real cube
const SLEEP_TIME = 0.5;         // seconds spent below it before the body gives up

const dot = (a, b) => a.reduce((acc, v, k) => acc + v * b[k], 0);
const vec = ([x, y, z]) => new CANNON.Vec3(x, y, z);
const negate = a => a.map(v => -v);

// ---- Collision shapes -----------------------------------------------------

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
 * The collision shape of each piece type, in the canonical UF pose. The outside
 * curve is in with the cubes on purpose: it *is* one cube, with one edge rounded
 * off, and a box is a truer shape for it than anything more elaborate.
 */
const BOXES = {
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
 * in the middle of its bend, a couple of cells away. It matters because cannon
 * treats a body's position as its centre of mass, so a body whose origin is
 * elsewhere spins about the wrong point as it falls. Both the mesh and the
 * collision boxes are shifted by it, which puts the two back in step.
 */
const centroidOf = boxes => {
  const total = boxes.reduce((m, b) => m + volumeOf(b), 0);
  return boxes.reduce(
    (acc, b) => add(acc, b.centre.map(v => v * volumeOf(b) / total)), [0, 0, 0]);
};

/** Where each piece type's mass sits, in the canonical pose. */
export const CENTROID = Object.fromEntries(
  Object.keys(BOXES).map(type => [type, centroidOf(BOXES[type])]));

const MASS = Object.fromEntries(Object.keys(BOXES).map(type =>
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
    const cells = cellsFor(type, 'UF', [0, 0, 0]).material.map(toWorld);
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

// ---- Rotations ------------------------------------------------------------

/**
 * A rotation basis (the images of local right/forwards/up, as `rotate` takes)
 * as a cannon quaternion. Shepperd's method: pick the branch whose divisor is
 * largest, because the other three go singular at half-turns — and the poses
 * are all made of quarter- and half-turns, so those are not edge cases here.
 */
export function quaternionOf([a, b, c]) {
  const m = [[a[0], b[0], c[0]], [a[1], b[1], c[1]], [a[2], b[2], c[2]]];
  const trace = m[0][0] + m[1][1] + m[2][2];
  const from = (s, w, x, y, z) => new CANNON.Quaternion(x / s, y / s, z / s, w / s);
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return from(s, 0.25 * s * s, m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]);
  }
  const d = [m[0][0], m[1][1], m[2][2]].indexOf(Math.max(m[0][0], m[1][1], m[2][2]));
  const [i, j, k] = [d, (d + 1) % 3, (d + 2) % 3];
  const s = Math.sqrt(1 + m[i][i] - m[j][j] - m[k][k]) * 2;
  const q = [];
  q[i] = 0.25 * s * s;
  q[j] = m[j][i] + m[i][j];
  q[k] = m[k][i] + m[i][k];
  return from(s, m[k][j] - m[j][k], q[0], q[1], q[2]);
}

/** A cannon quaternion as a rotation basis, which is what `rotate` takes. */
export function basisOf({ x, y, z, w }) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)],
  ];
}

/** Has this body stopped moving? A settled pile needs no more frames drawn. */
export const isAsleep = body => body.sleepState === CANNON.Body.SLEEPING;

// ---- The world ------------------------------------------------------------

/** One placed piece as a rigid body, standing where the layout put it. */
function bodyFor({ cell, type, pose }) {
  const centroid = CENTROID[type];
  const basis = poseRotation(pose);
  const body = new CANNON.Body({
    mass: MASS[type],
    // The mesh is drawn about the centre of mass, so the body has to stand where
    // that point is: the cell's origin, plus the centroid turned into the pose.
    position: vec(add(toWorld(cell), through(basis, centroid))),
    quaternion: quaternionOf(basis),
    sleepSpeedLimit: SLEEP_SPEED,
    sleepTimeLimit: SLEEP_TIME,
  });
  for (const box of BOXES[type]) {
    body.addShape(
      new CANNON.Box(vec(box.half)),
      vec(sub(box.centre, centroid)),
      box.basis ? quaternionOf(box.basis) : undefined);
  }
  return body;
}

/**
 * A world holding one body per cube, and a floor `drop` cubes below the lowest
 * one. The pieces start exactly where the layout puts them — the drop is a
 * lower floor, not a lifted track, so every position here is still the layout's
 * own and the first frame drawn is the track as the solver found it.
 *
 * A crossed cross appears in the route twice but is one cube, so revisits are
 * dropped, exactly as the renderer drops them.
 */
export function createWorld(pieces, { drop = 3 } = {}) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, -GRAVITY) });
  world.allowSleep = true;                          // so a settled pile can stop the clock
  world.solver.iterations = 12;                     // stacked boxes need the extra passes
  world.defaultContactMaterial.friction = 0.45;     // plastic on plastic: it should not skate
  world.defaultContactMaterial.restitution = 0.05;  // and it should not bounce

  const cells = pieces.flatMap(p => p.material);
  const floorZ = Math.min(...cells.map(c => c[1])) * CUBE - CUBE / 2 - drop * CUBE;
  world.addBody(new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),   // cannon's plane faces up already, and is infinite
    position: new CANNON.Vec3(0, 0, floorZ),
  }));

  const bodies = pieces.filter(p => !p.revisit).map(piece => {
    const body = bodyFor(piece);
    world.addBody(body);
    return { piece, body };
  });

  return {
    floorZ,
    bodies,
    // A fixed 60 Hz tick with catch-up, so the pile does not depend on the frame
    // rate: at a sub-step per frame a slow frame is a deeper interpenetration,
    // which is how boxes end up shot through each other.
    step: dt => world.step(1 / 60, dt, 4),
    settled: () => bodies.every(({ body }) => isAsleep(body)),
  };
}
