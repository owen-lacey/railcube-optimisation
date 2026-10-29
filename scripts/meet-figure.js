// Write the data the meet-in-the-middle figure draws: one layout of the crossed
// sweep, read from its cross and cut into the four segments `meet.py` joins.
//
//   node scripts/meet-figure.js --id 7932037
//   --out <path>   another file (default site/src/lib/data/meet-figure.json)
//
// The layout is read from the sample the site carries, so this needs no database.
// It is turned to start at the X whose loop is the shorter (the first X on a tie),
// so the route is `X · A · X · B`, loop A first. Each loop is cut down the middle,
// the X in the first segment. A loop's heading is where the chain leaves the train
// as it comes back to the cross, read off the model rather than written here.

import { readFileSync, writeFileSync } from 'node:fs';

import { chainOpen, chainTrack } from '../src/track.js';
import { routeOf } from '../src/layouts.js';

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

/** The figure's data for the layout `id` of the crossed sample. */
export function meetFigure(id) {
  const row = JSON.parse(readFileSync(SAMPLE, 'utf8')).shapes.find(s => s.id === id);
  if (!row) throw new Error(`row ${id} is not in ${SAMPLE}`);
  const [{ reading, loop }] = readings(row.shape).sort((p, q) => p.loop - q.loop);
  chainTrack(routeOf(reading));
  const [a, b] = [reading.slice(0, loop), reading.slice(loop)];
  return {
    generatedBy: 'scripts/meet-figure.js',
    id,
    shape: row.shape,
    reading,
    a: { segments: halves(a), heading: headingOf(a) },
    b: { segments: halves(b), heading: headingOf(reading) },
  };
}

function main(argv) {
  const flag = name => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const id = Number(flag('id'));
  if (!Number.isInteger(id)) throw new Error('--id <row> is required');
  const out = flag('out') ?? OUT;
  writeFileSync(out, `${JSON.stringify(meetFigure(id), null, 2)}\n`);
  console.log(`wrote ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
