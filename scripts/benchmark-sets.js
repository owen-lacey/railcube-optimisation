// Which set should the browser get? Measured, not guessed.
//
//   node --conditions=browser scripts/benchmark-sets.js
//
// The `--conditions=browser` flag matters more than anything else here. cpsat-js
// ships two WASM builds and its exports map sends Node to the threaded one; the
// flag makes Node resolve the `browser` condition instead, so this measures the
// exact binary a browser gets, single-threaded, with no change to src/solver.
// Benchmark without it and the numbers flatter the browser case badly.
//
// Two axes, because the choice is a trade-off and not a race:
//
//   speed   how good an answer arrives how fast, under a cap
//   flavour what that answer actually looks like — a set whose best layout is a
//           flat ring is a bad set however quickly it solves
//
// Nothing here trusts the solver's own account of a route. Every number in the
// flavour columns is computed from the route chained back through src/track.js.

import { readFileSync } from 'node:fs';
import { solveTrack } from '../src/solver/index.js';
import { chainTrack, SCORES } from '../src/track.js';

const LETTER = {
  straight: 'S', cross: 'X', leftCurve: 'L',
  rightCurve: 'R', insideCurve: 'I', outsideCurve: 'O',
};
const shape = route => route.map(t => LETTER[t]).join('');
const total = set => Object.values(set).reduce((a, b) => a + b, 0);

/**
 * Owen's own set with the cross taken out — the canonical set has no cross, so
 * neither does anything on this ladder.
 */
const BASE = {
  straight: 15, leftCurve: 4, rightCurve: 4, insideCurve: 8, outsideCurve: 4, cross: 0,
};

/**
 * The ladder: every pool scaled by one factor, so a candidate is a smaller
 * version of the real set rather than a different set with a different flavour.
 *
 * Two rules on top of the arithmetic. The two curve colours are forced equal,
 * because the mirror-symmetry break in the solver is only sound when they ship in
 * equal numbers. And no pool a loop needs is allowed to reach zero — which is
 * where a single scale factor starts to lie, since closure needs whole turns:
 * scaled far enough down the geometry, not the solver, becomes the binding
 * constraint. That is a finding to report, not a rounding to hide.
 */
const scaled = factor => {
  const at = n => Math.max(1, Math.round(n * factor));
  return {
    straight: at(BASE.straight),
    leftCurve: at(BASE.leftCurve),
    rightCurve: at(BASE.leftCurve),
    insideCurve: at(BASE.insideCurve),
    outsideCurve: at(BASE.outsideCurve),
    cross: 0,
  };
};

/**
 * Two ladders, because the first one answered a different question than intended.
 *
 * `proportional` scales every pool by one factor. Measured first, and it ruled
 * itself out: it is not size that binds, it is how many same-hand flat curves the
 * set has. A flat loop turns through a full circle, so it needs four turns of the
 * SAME handedness — and once the factor takes the colours down to two each, the
 * only loops left are vertical inside-curve rings. ×0.45 (two of each colour)
 * spent 6 of its 17 cubes; ×0.3 could not close at all.
 *
 * `curvesHeld` therefore keeps four of every curve — the smallest count that
 * closes freely in any plane — and varies the straights, which are the cheap
 * filler. Same total range, without the geometry doing the limiting.
 */
const curves = (each, straights) => straights.map(straight => ({
  straight, leftCurve: each, rightCurve: each, insideCurve: each, outsideCurve: each, cross: 0,
}));

const LADDERS = {
  proportional: [1, 0.8, 0.6, 0.45, 0.3].map(scaled),
  curvesHeld: curves(4, [12, 8, 4, 2, 0]),
  // Fewer curves, more straights: a set of pure elbows is no kind of Rail Cube
  // set, and the straight/curve weighting means nothing if there are no straights
  // to lose. The measurement to make is what that flavour costs in first-answer
  // time, which is the metric an anytime UI lives or dies on.
  curves3: curves(3, [4, 6, 8, 10]),
  curves2: curves(2, [8, 10, 12]),
};

/** What a solved layout is actually like. All of it read off the chained route. */
function flavour(route) {
  const placed = chainTrack(route);
  const cubes = placed.filter(p => !p.revisit);
  const cells = placed.flatMap(p => p.material);
  const span = [0, 1, 2].map(a =>
    Math.max(...cells.map(c => c[a])) - Math.min(...cells.map(c => c[a])) + 1);
  const turns = cubes.filter(p => p.type !== 'straight').length;
  return {
    cubes: cubes.length,
    score: cubes.reduce((n, p) => n + SCORES[p.type], 0),
    // Which faces the rail is mounted on: the best short proxy for "does this
    // layout use all three dimensions, or is it a tray".
    faces: new Set(placed.map(p => p.pose[0])).size,
    span: span.join('x'),
    climb: span[1],
    // A rail on a cube's underside means the train hangs below it, upside down —
    // the one trick the toy sells itself on.
    inverts: placed.some(p => p.pose[0] === 'D'),
    turnShare: Math.round((100 * turns) / cubes.length),
  };
}

