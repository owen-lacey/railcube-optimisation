// The renderer's rotation arithmetic that has to be exactly right and cannot be
// eyeballed: how a basis goes onto a mesh, and `turnToward`.
//
// Everything that moves goes through the first: the tumbler turns a falling cube
// with it, the builder turns an arriving one, and a wrong sign produces an
// animation that looks entirely plausible and is wrong — pieces spinning the other
// way, or about the wrong axis, on layouts nobody has memorised. So it is checked
// against what three.js actually does with the matrix, a local axis sent through
// the mesh's world matrix, rather than against the reasoning in `meshes.js`.
//
// `three` is a runtime dependency and none of this needs a DOM, so this belongs in
// the fast tier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3 } from 'three';
import { DIR, axisAngle, compose, transpose, poseRotation, turnToward }
  from '../site/src/lib/render/vec.js';
import { movingMesh } from '../site/src/lib/render/meshes.js';

// Floating point noise through one matrix product is of order 1e-15. The budget is
// well above that, which is loose enough never to be flaky and tight enough that
// no real error could slip under it: the smallest mistake worth catching is a
// sign, and a sign is O(1).
const TOLERANCE = 1e-12;

const FACES = ['U', 'D', 'F', 'B', 'L', 'R'];
const POSES = FACES.flatMap(face => FACES
  .filter(h => DIR[h].every((v, k) => v === 0 || DIR[face][k] === 0))
  .map(heading => face + heading));

/**
 * A stream of arbitrary orientations, seeded so a failure is reproducible: an
 * intermittent rotation bug would be the worst kind to own. Three turns about
 * three random axes, so the orientations are not confined to any one plane or
 * family.
 */
function orientations(seed) {
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const spin = () => axisAngle([random() * 2 - 1, random() * 2 - 1, random() * 2 - 1],
    random() * 720 - 360);
  return () => compose(compose(spin(), spin()), spin());
}

/**
 * How far a mesh placed at `basis` and `position` is from putting each local axis
 * where the basis says: local right, forwards and up, sent through the mesh's
 * world matrix, against the basis's columns — and the local origin against the
 * position. A placement is written once at mount and then again by `place`, and
 * both are measured.
 */
function misplacement(basis, position) {
  const scene = new Scene();
  const moving = movingMesh(scene, undefined, undefined, poseRotation('DF'), [0, 0, 0]);
  const worst = mesh => {
    scene.updateMatrixWorld();   // what the renderer does before it draws
    const origin = new Vector3().applyMatrix4(mesh.matrixWorld);
    const axes = [0, 1, 2].map(k => {
      const local = new Vector3(...[0, 1, 2].map(i => (i === k ? 1 : 0))).applyMatrix4(mesh.matrixWorld);
      return local.sub(origin).toArray();
    });
    return Math.max(
      ...origin.toArray().map((v, k) => Math.abs(v - position[k])),
      ...axes.flatMap((axis, c) => axis.map((v, r) => Math.abs(v - basis[c][r]))),
    );
  };
  moving.place(basis, position);
  const placed = worst(moving.mesh);
  const mounted = worst(movingMesh(scene, undefined, undefined, basis, position).mesh);
  return Math.max(placed, mounted);
}

test('the 24 poses go onto a mesh as the rotations they name', () => {
  assert.equal(POSES.length, 24);
  for (const pose of POSES) {
    assert.ok(misplacement(poseRotation(pose), [20, -40, 60]) < TOLERANCE, `pose ${pose}`);
  }
});

test('so do arbitrary orientations', () => {
  const next = orientations(20260804);
  let worst = 0;
  for (let i = 0; i < 2000; i++) worst = Math.max(worst, misplacement(next(), [i, -i / 2, 3]));
  assert.ok(worst < TOLERANCE, `worst misplacement was ${worst}`);
});

// ---- turnToward ------------------------------------------------------------
//
// The shortest-arc interpolation a picked-up cube's lift is made of. It is the
// one place in the renderer that reads a turn's axis back *out* of a rotation
// rather than being handed it, and every property below is one a wrong reading
// would break while still producing a plausible-looking animation: a piece could
// arrive at the right pose having gone the long way round, or turn at an uneven
// rate, or — worst — come out of the interpolation not quite a rotation at all
// and be drawn sheared.

