// The project's polygon lists as three.js meshes, and the one way a mesh is moved.
//
// Every geometry generator here (`pieces.js`, `train.js`, `grid.js`, `axes.js`)
// emits a list of polygons, `{ vertices, color }`, each wound so that its outward
// normal follows the right-hand rule. `soupGeometry` turns such a list into a
// non-indexed `BufferGeometry` with face normals and per-vertex colours, which is
// all a three material needs.
//
// A mesh is moved by writing its matrix, and nothing else. There used to be two
// ways, `bake` (an orientation in the vertices) and `place` (one on the container),
// because PolyCSS could not recompute a normal under a CSS rotation and re-baking
// was expensive. three rotates the normals with the matrix, so a piece is lit
// correctly in any orientation and one matrix write is the whole cost of moving it.

import { BufferGeometry, Color, Float32BufferAttribute, Matrix4, Mesh, Vector3 } from 'three';
import { GEOMETRY } from './pieces.js';
import { LIGHT } from './dimensions.js';
import { unit, cross, sub } from './vec.js';

const color = new Color();

/** A polygon's face normal, from its first three vertices. */
export function faceNormal([a, b, c]) {
  return unit(cross(sub(b, a), sub(c, a)));
}

/**
 * Fan-triangulate a polygon list into a non-indexed geometry with per-vertex
 * colours in linear space, which is what three's materials expect. `shade(poly,
 * normal, rgb)` may return a linear `[r, g, b]` to use instead of the polygon's own
 * colour — which is how the train's lighting is carried, see `carriedShade`.
 */
export function soupGeometry(polys, { fallback = '#3b82f6', shade = null } = {}) {
  const positions = [];
  const colors = [];
  for (const poly of polys) {
    const { vertices } = poly;
    color.set(poly.color ?? fallback);   // sRGB hex → linear, via three's colour management
    let rgb = [color.r, color.g, color.b];
    if (shade) rgb = shade(poly, faceNormal(vertices), rgb);
    for (let k = 1; k + 1 < vertices.length; k++) {
      for (const v of [vertices[0], vertices[k], vertices[k + 1]]) {
        positions.push(v[0], v[1], v[2]);
        colors.push(...rgb);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();   // non-indexed, so these are face normals
  return geometry;
}

/**
 * The lighting a polygon gets at the pose it was authored in, worked out once so
 * it can be carried: `base × (directional × max(0, n·L) + ambient) / π` in linear
 * space. That is three's Lambert term under the `LIGHT` rig exactly, so a mesh
 * pre-shaded by this and drawn unlit looks the same as a lit one *at that pose* —
 * and keeps looking that way however it turns afterwards.
 *
 * It is the train's. Under PolyCSS the train was moved without being re-lit, so it
 * carried the lighting of its authored pose round the whole lap, and that is the
 * picture being kept.
 */
const L = unit(LIGHT.direction.split(',').map(Number));
export function carriedShade(_poly, n, base) {
  const dot = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
  const bracket = (LIGHT.directional * dot + LIGHT.ambient) / Math.PI;
  return base.map(v => Math.min(1, v * bracket));
}

// One geometry per piece type and colour, shared by every mesh of that type on
// the page — which is also what makes a repaint free: it is a swap to another one.
const pieceGeometry = new Map();

/** The geometry of a `type` piece painted `hex`, authored about its own cube. */
export function geometryFor(type, hex) {
  const key = `${type}|${hex}`;
  if (!pieceGeometry.has(key)) pieceGeometry.set(key, soupGeometry(GEOMETRY[type](hex)));
  return pieceGeometry.get(key);
}

/** A rotation basis (the images of the local axes) and a position, as one matrix. */
export const basisMatrix = ([mx, my, mz], position, into = new Matrix4()) => into
  .makeBasis(new Vector3(...mx), new Vector3(...my), new Vector3(...mz))
  .setPosition(...position);

/**
 * Mount `geometry` in `scene` at a world orientation and position, and return the
 * way of moving it afterwards. `mesh` is the three.js object, which the tests
 * watch to count what is actually written to it.
 */
export function movingMesh(scene, geometry, material, basis, position) {
  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  basisMatrix(basis, position, mesh.matrix);
  mesh.matrixWorldNeedsUpdate = true;
  scene.add(mesh);

  return {
    mesh,
    place(next, at) {
      basisMatrix(next, at, mesh.matrix);
      mesh.matrixWorldNeedsUpdate = true;
    },
    /** Show a different geometry in the same place — a repaint, for a piece pointed at. */
    reshape(next) { mesh.geometry = next; },
    dispose() { mesh.removeFromParent(); },
  };
}
