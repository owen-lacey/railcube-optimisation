// A layout that is not a rearrangement of the last one: it fades in where it
// stands, a group at a time, after the last one has faded out where it stood.
//
// A piece's group is `piece.group` (0 unset), and groups come in in order, each
// once the one before is solid — so the two groups `apartScene` draws side by
// side come in left, then right. Nothing moves.

import { cubePosition, poseRotation } from './vec.js';
import { identify } from '../../../../src/layouts.js';

export const FADE_OUT = 0.3;   // seconds the old layout takes to go, at speed 1
export const FADE_IN = 0.35;   // seconds each group takes to come in, at speed 1

const clamp = t => Math.max(0, Math.min(1, t));
const smooth = s => { const t = clamp(s); return t * t * (3 - 2 * t); };

/**
 * Fade `leaving` out where it stands and dispose of it — at the end of the fade,
 * or at once if this phase is replaced first. The cubes are already detached from
 * the stage (see `stage.detach`), and each fades from however see-through it was.
 */
export function fadeOutPhase(leaving, { speed = 1 } = {}) {
  const seconds = FADE_OUT / speed;
  let fading = leaving.map(cube => ({ cube, from: cube.opacity }));
  const gone = () => {
    for (const { cube } of fading) cube.dispose();
    fading = [];
  };
  return {
    advance(_, elapsed) {
      const s = elapsed / seconds;
      if (s >= 1 || !fading.length) {
        gone();
        return false;
      }
      for (const { cube, from } of fading) cube.fade(from * (1 - smooth(s)));
      return undefined;
    },
    dispose: gone,
  };
}

/** Put `pieces`' cubes in their slots unseen, and fade them in a group at a time. */
export function fadeInPhase(stage, pieces, { speed = 1 } = {}) {
  const seconds = FADE_IN / speed;
  const ids = identify(pieces);
  const arrivals = pieces.filter(p => !p.revisit).map((piece, i) => {
    const cube = stage.cube(ids[i], {
      type: piece.type, color: piece.color, basis: poseRotation(piece.pose), position: cubePosition(piece),
    });
    cube.fade(0);
    return { cube, group: piece.group ?? 0 };
  });
  return {
    advance(_, elapsed) {
      const t = elapsed / seconds;
      for (const { cube, group } of arrivals) cube.fade(smooth(t - group));
      return arrivals.every(({ group }) => t - group >= 1) ? false : undefined;
    },
    // Cut short, whatever comes next takes over solid cubes.
    dispose() {
      for (const { cube } of arrivals) cube.fade(1);
    },
  };
}
