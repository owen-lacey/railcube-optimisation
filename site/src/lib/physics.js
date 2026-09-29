// The track falling apart: a cannon-es rigid-body world built from a chained
// route. Physics only — no PolyCSS, no DOM. `render/tumble.js` is the binding
// that draws what this works out.
//
// The collision shapes themselves are next door in `shapes.js`, because the
// renderer wants `CENTROID` out of them and does not want cannon in the bundle
// to get it. This file is the world: bodies, gravity, sleep, and the two
// conversions between cannon's quaternions and the renderer's bases.
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
import { cubePosition, poseRotation, through, add, sub } from './render/vec.js';
import { BOXES, MASS, CENTROID } from './shapes.js';

const GRAVITY = 900;      // scene units per second², ~9.8 m/s² with a cube as 22 cm

// When a body counts as having stopped, which is worth getting right because a
// sleeping body costs nothing to draw. cannon's default speed limit — a tenth of
// a unit per second — assumes a unit is a metre; here a unit is about a
// centimetre, so on that number a pile that has visibly finished falling is
// still creeping fast enough to stay awake for ever. The limit below is that
// default restated at this scale, and it was measured, not guessed: without it
// not one body of an 18-cube pile had slept after 30 simulated seconds.
const SLEEP_SPEED = CUBE / 10;  // two units a second, ~2 mm/s on a real cube
const SLEEP_TIME = 0.5;         // seconds spent below it before the body gives up

const vec = ([x, y, z]) => new CANNON.Vec3(x, y, z);

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
    // A body's position *is* its centre of mass, so it stands where that point
    // is: the cube's origin, plus the centroid turned into the pose. Drawing it
    // needs the inverse of this, which `originAt` in `shapes.js` is.
    position: vec(add(cubePosition({ cell, pose }), through(basis, centroid))),
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
    // Taking a body out of the world is how a piece gets *picked up* off the pile
    // rather than merely stopping being drawn: the rest of the pile has to stop
    // resting on something that is no longer there.
    remove: body => world.removeBody(body),
  };
}
