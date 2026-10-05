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
// offsets a piece claims, relative to its head (the train's cell), from cellsFor.
//
// `rotations[poseIndex]` is where that pose sends right, up and forwards — the
// three columns of its rotation, from poseLetters — for anything that composes or
// inverts motions rather than only stepping them (scripts/meet.py).
// `crossRevisits` is the poses whose pass over a cross placed in DF is its second
// rail, as isRevisit decides it. `startCells[poseIndex]` is where the train
// starts in that pose, from startCell: the start cube is the origin, so the
// train is one cell off it.
//
// `proj` is each direction letter's vector, for reading a floor's direction off
// a pose. `signs` is each metric's good end, and `combined[population]` the
// integer weights the combined objective uses, from src/metrics.js.

import {
  POSES, PIECE_TYPES, PROJ, SCORES, SET, cellsFor, cubeOf, isRevisit, poseLetters, startCell,
} from '../src/track.js';
import { transitionTable } from '../src/solver/transitions.js';
import { shapeOf } from '../src/layouts.js';
import { POPULATION_RANGES, SIGNS, combinedWeights } from '../src/metrics.js';

const rotation = pose => {
  const map = poseLetters(pose);
  return [PROJ[map.R], PROJ[map.U], PROJ[map.F]];
};

// A cross entered at DF from the head at the origin: its cube is the one below.
const crossInDF = new Map([[cubeOf([0, 0, 0], 'DF').join(','), { type: 'cross', pose: 'DF' }]]);

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
  rotations: POSES.map(rotation),
  startCells: POSES.map(startCell),
  proj: PROJ,
  signs: SIGNS,
  combined: Object.fromEntries(Object.entries(POPULATION_RANGES)
    .map(([name, ranges]) => [name, combinedWeights(ranges)])),
  crossRevisits: POSES.flatMap((pose, i) => (isRevisit('cross', [0, 0, 0], pose, crossInDF) ? [i] : [])),
}));
