// The move catalogue flattened for the solver: one row per (pose, piece type),
// 24 × 6 = 144 of them. Generated from MOVES via the same `step` the
// visualisation uses, so the table and the model can never drift apart.
//
// cpsat-js has no allowed-assignments constraint, so this is not fed to the
// solver as a table. Instead each step gets one boolean per row, exactly one of
// which is true, and the whole transition becomes a handful of plain linear
// equations over those booleans — see src/solver/index.js.

import { POSES, PIECE_TYPES, step } from '../track.js';

/**
 * Rows of `{ pose, type, dx, dy, dz, nextPose }`, where `pose`, `type` and
 * `nextPose` are indices into POSES and PIECE_TYPES.
 */
export function transitionTable() {
  return POSES.flatMap((pose, poseIndex) =>
    PIECE_TYPES.map((type, typeIndex) => {
      const head = step([0, 0, 0], pose, type);
      return {
        pose: poseIndex,
        type: typeIndex,
        dx: head.cell[0], dy: head.cell[1], dz: head.cell[2],
        nextPose: POSES.indexOf(head.pose),
      };
    }));
}
