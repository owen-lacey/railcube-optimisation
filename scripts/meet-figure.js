// Write the data the meet-in-the-middle figure draws: one layout of the crossed
// sweep, read from its cross and cut into the four segments `meet.py` joins.
//
//   node scripts/meet-figure.js --id 7932037
//   --out <path>   another file (default site/src/lib/data/meet-figure.json)
//   --seed <n>     the decoys' draw (default 1)
//
// The layout is read from the sample the site carries, so this needs no database.
// It is turned to start at the X whose loop is the shorter (the first X on a tie),
// so the route is `X · A · X · B`, loop A first. Each loop is cut down the middle,
// the X in the first segment. A loop's heading is where the chain leaves the train
// as it comes back to the cross, read off the model rather than written here.
//
// Each loop's second segment comes with three decoys: random walks of its length,
// grown on from everything before it as `meet.py`'s `sample_half` grows a walk —
// each piece drawn uniformly from those that fit — and kept only if they collide
// with nothing, stay on the floor and miss the cross's pose — but only just, ending
// within `NEAR` cubes of it, counted along the axes. So a decoy is a near miss, and
// fails for the pose alone. Loop A's are also kept within the box's inventory, joined to the
// first segment. Loop B's are capped only on their own, as `meet.py` caps a half,
// so joined to the ¾ of the track before them they may overspend.

import { readFileSync, writeFileSync } from 'node:fs';

import { chainOpen, chainTrack, cubeOf, overflowingPoolByType, startCell } from '../src/track.js';
import { routeOf } from '../src/layouts.js';
import { random } from './sweep-data.js';

const SAMPLE = 'site/src/lib/data/sweep-crossed.json';
const OUT = 'site/src/lib/data/meet-figure.json';

/** Every reading of `shape` that starts at a cross, with its first loop's length. */
const readings = shape => [...shape].flatMap((letter, i) => {
  if (letter !== 'X') return [];
  const reading = shape.slice(i) + shape.slice(0, i);
  return [{ reading, loop: reading.indexOf('X', 1) }];
});

/** A loop cut down the middle, the extra piece of an odd one in the first segment. */
const halves = loop => [loop.slice(0, Math.ceil(loop.length / 2)), loop.slice(Math.ceil(loop.length / 2))];

/** Where `letters` leave the train, from DF. */
const headingOf = letters => chainOpen(routeOf(letters)).head.pose;

// The pieces a decoy is drawn from: every cube but the cross, which only leads a loop.
const KINDS = ['S', 'L', 'R', 'I', 'O'];

/** Whether `letters` chain with no fault and every cube on the floor. */
const laid = letters => {
  const { placed, faults } = chainOpen(routeOf(letters));
  return faults.length === 0 && placed.every(p => p.material.every(c => c[1] >= 0));
};

/** Whether `letters` stay within `inventory`. Route entries, so a crossed X counts twice. */
const within = (letters, inventory) => overflowingPoolByType(routeOf(letters), inventory) === null;

/** Whether `letters` come back to the cross in `heading`. */
// How many cubes from the cross, counted along the axes, a decoy may end: the cube
// its end's callout reads, under the train, against the cross at the origin.
const NEAR = 4;

// How many of their seven positions any two of loop A's decoys differ in, so none
// looks like another. Loop B's need only differ.
const APART = 5;

/** How many cubes from the cross, counted along the axes, `letters` end. */
const offBy = letters => {
  const { head } = chainOpen(routeOf(letters));
  return cubeOf(head.cell, head.pose).reduce((sum, v) => sum + Math.abs(v), 0);
};

const meets = (letters, heading) => {
  const { head } = chainOpen(routeOf(letters));
  return head.pose === heading && head.cell.every((v, k) => v === startCell('DF')[k]);
};

/** One walk of `n` pieces, each drawn from those `fits` takes; null at a dead end. */
function walk(n, fits, rand) {
  let letters = '';
  for (let i = 0; i < n; i++) {
    const order = [...KINDS];
    for (let j = order.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [order[j], order[k]] = [order[k], order[j]];
    }
    const next = order.find(kind => fits(letters + kind));
    if (!next) return null;
    letters += next;
  }
  return letters;
}

/** How many positions two walks of one length differ in. */
const differ = (p, q) => [...p].filter((letter, i) => letter !== q[i]).length;

/**
 * Three walks the length of `segment`, each taken by `fits`, that on from `before`
 * miss `heading`, but within `NEAR`; any two differ in at least `apart` positions.
 */
function decoysFor(before, segment, heading, fits, seed, { apart = 1 } = {}) {
  const rand = random(seed);
  const decoys = [];
  while (decoys.length < 3) {
    const letters = walk(segment.length, fits, rand);
    if (letters && letters !== segment && decoys.every(decoy => differ(decoy, letters) >= apart)
      && !meets(before + letters, heading) && offBy(before + letters) <= NEAR) {
      decoys.push(letters);
    }
  }
  return decoys;
}

/** The figure's data for the layout `id` of the crossed sample, its decoys drawn by `seed`. */
export function meetFigure(id, seed) {
  const sample = JSON.parse(readFileSync(SAMPLE, 'utf8'));
  const row = sample.shapes.find(s => s.id === id);
  if (!row) throw new Error(`row ${id} is not in ${SAMPLE}`);
  const [{ reading, loop }] = readings(row.shape).sort((p, q) => p.loop - q.loop);
  chainTrack(routeOf(reading));
  const [a, b] = [reading.slice(0, loop), reading.slice(loop)];
  const { inventory } = sample.question;
  const [first, second] = halves(a);
  const heading = headingOf(a);
  const [third, last] = halves(b);
  const before = a + third;
  return {
    generatedBy: 'scripts/meet-figure.js',
    id,
    seed,
    shape: row.shape,
    reading,
    a: {
      segments: [first, second],
      heading,
      decoys: decoysFor(first, second, heading, letters => laid(first + letters) && within(first + letters, inventory), seed, { apart: APART }),
    },
    b: {
      segments: [third, last],
      heading: headingOf(reading),
      decoys: decoysFor(before, last, 'DF', letters => laid(before + letters) && within(letters, inventory), seed),
    },
  };
}

function main(argv) {
  const flag = name => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const id = Number(flag('id'));
  if (!Number.isInteger(id)) throw new Error('--id <row> is required');
  const seed = Number(flag('seed') ?? 1);
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');
  const out = flag('out') ?? OUT;
  writeFileSync(out, `${JSON.stringify(meetFigure(id, seed), null, 2)}\n`);
  console.log(`wrote ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
