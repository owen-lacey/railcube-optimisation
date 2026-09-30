// The blueprint: a sheet of dots behind a viewer, filling it edge to edge, so it is
// plain where the part of the page that can be handled begins and ends.
//
// It is the sheet of a drawing app rather than a floor in the scene. It lies flat on
// the screen, so no angle of the camera can lose it, and it is a CSS background on
// the viewer — nothing in the scene draws it. But it is not static: it follows the
// camera's zoom and pan, which is what makes it read as the thing being handled. It
// ignores the orbit, as a sheet of paper would.
//
// A floor of dots fixed to the world was built first and replaced: seen side-on it
// is a line, so the one view that most needs the boundary shown had none.

import { Vector3 } from 'three';
import { CUBE } from './dimensions.js';

const point = new Vector3();

/**
 * Where the sheet sits, for a camera applied as `shot` (see `applied` in camera.js)
 * with `offset` the hand-moved pan, on a `width`×`height` viewer.
 *
 * `spacing` is one cell's edge in CSS pixels, so the dots spread as the camera zooms
 * in. `x`, `y` is the canvas pixel that one dot is pinned to: the frame's own target,
 * the one point a pan moves and an orbit does not.
 */
export function backdropOf(camera, shot, offset, width, height) {
  const target = String(shot.target).split(',').map(Number);
  point.set(...target.map((v, a) => v - offset[a])).project(camera);
  return {
    spacing: shot.zoom * CUBE,
    x: (point.x + 1) / 2 * width,
    y: (1 - point.y) / 2 * height,
  };
}
