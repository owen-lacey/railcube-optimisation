// Vector helpers and the one place the project's frame is mapped onto PolyCSS's.
//
// Axis mapping: project (x=right, y=up, z=forwards) → PolyCSS (X=right,
// Y=forwards, Z=up). Grid placement: PolyCSS position = cell × CUBE.

import { CUBE } from './dimensions.js';

/** World (PolyCSS) direction of each project-frame letter. */
export const DIR = {
  U: [0, 0, 1], D: [0, 0, -1],
  F: [0, 1, 0], B: [0, -1, 0],
  R: [1, 0, 0], L: [-1, 0, 0],
};

export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const sub = (a, b) => a.map((v, k) => v - b[k]);
export const add = (a, b) => a.map((v, k) => v + b[k]);
export const len = a => Math.hypot(...a);
export const unit = a => { const n = len(a); return a.map(v => v / n); };

/** project cell → PolyCSS position. */
export const toWorld = ([x, y, z]) => [x * CUBE, z * CUBE, y * CUBE];

// Pieces are authored in the canonical pose (rail on top face, heading
// forwards). The rotation maps local up onto the pose's face direction and
// local forwards onto its heading; the third axis follows from
// right-handedness.
export function poseRotation(pose) {
  const [face, heading] = [DIR[pose[0]], DIR[pose[1]]];
  if (face.some((v, k) => Math.abs(v) === Math.abs(heading[k]) && v !== 0)) {
    throw new Error(`invalid pose ${pose}: heading must be perpendicular to face`);
  }
  return [cross(heading, face), heading, face]; // images of local X, Y (forwards), Z (up)
}

/**
 * A turn of `degrees` about `axis`, as a rotation basis. Rodrigues' formula,
 * written out columnwise because that is the form `rotate` and `compose` take:
 * column c is the image of local axis c.
 *
 * The poses are all made of quarter- and half-turns, so this is not what puts a
 * piece in its place — it is for turns that are not: the tilt a piece carries
 * while it flies into position, and the arbitrary orientations the rotation test
 * checks `polyRotation` against.
 */
export function axisAngle(axis, degrees) {
  const [x, y, z] = unit(axis);
  const t = degrees * Math.PI / 180;
  const c = Math.cos(t), s = Math.sin(t), d = 1 - c;
  return [
    [c + x * x * d, x * y * d + z * s, x * z * d - y * s],
    [x * y * d - z * s, c + y * y * d, y * z * d + x * s],
    [x * z * d + y * s, y * z * d - x * s, c + z * z * d],
  ];
}

/** The basis of A·B, from the bases of A and B. */
export const compose = (a, b) =>
  [0, 1, 2].map(c => [0, 1, 2].map(r => [0, 1, 2].reduce((sum, k) => sum + a[k][r] * b[c][k], 0)));

/** The basis of the inverse rotation, which for a rotation is the transpose. */
export const transpose = basis => [0, 1, 2].map(c => [0, 1, 2].map(r => basis[r][c]));

/**
 * Part-way from one orientation to another, along the shortest arc: `t` of 0 is
 * `from`, 1 is `to`, and the turn between them is spent at a constant rate.
 *
 * `axisAngle` covers a turn whose axis is *known* — the tilt a piece carries as
 * it slides into place is about its own right, and that is written down. This
 * covers the case where it is not: a cube being picked up off the floor starts
 * at whatever orientation it fell into, so the axis has to be read back out of
 * the difference between the two.
 *
 * Every rotation is a turn about some axis (Euler), and for a basis that axis is
 * the eigenvector with eigenvalue 1. Reading it off the antisymmetric part is
 * the cheap way to get it, and it is exactly the way that fails at a half-turn,
 * where the antisymmetric part vanishes — so that gets the symmetric branch
 * below rather than a fudge. Same care as `polyRotation`'s clamped `asin`, and
 * for the same reason: the poses here are made of quarter- and half-turns, so
 * the awkward cases are the common ones and not edge cases at all.
 */
