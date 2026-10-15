// Candidate "is this a good track?" measures, read off a chained track.
//
// Under full spend SCORES is inert — every loop holds the same pieces — so only
// something that reads the arrangement can rank layouts. These are six such
// readings. None says which end is better; that is a choice made where they are
// used, not here.
//
// Everything is counted from `placed` (chainTrack's output) in plain JavaScript,
// never from a solver variable.

import { PROJ } from './track.js';

const UP = 1;

/** Material extent along each axis, in cells: [across, up, along]. */
export const spanOf = placed => {
  const cells = placed.flatMap(p => p.material);
  return [0, 1, 2].map(a =>
    Math.max(...cells.map(c => c[a])) - Math.min(...cells.map(c => c[a])) + 1);
};

/**
 * Steps that start three of a kind in a row, wrapping last → first because it is
 * a loop. A pair is free; a run of n costs n − 2. An `open` track — one still
 * being built — has no last → first, so nothing wraps.
 */
export const repeatsOf = (placed, { open = false } = {}) => placed.filter((p, i) =>
  (!open || i + 2 < placed.length)
  && p.type === placed[(i + 1) % placed.length].type
  && p.type === placed[(i + 2) % placed.length].type).length;

/**
 * The runs `repeatsOf` charges for: three or more of a kind in a row, wrapping
 * last → first, as `{ start, length }` in route order. A run that wraps starts
 * near the end. A loop all of one kind is one run, starting at 0.
 */
export const repeatRuns = placed => {
  const n = placed.length;
  const same = i => placed[i].type === placed[(i + n - 1) % n].type;
  const first = placed.findIndex((_, i) => !same(i));
  if (first === -1) return [{ start: 0, length: n }];
  const runs = [];
  for (let i = first; i < first + n;) {
    let length = 1;
    while (length < n && same((i + length) % n)) length += 1;
    if (length >= 3) runs.push({ start: i % n, length });
    i += length;
  }
  return runs;
};

/**
 * Steps the train rides face up, on top of a cube: its floor faces down. Read off
 * the floor's direction rather than its letter.
 */
const faceUpOf = placed => placed.filter(p => PROJ[p.pose[0]][UP] < 0).length;

/** Steps the train rides upside down, under a cube: its floor faces up. */
const ceilingOf = placed => placed.filter(p => PROJ[p.pose[0]][UP] > 0).length;

/**
 * The train's up coordinate summed over every step. A closed loop ends where it
 * starts, so reading the cell before each step or after it gives the same total.
 */
const heightOf = placed => placed.reduce((total, p) => total + p.cell[UP], 0);

/** The poses the train takes over these steps, each once. */
export const posesIn = placed => new Set(placed.map(p => p.pose));

/** How many of the 24 poses the train takes over the loop. */
export const posesOf = placed => posesIn(placed).size;

const FACE_STEPS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const keyOf = cell => cell.join(',');

/**
 * Close calls: the cells the train is in — every cell a piece books for it, and
 * the cell between each piece and the next — that share a face with material of
 * another piece. Not the piece being ridden, and not the ones either side of it
 * in the route, since those always touch the train at the joints. Both passes of
 * the cross are one piece, so it is the neighbour of four. Each cell counts once,
 * however often the train is in it.
 *
 * The inside curve's hollow is not counted: the train is in material there, and
 * nothing is said about where it is mid-piece.
 *
 * Neighbours wrap last → first, because it is a loop. An `open` track — one still
 * being built — has no last → first, so its ends are not neighbours.
 */
export function closeCallsOf(placed, { open = false } = {}) {
  const n = placed.length;
  const crosses = placed.flatMap((p, i) => (p.type === 'cross' ? [i] : []));
  const steps = i => (placed[i].type === 'cross' ? crosses : [i]);
  const owners = new Map();
  placed.forEach((p, i) => p.material.forEach(c => owners.set(keyOf(c), steps(i))));
  const riders = new Map();
  placed.forEach((p, i) => [p.cell, ...p.train].forEach(c => {
    const key = keyOf(c);
    if (!riders.has(key)) riders.set(key, { cell: c, at: new Set() });
    steps(i).forEach(j => riders.get(key).at.add(j));
  }));
  const apart = open
    ? (i, j) => Math.abs(i - j) > 1
    : (i, j) => Math.min((i - j + n) % n, (j - i + n) % n) > 1;
  return [...riders.values()].filter(({ cell, at }) => FACE_STEPS.some(d => {
    const owner = owners.get(keyOf(cell.map((v, k) => v + d[k])));
    return owner && owner.every(j => [...at].every(i => apart(i, j)));
  })).length;
}

export const METRICS = ['faces', 'volume', 'repeats', 'faceUp', 'ceiling', 'height'];

/**
 * The readings of one track. Every step counts, revisits included, where the
 * train is what is being measured (faces, repeats, faceUp); volume is
 * the material's.
 */
export function metricsOf(placed) {
  const span = spanOf(placed);
  return {
    faces: new Set(placed.map(p => p.pose[0])).size,
    volume: span[0] * span[1] * span[2],
    repeats: repeatsOf(placed),
    faceUp: faceUpOf(placed),
    ceiling: ceilingOf(placed),
    height: heightOf(placed),
  };
}

/**
 * Which end of each metric is the good one. The combination is the one place a
 * direction is needed, and this is the one place that says it.
 */
export const SIGNS = { faces: 1, volume: -1, repeats: -1, faceUp: -1, ceiling: 1, height: 1 };

/**
 * Each metric's [lo, hi] over a scored population, as `scripts/rank-scores.js`
 * printed them: `sweep28` is site/src/lib/data/sweep-28.json, `crossed` every row
 * of sweeps.db question 1. Measured, so a rescan that moves them moves these.
 * `crossedCeilingHeight` is the same rows, less those whose train goes below the
 * floor, and names only the pair, so its combination weighs only those two.
 */
export const POPULATION_RANGES = {
  sweep28: { faces: [3, 6], volume: [245, 1008], repeats: [0, 6], faceUp: [1, 19] },
  crossed: { faces: [2, 6], volume: [210, 1764], repeats: [0, 9], faceUp: [1, 27] },
  crossedCeilingHeight: { ceiling: [0, 27], height: [27, 226] },
};

/**
 * The equal-weighted combination of the metrics the ranges name: each rescaled to
 * 0–1 over the population and signed. A metric with no range adds nothing. A
 * track can score above 1 on a term, because the scale is the population's and a
 * solver can beat it.
 */
export const combinedOf = (metrics, ranges) => Object.keys(ranges).reduce((total, name) => {
  const [lo, hi] = ranges[name];
  return hi === lo ? total : total + SIGNS[name] * (metrics[name] - lo) / (hi - lo);
}, 0);

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * The same combination in integers, for a solver: multiplied through by the LCM
 * of the ranges, each metric's weight is sign × scale / range. The constant offset
 * (the lo terms) is dropped, so `combinedOf = (Σ weight·v − offset) / scale`.
 */
export function combinedWeights(ranges) {
  const names = Object.keys(ranges);
  const spans = names.map(name => ranges[name][1] - ranges[name][0]).filter(Boolean);
  const scale = spans.reduce((a, b) => a * b / gcd(a, b), 1);
  const weights = Object.fromEntries(names.map(name => {
    const span = ranges[name][1] - ranges[name][0];
    return [name, span ? SIGNS[name] * scale / span : 0];
  }));
  const offset = names.reduce((total, name) => total + weights[name] * ranges[name][0], 0);
  return { scale, weights, offset };
}
