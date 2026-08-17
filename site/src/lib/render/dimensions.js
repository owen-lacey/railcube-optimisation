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

// A piece that cannot go where it has been asked to go, pulsing between these two
// until it is taken away again.
//
// It has to leave its own colour entirely rather than being tinted, because one of
// the six *is* a red — an outside curve shifted from #ef6461 to another red would
// read as nothing at all. Alternating a dark red with a pale one is unmistakable on
// all six, and is not a colour any legal piece can be.
export const ALARM = '#dc2626';
export const ALARM_FLASH = '#fca5a5';
export const ALARM_PERIOD = 0.9;  // seconds for a full dark-pale-dark cycle

// The one light rig, shared by every viewer so there is a single number to tune.
//
// PolyCSS shades a face `base × (ambient + directional × max(0, n·L̂)) / π`, in
// linear space (`Fs`/`nr` in @layoutit/polycss-core). The π is the part worth
// knowing: a face only reaches its own colour when the bracket reaches π ≈ 3.14,
// so the obvious-looking `directional 1, ambient 0.5` renders every piece at
// half its swatch — measured, 0.42–0.66× across a whole layout. That reads as
// "lit object" on a dark page and as "dark object" on a white one.
//
// These are set for a light page: the bracket reaches 2.74 on the faces pointing
// most nearly at the light and 1.0 on the ones facing away, so a layout lands at
// roughly 0.6–0.95× its swatch with the shading still visible. Contrast is what
// the ratio between the two costs, and it is the thing to trade, not the sum.
export const LIGHT = {
  direction: '0.5,-0.7,0.6',
  directional: 2.6,
  ambient: 1,
};
