// The contract between a figure and whatever draws it.
//
// A figure (TrackFigure, TrainCoordinates, KnownTracks) draws through `Frame`,
// handing it a `view` — what to draw — and a `footer`, its caption and controls.
// Used on its own, the Frame is a card and a viewer of its own. Used as a scrolly
// section's step, it is hosted: the section owns the one viewer every step shares,
// and the Frame hands it the view and renders only the footer. So a figure is used
// the same way either side, and a section changes only the footer between steps.
//
// The host is found by context, under `HOST`, set by `FigureHost`.

/**
 * @typedef {object} FigureView
 * @property {string} shape  The layout, as letters.
 * @property {(letters: string) => object} [scene]  Letters → scene, from scenes.js.
 *   Unset, `layoutScene`.
 * @property {object | null} [train]  The train's callbacks, or null for none —
 *   see `train` in TrackViewer.
 * @property {boolean} [paused]  Hold the train where it is.
 */

/**
 * @typedef {object} FigureHostApi
 * @property {(view: FigureView, hasFooter: boolean) => void} show  Draw this, and
 *   say whether the figure has a footer to show under it.
 * @property {object | undefined} drawn  The scene being drawn, or undefined while
 *   there is none.
 */

export const HOST = Symbol('figure host');
