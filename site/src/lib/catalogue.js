// The piece catalogue as the reader meets it: colour, letter code, and what the
// piece does to the train. Everything here is condensed from docs/pieces.md and
// docs/coordinates.md, in the same vocabulary those use — up/down, left/right,
// forwards/backwards, never coordinates.

import { COLORS } from './render/dimensions.js';
import { step, startCell } from '../../../src/track.js';

export const PIECES = [
  {
    type: 'straight',
    name: 'Straight',
    colour: 'yellow',
    letter: 'S',
    starter: 15,
    effect: 'Nothing — the train passes straight through.',
    detail: 'The rail runs in a straight line across one face, edge to edge. The set also '
      + 'ships one white start cube, geometrically the same piece, which marks where a track '
      + 'is read from.',
  },
  {
    type: 'leftCurve',
    name: 'Left curve',
    colour: 'green',
    letter: 'L',
    starter: 4,
    effect: 'A 90° turn to the left, in the plane the train is already riding in.',
    detail: 'Not a cube but a quarter of a donut, sweeping through a 2×2 block of cells. Four '
      + 'of them click into a free-standing ring.',
  },
  {
    type: 'rightCurve',
    name: 'Right curve',
    colour: 'blue',
    letter: 'R',
    starter: 4,
    effect: 'A 90° turn to the right — the mirror image of the green one.',
    detail: 'Green and blue are mirror images and are not interchangeable: they are two '
      + 'separate allowances of four, not one shared allowance of eight. Assuming otherwise '
      + 'once cost the model a wrong answer — a layout that spent six right curves and two '
      + 'left ones, which the real set cannot build.',
  },
  {
    type: 'insideCurve',
    name: 'Inside curve',
    colour: 'orange',
    letter: 'I',
    starter: 4,
    effect: 'A 90° turn out of the surface, valley-style — the inside of a corner.',
    detail: 'The same quarter-arc shape stood in a vertical plane, rail on the concave face. '
      + 'The train turns through the inside of the bend like the bottom of a skate ramp, and '
      + 'four of them make a full vertical loop with the train hanging upside down at the top.',
  },
  {
    type: 'outsideCurve',
    name: 'Outside curve',
    colour: 'red',
    letter: 'O',
    starter: 4,
    effect: 'A 90° turn out of the surface, crest-style — over the brow of a hill.',
    detail: 'A single cube with the rail wrapping convexly around one edge. It makes no '
      + 'forwards progress at all: the next cube clicks in directly underneath. The train '
      + 'rides the outside of this corner, so the bend can hug one cube, where the inside '
      + 'curve needs a wide arc for the train to fit through.',
  },
  {
    type: 'cross',
    name: 'Cross',
    colour: 'purple',
    letter: 'X',
    starter: 0,
    effect: 'Nothing — but the track can pass through the same cube twice.',
    detail: 'Two rails crossing at right angles on one face. A crossing, not a junction: the '
      + 'train cannot choose a branch, it carries on along whichever rail it entered on. The '
      + 'starter set has none; the deluxe set has two.',
  },
].map(p => ({ ...p, hex: COLORS[p.type] }));

// ---- What a piece does to the train, in words -------------------------------

// The order a move is read out in, and the word for each way round.
const AXES = [
  { axis: 2, more: 'forwards', less: 'backwards' },
  { axis: 0, more: 'right', less: 'left' },
  { axis: 1, more: 'up', less: 'down' },
];
const FACING = { L: 'left', R: 'right', U: 'upwards', D: 'downwards', B: 'backwards' };

/**
 * What one piece does to the train, entered at the start pose: how far it moves
 * between riding over the piece and riding over the next one, and which way it
 * faces afterwards if that has changed. Read off the model, never written out.
 */
export function describeMove(type) {
  const before = { cell: startCell('DF'), pose: 'DF' };
  const after = step(before.cell, before.pose, type);
  const [from, to] = [before.cell, after.cell];
  const moved = AXES
    .map(({ axis, more, less }) => ({ n: to[axis] - from[axis], more, less }))
    .filter(({ n }) => n !== 0)
    .map(({ n, more, less }) => `${Math.abs(n)} ${n > 0 ? more : less}`);
  const facing = after.pose[1] === 'F' ? '' : `, facing ${FACING[after.pose[1]]}`;
  return `Train moves ${moved.join(' and ')}${facing}`;
}

// ---- A pose, in words -------------------------------------------------------

// A face is named by the way it points, so the front face is the far one.
const FACE_WORD = { U: 'up', D: 'down', L: 'left', R: 'right', F: 'front', B: 'back' };
const HEADING_WORD = { U: 'up', D: 'down', L: 'left', R: 'right', F: 'forwards', B: 'backwards' };

/** A pose as the post words it: `DL` is "on the down face, heading left (DL)". */
export const describePose = pose =>
  `on the ${FACE_WORD[pose[0]]} face, heading ${HEADING_WORD[pose[1]]} (${pose})`;
