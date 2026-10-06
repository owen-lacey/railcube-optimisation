// The title's zoom: one shot turning into another while the box it fills on screen
// moves and grows. It is drawn on a canvas covering the whole screen, so nothing is
// clipped mid-turn, with the track pinned to where that box has got to.
//
// An end is `{ 'rot-x', 'rot-y', roll, target, perUnit, at }`: the angles, the world
// point in the middle of the box, CSS pixels a world unit, and where on screen the
// middle of the box is. `pinnedShot` in camera.js turns one into a description.

import { appliedZoom, CAMERA } from './camera.js';

const numbers = target => String(target).split(',').map(Number);

/**
 * The end a camera description makes, drawn in `rect`, a box on screen. What the
 * description does not name comes from `CAMERA`, as it does when a viewer draws it.
 */
export function endOf(description, { left, top, width, height }) {
  const camera = { ...CAMERA, ...description };
  return {
    'rot-x': Number(camera['rot-x']),
    'rot-y': Number(camera['rot-y']),
    roll: Number(camera.roll ?? 0),
    target: numbers(camera.target),
    perUnit: appliedZoom(camera.zoom, width, height),
    at: [left + width / 2, top + height / 2],
  };
}

/**
 * An end part-way from `from` to `to`, at `t` in 0..1: the turn the short way
 * round, the scale by equal ratios rather than equal steps, everything else straight.
 */
export function shotBetween(from, to, t) {
  const along = (a, b) => a + (b - a) * t;
  const turn = ((((to['rot-y'] - from['rot-y']) % 360) + 540) % 360) - 180;
  return {
    'rot-x': along(from['rot-x'], to['rot-x']),
    'rot-y': from['rot-y'] + turn * t,
    roll: along(from.roll, to.roll),
    target: from.target.map((v, a) => along(v, to.target[a])),
    perUnit: from.perUnit * (to.perUnit / from.perUnit) ** t,
    at: from.at.map((v, a) => along(v, to.at[a])),
  };
}