const run = async (set, maxTimeInSeconds) => {
  const started = process.hrtime.bigint();
  const result = await solveTrack({
    steps: total(set), box: 6, minY: 0, exclude: ['cross'], inventory: set,
    objective: 'maximiseScore', symmetryBreaking: true, maxTimeInSeconds,
  });
  return { ...result, seconds: Number(process.hrtime.bigint() - started) / 1e9 };
};

const arg = (name, fallback) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const SLICES = arg('slices', '2,5,10,30').split(',').map(Number);
const REPS = Number(arg('reps', 2));
const PROVE_CAP = Number(arg('prove-cap', 180));
// More than one ladder at a time, so two flavours can be compared in one run
// under the same machine load.
const LADDER = arg('ladder', 'curvesHeld');
const CANDIDATES = LADDER.split(',').flatMap(name => {
  const found = LADDERS[name];
  if (!found) throw new Error(`unknown ladder ${name}, try ${Object.keys(LADDERS).join(', ')}`);
  return found;
});

const version = JSON.parse(
  readFileSync(new URL('../node_modules/cpsat-js/package.json', import.meta.url))).version;
const threaded = !process.execArgv.includes('--conditions=browser')
  && !(process.env.NODE_OPTIONS ?? '').includes('--conditions=browser');

console.log(`cpsat-js ${version}${threaded ? ' — THREADED BUILD' : ' — portable build'}`);
if (threaded) {
  console.log('!! Re-run with `node --conditions=browser` — these numbers are not the '
    + 'browser\'s.\n');
}
// Solution callbacks are what would turn the slice probes below into a real
// (time, score) curve. Until cpsat-js grows them, this samples the curve at a few
// points instead, and says so rather than presenting samples as a trace.
console.log(`Sampling best-score-by-deadline at ${SLICES.join('/')}s, ${REPS} rep(s) each. `
  + 'cpsat-js has no solution callback yet, so this is a sampled curve, not a traced one.');
console.log(`Then one run capped at ${PROVE_CAP}s to see whether optimality is provable.`);
console.log(`Ladder: ${LADDER}.\n`);

for (const set of CANDIDATES) {
  const held = total(set);
  const inventory = Object.entries(set)
    .filter(([, n]) => n > 0).map(([pool, n]) => `${LETTER[pool]}${n}`).join(' ');
  console.log(`── ${held} cubes  ${inventory}`);

  for (const cap of SLICES) {
    const scores = [];
    let example = null;
    for (let rep = 0; rep < REPS; rep++) {
      const result = await run(set, cap);
      if (result.route) {
        scores.push(result.score);
        example ??= result;
      } else {
        scores.push(null);
      }
    }
    const got = scores.map(s => (s === null ? '—' : s)).join('/');
    if (!example) {
      console.log(`   ${String(cap).padStart(3)}s  nothing found (${got})`);
      continue;
    }
    const f = flavour(example.route);
    console.log(`   ${String(cap).padStart(3)}s  score ${got}  best: ${f.score} pts, `
      + `${f.cubes}/${held} cubes, ${f.faces} faces, ${f.span}, `
      + `${f.turnShare}% turns${f.inverts ? ', inverts' : ''}  ${shape(example.route)}`);
  }

  const proved = await run(set, PROVE_CAP);
  if (proved.status === 'OPTIMAL' && proved.route) {
    const f = flavour(proved.route);
    console.log(`   PROVED optimal in ${proved.seconds.toFixed(1)}s: ${f.score} pts, `
      + `${f.cubes}/${held} cubes, ${f.faces} faces, ${f.span}, `
      + `${f.turnShare}% turns${f.inverts ? ', inverts' : ''}`);
    console.log(`          ${shape(proved.route)}`);
    // The disqualifier worth shouting about: fast to solve because there is
    // nothing to solve. A set whose best answer leaves half itself in the box is
    // the wrong set however good the timing looks.
    if (f.cubes < held * 0.8) {
      console.log(`   !! DEGENERATE — the optimum leaves ${held - f.cubes} of ${held} `
        + 'cubes in the box');
    }
  } else if (proved.status === 'INFEASIBLE') {
    console.log('   !! INFEASIBLE — this set cannot close a loop at all');
  } else {
    console.log(`   not proved within ${PROVE_CAP}s (${proved.status})`);
  }
  console.log('');
}
