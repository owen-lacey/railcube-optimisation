// A track rearranged by carrying each cube straight over to its new slot.
//
// The plainest way of getting from one layout to the next, and a sibling of the
// tumble: the cubes are still matched by piece ID (see `identify` in
// src/layouts.js), so the second left curve of the old shape *is* the second left
// curve of the new one. But nothing falls. Every cube the two layouts share is
// lifted from where it stands and arced over to where it goes, all at once, turning
// into its new pose on the way — the pick-up's flight from `build.js`. A cube the
// new layout has no slot for fades out where it stands; a slot with no cube on the
// stage is filled by one coming in from beyond the nearest edge of the picture.
//
// Cubes that all go by the same turn and the same shift are a stretch of track
// moved whole, and they are carried as one, keeping their shape the whole way,
// straight to where they go. A stretch with a cube that stays where it is — only
// turned — is turning about that cube, and turns in place about it rather than
// being lifted.

import { CUBE } from './dimensions.js';
import { cubePosition, poseRotation, compose, transpose, through, turnToward, add, sub } from './vec.js';
import { comAt } from '../shapes.js';
import { identify } from '../../../../src/layouts.js';
import { carryTo, claim, restsAt } from './build.js';

export const MOVE = 0.7;   // seconds every flight and every fade takes, at speed 1
export const TURN = MOVE;  // seconds a whole track takes to turn about its origin cube, at speed 1
// How far clear of the picture's edge an arrival sets off, in world units: a cube
// and its neighbour, so no part of a piece is on screen at the start.
const CLEAR = 2 * CUBE;
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const SLACK = 1e-6;

const clamp = t => Math.max(0, Math.min(1, t));
const smooth = s => { const t = clamp(s); return t * t * (3 - 2 * t); };

/** The turn and shift that take a cube from where it is to its slot. */
function motionOf({ cube, slot }) {
  const turn = compose(slot.basis, transpose(cube.basis));
  return { turn, shift: sub(slot.position, through(turn, cube.position)) };
}

/** The flights split into stretches that move whole: one turn and shift each. */
function stretchesOf(flights) {
  const byMotion = new Map();
  for (const flight of flights) {
    const { turn, shift } = motionOf(flight);
    const key = [...turn.flat(), ...shift].map(v => Math.round(v * 1e3) || 0).join();
    byMotion.set(key, [...(byMotion.get(key) ?? []), flight]);
  }
  return [...byMotion.values()];
}

/**
 * A stretch, ready to move about its pivot: a cube of it that stays where it is,
 * which it turns about in place (`spin`), or else the centre of its cubes' masses,
 * which it is carried about.
 */
function carried(flights) {
  const { turn, shift } = motionOf(flights[0]);
  const still = flights.find(({ cube, slot }) => sub(cube.position, slot.position).every(v => Math.abs(v) < SLACK));
  const coms = flights.map(({ cube, slot }) => comAt(slot.type, cube.basis, cube.position));
  const pivot = still?.cube.position ?? [0, 1, 2].map(k => coms.reduce((sum, c) => sum + c[k], 0) / coms.length);
  return {
    members: flights.map(({ cube, slot }) => ({ cube, slot, basis: cube.basis, offset: sub(cube.position, pivot) })),
    pivot,
    turn,
    to: add(through(turn, pivot), shift),
    spin: Boolean(still),
  };
}

/** A stretch turned about its still cube, in place: `turnPhase`'s turn, about that cube. */
function spinTo({ members, pivot, turn }, s) {
  const now = turnToward(IDENTITY, turn, smooth(s));
  for (const { cube, offset, basis } of members) cube.place(compose(now, basis), add(pivot, through(now, offset)));
}

/**
 * Carry the cubes on the stage to `pieces`' slots.
 *
 * `leaving` is the cubes the new layout has no slot for, already detached from the
 * stage (see `stage.detach`), so their IDs are free. They fade out in place and
 * this phase disposes them — at the end of the fade, or at once if it is itself
 * replaced first.
 *
 * `frame` is the camera description being moved to: a cube not on the stage sets
 * off from beyond the edge of that picture nearest its slot (see `stage.offscreen`).
 *
 * A cube already exactly home is left alone: not a single write.
 */
export function movePhase(stage, pieces, { leaving = [], frame, speed = 1 } = {}) {
  const seconds = MOVE / speed;
  const ids = identify(pieces);
  const flights = pieces.filter(p => !p.revisit).map((piece, i) => ({
    id: ids[i], type: piece.type, color: piece.color,
    basis: poseRotation(piece.pose), position: cubePosition(piece),
  })).filter(slot => !restsAt(stage.cubes.get(slot.id), slot)).map(slot => ({
    slot,
    cube: stage.held(slot.id)
      ? claim(stage, slot)
      : stage.cube(slot.id, { ...slot, position: stage.offscreen(slot.position, frame, CLEAR) }),
  }));
  const stretches = stretchesOf(flights).map(carried);
  let fading = leaving;

  return {
    advance(_, elapsed) {
      // Nothing to carry and nothing to fade: the same layout, shown again.
      if (!flights.length && !fading.length) return false;
      const s = elapsed / seconds;
      if (s >= 1) {
        for (const { cube, slot } of flights) cube.place(slot.basis, slot.position);   // home, exactly
        for (const cube of fading) cube.dispose();
        fading = [];
        return false;
      }
      for (const stretch of stretches) (stretch.spin ? spinTo : carryTo)(stretch, s);
      for (const cube of fading) cube.fade(1 - smooth(s));
      return undefined;
    },
    dispose() {
      for (const cube of fading) cube.dispose();
      fading = [];
    },
  };
}

/**
 * Turn the track standing on the stage into `pieces`, about the origin cube.
 *
 * For the same track entered in another orientation: the start cube is always the
 * origin, so the new layout is the old one turned about that cube's centre, world
 * `[0, 0, 0]`. Every cube is on the stage already and they all turn as one, along
 * the shortest arc — a cube caught part-way through an earlier turn included,
 * since that is a turn about the origin too. Anything else is not a turn, and
 * throws.
 */
export function turnPhase(stage, pieces, { speed = 1 } = {}) {
  const seconds = TURN / speed;
  const ids = identify(pieces);
  const turning = pieces.filter(p => !p.revisit).map((piece, i) => {
    const cube = stage.cubes.get(ids[i]);
    if (!cube) throw new Error(`turnPhase: ${ids[i]} is not on the stage`);
    return { cube, basis: cube.basis, position: cube.position, slot: { basis: poseRotation(piece.pose), position: cubePosition(piece) } };
  });
  const turn = turning.length ? compose(turning[0].slot.basis, transpose(turning[0].basis)) : IDENTITY;
  for (const { cube, basis, position, slot } of turning) {
    const off = [
      ...compose(turn, basis).flatMap((col, c) => col.map((v, r) => v - slot.basis[c][r])),
      ...sub(through(turn, position), slot.position),
    ];
    if (off.some(v => Math.abs(v) > SLACK)) throw new Error(`turnPhase: ${cube.id} is not turned about the origin with the rest`);
  }

  return {
    advance(_, elapsed) {
      const s = elapsed / seconds;
      if (s >= 1) {
        for (const { cube, slot } of turning) cube.place(slot.basis, slot.position);   // home, exactly
        return false;
      }
      const now = turnToward(IDENTITY, turn, smooth(s));
      for (const { cube, basis, position } of turning) cube.place(compose(now, basis), through(now, position));
      return undefined;
    },
  };
}
