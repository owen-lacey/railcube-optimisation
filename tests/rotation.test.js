// The two bits of the renderer's rotation arithmetic that have to be exactly
// right and cannot be eyeballed: `polyRotation`, and `turnToward`.
//
// `polyRotation` — the conversion from a rotation to the three Euler angles
// PolyCSS's `setTransform` accepts — checked against what PolyCSS actually emits.
//
// This is the one piece of the renderer that has to be exactly right and cannot
// be eyeballed. Everything that moves goes through it: the tumbler turns a
// falling cube with it, the builder turns an arriving one, and a wrong sign in
// any of the three angles produces an animation that looks entirely plausible
// and is wrong — pieces spinning the other way, or about the wrong axis, on
// layouts nobody has memorised. It was verified once by a scratch script that no
// longer exists, which is the situation this file fixes.
//
// The check is not against the reasoning in `vec.js`'s comment; it is against the
// string `buildPolyMeshTransform` emits, which is the only thing that actually
// decides where a piece appears. Two facts about PolyCSS are being asserted along
// with the arithmetic:
//
//   - the emitted order is `rotateY rotateX rotateZ`, so the decomposition has to
//     be Y-X-Z (the test fails loudly if a future version reorders them);
//   - the CSS frame is the world frame with right and forwards swapped, because
//     the same call emits `translate3d(y, x, z)` — so a world rotation appears
//     there conjugated by that swap.
//
// `@layoutit/polycss` is a runtime dependency and this import needs no DOM, so
// this belongs in the fast tier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPolyMeshTransform } from '@layoutit/polycss';
import { DIR, axisAngle, compose, transpose, polyRotation, poseRotation, turnToward }
  from '../site/src/lib/render/vec.js';

const mul = (a, b) => a.map(row => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

// The rotation matrices of the CSS transforms spec, as written there.
const rad = d => d * Math.PI / 180;
const CSS_TURN = {
  X: a => [[1, 0, 0], [0, Math.cos(rad(a)), -Math.sin(rad(a))], [0, Math.sin(rad(a)), Math.cos(rad(a))]],
  Y: a => [[Math.cos(rad(a)), 0, Math.sin(rad(a))], [0, 1, 0], [-Math.sin(rad(a)), 0, Math.cos(rad(a))]],
  Z: a => [[Math.cos(rad(a)), -Math.sin(rad(a)), 0], [Math.sin(rad(a)), Math.cos(rad(a)), 0], [0, 0, 1]],
};

/**
 * The rotation PolyCSS really applies, composed from the transform string it
 * emits for a given `rotation` triple. CSS transform functions multiply left to
 * right, so the reduce below is the whole of the composition rule.
 *
 * A zero angle is left out of the string altogether, and a transform with nothing
 * in it at all comes back `undefined` rather than empty — which is not a special
 * case to work around but the thing that makes a landed piece cost nothing: the
 * builder's arrivals end on the identity, and the identity emits no transform.
 */
function emitted(rotation) {
  const css = buildPolyMeshTransform({ position: [0, 0, 0], rotation }) ?? '';
  const turns = [...css.matchAll(/rotate([XYZ])\((-?[\d.]+(?:e-?\d+)?)deg\)/g)]
    .map(([, axis, deg]) => [axis, Number(deg)]);
  return {
    order: turns.map(([axis]) => axis).join(''),
    matrix: turns.reduce((acc, [axis, deg]) => mul(acc, CSS_TURN[axis](deg)), IDENTITY),
  };
}

/** A basis holds the images of local right/forwards/up as columns. */
const matrixOf = basis => [0, 1, 2].map(r => [0, 1, 2].map(c => basis[c][r]));

/** Conjugation by the right↔forwards swap: how a world rotation reads in CSS. */
const SWAP = [[0, 1, 0], [1, 0, 0], [0, 0, 1]];
const asCss = matrix => mul(mul(SWAP, matrix), SWAP);

const errorOf = (a, b) => Math.max(...a.flat().map((v, i) => Math.abs(v - b.flat()[i])));

/** How far PolyCSS's own transform is from the rotation it was asked for. */
function misplacement(basis) {
  const { order, matrix } = emitted(polyRotation(basis));
  // Whichever turns are present must come in Y-X-Z order — the decomposition in
  // `polyRotation` is only correct for that order, so a future version of PolyCSS
  // reordering them has to fail here rather than quietly mis-orient every piece.
  const expected = [...'YXZ'].filter(axis => order.includes(axis)).join('');
  assert.equal(order, expected, 'PolyCSS no longer emits its rotations in Y-X-Z order');
  return errorOf(matrix, asCss(matrixOf(basis)));
}

// The measured worst over everything below is 2.2e-14 — floating point noise
// through three trig calls a side and two matrix products, and nothing more. The
// budget is two orders of magnitude above that, which is loose enough never to be
// flaky and tight enough that no real error could slip under it: the smallest
// mistake worth catching is a sign, and a sign is O(1).
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

test('the 24 poses survive the round trip', () => {
  const poses = POSES;
  assert.equal(poses.length, 24);
  for (const pose of poses) {
    // Every pose is made of quarter- and half-turns, so between them these take
    // the singular branch of the decomposition — where the first and third turns
    // are about the same axis and only their sum is determined. That branch is
    // unreachable from random orientations, which is why the poses are checked
    // separately rather than folded into the sweep below.
    assert.ok(misplacement(poseRotation(pose)) < TOLERANCE, `pose ${pose}`);
  }
});

test('so do arbitrary orientations', () => {
  const next = orientations(20260804);
  let worst = 0;
  for (let i = 0; i < 20000; i++) worst = Math.max(worst, misplacement(next()));
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
  const from = poseRotation('UF');
  const to = poseRotation('DF');   // a half-turn about forwards
  assert.ok(Math.abs(angleBetween(from, to) - 180) < 1e-9, 'not actually a half-turn');
  const half = turnToward(from, to, 0.5);
  for (let i = 0; i < 5; i++) {
    assert.ok(gap(turnToward(from, to, 0.5), half) < TOLERANCE, 'the axis moved');
  }
});
