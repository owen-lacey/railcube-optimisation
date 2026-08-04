// One piece, one mesh, and the two ways its orientation can be written.
//
// Extracted from `tumble.js`, which worked this out the hard way, because there
// are three viewers now and all three mount meshes: the track viewer, the
// tumbler and the builder.
//
// The choice is between putting an orientation in the *vertices* and putting it
// on the *container*:
//
// `bake` calls `setPolygons`, which rebuilds a `matrix3d` per polygon. A track
// piece is about 110 polygons, so eighteen of them is two thousand matrices, and
// at that rate the frame rate visibly collapses — measured, having first shipped
// the tumbler that way. So `bake` is for orientations that will be *held*, not
// for orientations that change every frame.
//
// `place` calls `setTransform`, which writes one transform to one container
// element. It carries the difference between the orientation asked for and the
// one currently in the vertices, so it is cheap however far the piece has turned.
// The cost is lighting: PolyCSS shades each polygon from its normal, and a CSS
// rotation cannot recompute a normal, so a `place`d piece carries the lighting of
// its baked pose around with it. Bake at the orientation a piece will be looked
// at in, and the approximation only ever shows while it is moving.

import { rotate, compose, transpose, polyRotation } from './vec.js';

/** PolyCSS's `add` takes a loader result; hand-built geometry fakes one. */
export const meshLike = polygons => ({ polygons, objectUrls: [], warnings: [], dispose: () => {} });

/**
 * Mount `canonical` — polygons in the piece's own frame — at a world
 * orientation and position, and return the two ways of moving it afterwards.
 *
 * It goes up already rotated rather than mounted flat and then baked, so a piece
 * costs one `setPolygons` to appear rather than two.
 */
export function movingMesh(scene, canonical, basis, position) {
  const handle = scene.add(meshLike(rotate(canonical, basis)), {});
  handle.setTransform({ position, rotation: [0, 0, 0] });
  let inverse = transpose(basis);

  /** Write an orientation into the vertices. Expensive; re-lights the piece. */
  function bake(next, at) {
    handle.setPolygons(rotate(canonical, next), { stableDom: true });
    handle.setTransform({ position: at, rotation: [0, 0, 0] });
    inverse = transpose(next);
  }

  /** Write an orientation onto the container, as a delta from the baked one. */
  function place(next, at) {
    handle.setTransform({ position: at, rotation: polyRotation(compose(next, inverse)) });
  }

  // `handle` is exposed for the tests, which assert on what was actually drawn —
  // how many times a piece was baked, and that a picked-up cube is the same object
  // it was before it fell. Nothing in the renderer reaches for it.
  return { bake, place, handle, dispose: () => handle.dispose() };
}
