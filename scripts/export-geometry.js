// Print the model's geometry as JSON, for solvers that live outside JavaScript.
//
//   node scripts/export-geometry.js
//
// scripts/explore.py runs this on every invocation and reads stdout, so there is
// no generated file to go stale: src/track.js stays the single source of truth
// and the Python model only indexes these tables, never re-derives them.
//
// The array orders are the encoding — a pose or piece type is its index in
// `poses`/`pieceTypes`, and `transitions` keeps transitionTable()'s pose-major,
// type-minor nesting. `cells[kind][poseIndex][typeIndex]` is the list of cell
// offsets a piece claims, relative to its head, from cellsFor.

import { POSES, PIECE_TYPES, SCORES, SET, cellsFor } from '../src/track.js';
import { transitionTable } from '../src/solver/transitions.js';
import { shapeOf } from '../src/layouts.js';

const cells = kind => POSES.map(pose =>
  PIECE_TYPES.map(type => cellsFor(type, pose, [0, 0, 0])[kind]));

console.log(JSON.stringify({
  poses: POSES,
  pieceTypes: PIECE_TYPES,
  scores: SCORES,
  letters: Object.fromEntries(PIECE_TYPES.map(t => [t, shapeOf([t])])),
  set: SET,
  transitions: transitionTable(),
  cells: { material: cells('material'), train: cells('train') },
}));