export function turnToward(from, to, t) {
  const d = compose(to, transpose(from));   // the turn still to be made, in world terms
  const trace = d[0][0] + d[1][1] + d[2][2];
  const cos = Math.max(-1, Math.min(1, (trace - 1) / 2));
  const angle = Math.acos(cos);
  if (angle < 1e-9) return from;            // nothing to turn, and so no axis to turn about
  // basis[c][r] is row r of column c, so d[1][2] is row 2 of column 1 — i.e. the
  // matrix entry m(2,1). The antisymmetric part is 2·sin(angle) times the axis.
  const skew = [d[1][2] - d[2][1], d[2][0] - d[0][2], d[0][1] - d[1][0]];
  const axis = len(skew) > 1e-6
    ? unit(skew)
    // A half-turn: the antisymmetric part is zero and the axis has to come from
    // the symmetric part instead. d + I is 2·(axis ⊗ axis) there, so its largest
    // column is the axis, up to a sign — and at exactly a half-turn the sign is
    // genuinely undetermined: turning either way is the same shortest arc and
    // ends in the same place, but goes round the other side on the way. The
    // largest column is picked because it is the best conditioned, so the choice
    // is arbitrary but stable rather than arbitrary and jumpy.
    : unit([0, 1, 2].reduce((best, c) => {
      const col = [0, 1, 2].map(r => d[c][r] + (c === r ? 1 : 0));
      return len(col) > len(best) ? col : best;
    }, [0, 0, 0]));
  return compose(axisAngle(axis, angle * t * 180 / Math.PI), from);
}

/**
 * A rotation basis as PolyCSS's `rotation` transform: three Euler angles in
 * degrees, which is the only shape `setTransform` accepts.
 *
 * Two conversions are stacked here, and both are facts about PolyCSS rather than
 * choices. First, `translate3d(y, x, z)` — the CSS frame is the world frame with
 * right and forwards swapped, so a world rotation appears there conjugated by
 * that swap. Second, the transform PolyCSS emits is
 * `rotateY(−r₀) rotateX(−r₁) rotateZ(−r₂)`, applied in that order, so the
 * decomposition has to be Y-X-Z and the angles come back negated. Both were read
 * off `buildPolyMeshTransform`, which the package exports, and the result is
 * checked against the string it emits rather than against this reasoning.
 *
 * In world terms the three angles turn out to be about right, about forwards and
 * about up, in that order.
 */
export function polyRotation(basis) {
  // basis[c][r] is row r of column c, so this is the same matrix with rows and
  // columns 0 and 1 exchanged — the conjugation by the swap.
  const swap = i => (i === 0 ? 1 : i === 1 ? 0 : 2);
  const m = (r, c) => basis[swap(c)][swap(r)];
  const deg = 180 / Math.PI;
  const sine = -m(1, 2);
  // Clamped because a rotation that is exactly square on can come out of the
  // physics as 1.0000000000000002, and `asin` of that is NaN — which would put
  // the piece nowhere at all rather than merely in the wrong place.
  const pitch = Math.asin(Math.max(-1, Math.min(1, sine))) * deg;
  // Square on, the first and third turns are about the same axis and only their
  // sum is determined, so all of it is given to the first.
  if (Math.abs(sine) > 1 - 1e-9) {
    return [-Math.atan2(-m(2, 0), m(0, 0)) * deg, -pitch, 0];
  }
  return [
    -Math.atan2(m(0, 2), m(2, 2)) * deg,
    -pitch,
    -Math.atan2(m(1, 0), m(1, 1)) * deg,
  ];
}

export const rotate = (polys, [mx, my, mz]) =>
  polys.map(p => ({ ...p, vertices: p.vertices.map(([x, y, z]) =>
    [x * mx[0] + y * my[0] + z * mz[0], x * mx[1] + y * my[1] + z * mz[1], x * mx[2] + y * my[2] + z * mz[2]]) }));

export const translate = (polys, [tx, ty, tz]) =>
  polys.map(p => ({ ...p, vertices: p.vertices.map(([x, y, z]) => [x + tx, y + ty, z + tz]) }));

/** Send a local direction or point through a pose's rotation (as `rotate` does). */
export const through = ([mx, my, mz], [x, y, z]) =>
  [0, 1, 2].map(k => x * mx[k] + y * my[k] + z * mz[k]);

/** Orient a polygon so its normal points away from the local origin. */
export const oriented = vs => {
  const [p, q, r] = vs;
  const u = q.map((v, k) => v - p[k]), w = r.map((v, k) => v - p[k]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const c = vs.reduce((acc, v) => acc.map((x, k) => x + v[k] / vs.length), [0, 0, 0]);
  return n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0 ? [...vs].reverse() : vs;
};

/**
 * Wind a hand-built polygon so its normal points along dir, for faces whose
 * normal direction `oriented`'s away-from-origin heuristic gets wrong — the
 * inward-facing channel walls, mostly.
 */
export const windToward = (vs, dir) => {
  const [p, q, r] = vs;
  const u = q.map((v, k) => v - p[k]), w = r.map((v, k) => v - p[k]);
  const n = cross(u, w);
  return n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0 ? [...vs].reverse() : vs;
};
