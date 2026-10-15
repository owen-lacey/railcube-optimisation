// How a card grows to full screen and back (ExpandingCard), shared with anything
// that has to move in step with it — the stage, easing a track out from beside an
// overlay to the middle as the card grows.
import BezierEasing from 'bezier-easing';

/** Seconds the card takes to grow to full screen, or back. */
export const GROW = 0.38;

const CURVE = [0.2, 0, 0, 1];

/** The card's easing, as CSS. */
export const GROW_CSS = `cubic-bezier(${CURVE.join(', ')})`;

/** The card's easing, as a function of time 0–1. */
export const growEase = BezierEasing(...CURVE);
