// Known-good routes. A route is a list of piece types, unrolled by chainTrack —
// model data, not rendering, so the spike and the tests share these.

/**
 * A simple closed loop, flat on the ground: four straights up each long side,
 * one across each short side, a left curve at each corner. 14 pieces
 * (10 straight + 4 curve), inside the starter set. Long sides are four cubes so
 * a train has a real run before the first bend.
 */
export const loopRoute = [
  'straight', 'straight', 'straight', 'straight', 'leftCurve', // near side, then turn left
  'straight', 'leftCurve',                                     // far short side
  'straight', 'straight', 'straight', 'straight', 'leftCurve', // back down the far side
  'straight', 'leftCurve',                                     // near short side, closing on the start
];

/**
 * The complete tour: one closed loop that puts the rail on all six faces of a
 * cube, so the train runs along the top, climbs both side walls, crosses the
 * front and the back, and hangs upside down underneath. Reaching the left and
 * right faces is what forces the horizontal turns — a loop that only climbs and
 * inverts stays in a single vertical plane and can never touch more than four
 * faces. The rail visits the faces in this order:
 *
 *   U U U R U L L L B R R D D F
 *
 * 2 straights, 4 left curves, 4 inside curves and 4 outside curves: every inside
 * and every outside curve the starter set ships with. Found by exhaustive search
 * over the piece catalogue — no closed loop of fewer than 12 pieces reaches all
 * six faces at all, and of the 14-piece ones this is the most compact, 38 cubes
 * inside a 5×4×5 box.
 */
export const inversionRoute = [
  'straight', 'leftCurve', 'insideCurve',                  // along the ground, turn, climb
  'outsideCurve', 'outsideCurve', 'leftCurve',             // over the crest onto the left wall
  'straight', 'outsideCurve', 'outsideCurve', 'leftCurve', // across the back at ground level
  'insideCurve', 'leftCurve',                              // up again and over the top
  'insideCurve', 'insideCurve',                            // upside down, then down to the start
];
