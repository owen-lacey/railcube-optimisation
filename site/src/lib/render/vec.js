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
