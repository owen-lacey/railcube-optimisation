// The rules for clicking a track together, shared by every builder: which letters
// are pieces, how a starting shape is cleaned, what adding and removing a piece
// do, and which keys do them. Each takes the orientation the track starts in.

import { openScene } from './scenes.js';
import { PIECES } from './catalogue.js';
import { chainOpen } from '../../../src/track.js';
import { routeOf } from '../../../src/layouts.js';

// Sketch's limit, for the same reason: past anything the toy can build.
export const LIMIT = 40;
const LETTERS = PIECES.map(p => p.letter).join('');
// The d-pad: forwards, left and right as the train sees them, since that is the
// way the curves turn.
const ARROWS = { ArrowUp: 'S', ArrowLeft: 'L', ArrowRight: 'R' };

/**
 * A starting shape as a builder will hold it: only the six letters, and stopped
 * at the first piece the model rejects — which is kept, because it is the one
 * being complained about. Nothing after it could be built either.
 */
export function seed(text, startPose = 'DF') {
  const letters = [...String(text).toUpperCase()]
    .filter(l => LETTERS.includes(l))
    .slice(0, LIMIT)
    .join('');
  const fault = letters && openScene(letters, startPose).offender;
  return fault ? letters.slice(0, fault.index + 1) : letters;
}

/**
 * Does the head sit on a cross already laid, so that a cross now is the train
 * coming back over it? That pass places nothing, and there is only one piece it
 * could be, so a builder puts it down rather than asking for it.
 */
function meetsCross(letters, startPose) {
  const { placed, faults } = chainOpen(routeOf(letters + 'X'), startPose);
  return faults.length === 0 && placed.at(-1).revisit;
}

/** The letters with `letter` added, and the cross it leads back onto, if it does. */
export function added(letters, letter, startPose = 'DF') {
  const next = letters + letter;
  return next.length < LIMIT && meetsCross(next, startPose) ? next + 'X' : next;
}

/**
 * The letters with the last piece taken off. A cross that was put down for you
 * goes with the piece that led into it, otherwise the head would be left stranded
 * on a cross with no way on.
 */
export function removed(letters, startPose = 'DF') {
  const last = letters.length > 0
    && chainOpen(routeOf(letters), startPose).placed.at(-1).revisit;
  return letters.slice(0, last && letters.length > 1 ? -2 : -1);
}

/**
 * What a key does to a builder: a letter or an arrow adds a piece, Backspace takes
 * one off, and anything else — modified keys included — is not the builder's.
 */
export function keyAction(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === 'Backspace') return { remove: true };
  const letter = ARROWS[event.key] ?? event.key.toUpperCase();
  return letter.length === 1 && LETTERS.includes(letter) ? { add: letter } : null;
}

/**
 * How many of each piece type the letters have put down: the cubes, so a crossed
 * cross is one (its second pass places nothing, as `identify` counts it), and a
 * rejected piece is none, since it is not down.
 */
export function usedOf(letters, startPose = 'DF') {
  const { placed, faults } = chainOpen(routeOf(letters), startPose);
  const down = faults.length ? placed.slice(0, faults[0].index) : placed;
  const used = {};
  for (const { type, revisit } of down) {
    if (!revisit) used[type] = (used[type] ?? 0) + 1;
  }
  return used;
}

/** The letters of every piece type the letters have used all of the inventory's. */
export function spentOut(letters, inventory, startPose = 'DF') {
  const used = usedOf(letters, startPose);
  return new Set(PIECES
    .filter(p => (used[p.type] ?? 0) >= (inventory[p.type] ?? 0))
    .map(p => p.letter));
}