/** How far a basis is from being a rotation: orthonormal, and right-handed. */
function distortion(basis) {
  const identity = compose(transpose(basis), basis);
  return Math.max(...[0, 1, 2].flatMap(c =>
    [0, 1, 2].map(r => Math.abs(identity[c][r] - (c === r ? 1 : 0)))));
}

const gap = (a, b) => Math.max(...[0, 1, 2].flatMap(c =>
  [0, 1, 2].map(r => Math.abs(a[c][r] - b[c][r]))));

/**
 * How much slack an angle measured through `acos` needs, in degrees.
 *
 * `acos` is ill-conditioned where its argument is near ±1: acos(1 − ε) ≈ √(2ε),
 * so float noise of order 1e-16 in the trace comes out as ~1e-8 radians of angle
 * — a hundredth of a millionth of a degree. That is unavoidable and has nothing
 * to do with the rotation being right, and it bites at exactly the two ends of
 * every arc, where the angle from one end is near 0° or 180°. The budget below is
 * two orders of magnitude above that noise and several below any real error: a
 * misread axis or an uneven rate is wrong by degrees, not by millionths.
 */
const ANGLE_SLACK = 1e-4;

/** The turn between two orientations, in degrees. */
const angleBetween = (a, b) => {
  const d = compose(b, transpose(a));
  const trace = d[0][0] + d[1][1] + d[2][2];
  return Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))) * 180 / Math.PI;
};

/** Every property `turnToward` is supposed to have, over one pair. */
function checkArc(from, to, label) {
  assert.ok(gap(turnToward(from, to, 0), from) < TOLERANCE, `${label}: t=0 is not from`);
  assert.ok(gap(turnToward(from, to, 1), to) < TOLERANCE, `${label}: t=1 is not to`);

  const total = angleBetween(from, to);
  // The shortest arc: never more than a half-turn, whatever the two ends are.
  assert.ok(total <= 180 + 1e-9, `${label}: ${total}° is the long way round`);

  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const at = turnToward(from, to, t);
    assert.ok(distortion(at) < 1e-9, `${label}: t=${t} is not a rotation`);
    // A constant rate is what makes the easing in `build.js` mean anything: the
    // ease shapes the motion, and anything non-linear in here would shape it
    // again invisibly.
    assert.ok(Math.abs(angleBetween(from, at) - total * t) < ANGLE_SLACK,
      `${label}: t=${t} has turned ${angleBetween(from, at)}° of ${total}°`);
  }
}

test('turnToward interpolates between two poses', () => {
  // Pose to pose is the case the builder actually meets, and between them these
  // pairs cover both awkward branches: coincident orientations (no axis at all)
  // and half-turns (no axis from the antisymmetric part).
  for (const a of POSES) {
    for (const b of POSES) checkArc(poseRotation(a), poseRotation(b), `${a}→${b}`);
  }
});

test('turnToward interpolates between arbitrary orientations', () => {
  // Which is the case a cube picked up off the floor meets: it starts at whatever
  // the physics left it at, and nothing about that is a pose.
  const next = orientations(20260805);
  for (let i = 0; i < 400; i++) checkArc(next(), next(), `pair ${i}`);
});

test('turnToward turns a half-turn the same way every time', () => {
  // At exactly 180° the direction of travel is undetermined — both ways are the
  // same shortest arc — so the only thing worth asserting is that the choice does
  // not wobble. A pick-up that picked a different side each frame would tear.
  const from = poseRotation('DF');
  const to = poseRotation('UF');   // a half-turn about forwards
  assert.ok(Math.abs(angleBetween(from, to) - 180) < 1e-9, 'not actually a half-turn');
  const half = turnToward(from, to, 0.5);
  for (let i = 0; i < 5; i++) {
    assert.ok(gap(turnToward(from, to, 0.5), half) < TOLERANCE, 'the axis moved');
  }
});
