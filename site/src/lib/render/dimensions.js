// Every measurement the renderer works in, in scene units. One cube is CUBE
// units on a side, so a cell at [2, 0, 1] sits at 2·CUBE right and 1·CUBE
// forwards. Extracted verbatim from the old track-piece spike.

export const CUBE = 20;
export const BEVEL = 1.5;      // chamfer width on the cube bodies
export const CHANNEL_W = 7;    // width of the rail channel sunk into the face
export const CHANNEL_D = 2;    // channel depth; must exceed BEVEL or the wall polygons degenerate
export const METAL = '#aab2bf';

export const RAIL = CUBE / 2 - CHANNEL_D; // the metal strip: how high the wheels ride

// The train rides ON the track, not in it: only the wheels drop into the channel,
// and the body clears the cube's surface. Heights are measured up from the rail.
export const TRAIN_W = 11;            // wider than the channel — the body overhangs the groove
export const TRAIN_L = 14;            // shorter than a cube, so one loco reads as one piece
export const TRAIN_H = 8;
export const NOSE_L = 5;              // how much of the length the nose taper eats
export const TRAIN_BEVEL = 1;         // chamfer on the body's cross-section; degenerates at
                                      // half the smallest side, which is the narrow nose tip
export const TRAIN_CLEAR = 0.5;       // gap between the cube's surface and the body's underside
export const BODY_Z = CHANNEL_D + TRAIN_CLEAR; // underside height: clear of the surface above the rail
export const WHEEL_W = 5;             // narrower than the channel, so the wheels sit down in it
export const WHEEL_L = 3;
export const WHEEL_H = BODY_Z + 0.2;  // up to the body, overlapping it so no gap shows
export const WHEEL_INSET = 4;         // how far fore and aft of centre each wheel pair sits
export const TRAIN_COLOR = '#f8fafc';
export const WINDOW_COLOR = '#334155';
export const WHEEL_COLOR = '#3f4653';

export const SPEED = 40; // scene units per second — two cubes a second

// The piece colours are the physical set's colours (docs/pieces.md).
export const COLORS = {
  straight: '#ffd166',      // yellow
  cross: '#b48ce8',         // purple
  outsideCurve: '#ef6461',  // red
  leftCurve: '#6bbf59',     // green
  rightCurve: '#5b8def',    // blue
  insideCurve: '#f2933a',   // orange
};
export const START_COLOR = '#f8fafc'; // the one white cube the set ships with
