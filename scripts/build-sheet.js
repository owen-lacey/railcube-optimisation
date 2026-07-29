// Print a layout as something you can build from, one piece at a time.
//
//   npm run build-sheet -- 32
//   npm run build-sheet            (lists what there is)
//
// Everything is said the way docs/coordinates.md says it — up/down, left/right,
// forwards/backwards, and "rail on top, heading forwards". No coordinates: you
// are looking at a pile of plastic, not a spreadsheet.

import { LAYOUTS, routeOf } from '../src/layouts.js';
import { chainTrack, countPieces, POOLS } from '../src/track.js';

const COLOUR = {
  straight: 'yellow', leftCurve: 'green', rightCurve: 'blue',
  insideCurve: 'orange', outsideCurve: 'red', cross: 'purple',
};
const PIECE = {
  straight: 'straight', leftCurve: 'LEFT curve', rightCurve: 'RIGHT curve',
  insideCurve: 'inside curve', outsideCurve: 'outside curve', cross: 'cross',
};
const FACE = {
  U: 'on top', D: 'underneath', F: 'on the far side',
  B: 'on the near side', L: 'on the left side', R: 'on the right side',
};
const HEADING = { F: 'forwards', B: 'backwards', L: 'left', R: 'right', U: 'up', D: 'down' };

/** Where a cell is, counted in cubes from the white start cube. */
function where([x, y, z]) {
  const legs = [
    x && `${Math.abs(x)} ${x > 0 ? 'right' : 'left'}`,
    y && `${Math.abs(y)} ${y > 0 ? 'up' : 'down'}`,
    z && `${Math.abs(z)} ${z > 0 ? 'forwards' : 'back'}`,
  ].filter(Boolean);
  return legs.length ? legs.join(', ') : 'the start cube itself';
}

/** How much of the track has nothing underneath it — the model does not know about gravity. */
function unsupported(placed) {
  const cells = placed.flatMap(p => p.material);
  const solid = new Set(cells.map(c => c.join(',')));
  return {
    cubes: cells.length,
    tallest: Math.max(...cells.map(c => c[1])),
    grounded: cells.filter(c => c[1] === 0).length,
    floating: cells.filter(c => c[1] > 0 && !solid.has([c[0], c[1] - 1, c[2]].join(','))).length,
  };
}

function sheet(name) {
  const layout = LAYOUTS[name];
  if (!layout) throw new Error(`no layout called ${name} — try: ${Object.keys(LAYOUTS).join(', ')}`);

  const placed = chainTrack(routeOf(layout.shape));
  const spent = countPieces(placed);
  const held = layout.set;
  const shape = unsupported(placed);

  console.log(`\nRAIL CUBE — ${layout.note}`);
  console.log(`${'='.repeat(66)}\n`);
  // The layout carries its own inventory, so a sheet always reports the box it
  // was actually solved against — which for the historical answers is not the set
  // the model holds now.
  console.log(`From a box of ${Object.values(layout.set).reduce((a, b) => a + b, 0)} cubes.`,
    layout.proved ? 'Proved optimal.' : 'Best found in the time allowed, not proved optimal.');
  console.log(`${placed.filter(p => !p.revisit).length} cubes on the table,`,
    `${Object.values(held).reduce((a, b) => a + b, 0) - placed.filter(p => !p.revisit).length} left in the box.\n`);

  console.log('Pieces to dig out first:');
  for (const pool of POOLS) {
    if (spent[pool]) console.log(`  ${String(spent[pool]).padStart(2)} × ${PIECE[pool]} (${COLOUR[pool]})`);
  }

  console.log(`\nStanding room: ${shape.tallest + 1} cubes tall.`,
    `${shape.grounded} of its ${shape.cubes} cubes sit on the ground.`);
  if (shape.floating) {
    console.log(`  Careful: ${shape.floating} cubes have nothing directly beneath them. The`);
    console.log('  model does not know about gravity or support stands — you may need props.');
  }

  console.log('\nClick them together in this order. Each row says where the cube goes,');
  console.log('which of its faces carries the rail, and which way the train is going there.\n');
  console.log('   #  piece                      where                      rail            heading');
  console.log('  --- -------------------------- -------------------------- --------------- ---------');
  placed.forEach((p, i) => {
    const label = p.revisit
      ? `(the ${PIECE[p.type]} again — no new cube)`
      : `${PIECE[p.type]} (${COLOUR[p.type]})`;
    console.log(
      `  ${String(i + 1).padStart(3)} ${label.padEnd(26)} ${where(p.cell).padEnd(26)} `
      + `${FACE[p.pose[0]].padEnd(15)} ${HEADING[p.pose[1]]}`);
  });
  console.log('\nThe last piece closes the loop back onto the start cube.\n');
}

const [name] = process.argv.slice(2);
if (!name) {
  console.log('\nUsage: npm run build-sheet -- <layout>\n\nLayouts:');
  for (const [key, l] of Object.entries(LAYOUTS)) {
    const held = Object.values(l.set).reduce((a, b) => a + b, 0);
    console.log(`  ${key.padEnd(10)} ${l.note} (from ${held} cubes)`);
  }
  console.log();
} else {
  sheet(name);
}
