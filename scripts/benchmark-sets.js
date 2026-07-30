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
// Speed is now traced rather than sampled: one solve reports every incumbent through
// `onSolution`, with the solver's own wall time, so the (time, score) curve comes out
// of a single run. It used to take one run per deadline to guess at the same shape.
//
// `--hint=<shape>` starts the search from a known layout. Measured on the browser's
// build over the model's 18-cube set: unhinted, the first layout arrives at 29.3s and
// the proof at 36.8s; hinted from the 26-point inversion loop, 2.4s and 14.0s.
//
// Nothing here trusts the solver's own account of a route. Every number in the
// flavour columns is computed from the route chained back through src/track.js.

import { readFileSync } from 'node:fs';
import { solveTrack } from '../src/solver/index.js';
import { routeOf, shapeOf } from '../src/layouts.js';
import { chainTrack, SCORES } from '../src/track.js';

const POOL_LETTER = {
  straight: 'S', cross: 'X', leftCurve: 'L',
  rightCurve: 'R', insideCurve: 'I', outsideCurve: 'O',
};
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

/**
 * One solve, with the whole improving curve recorded as it happens.
 *
 * This used to be several solves at different deadlines, sampling the curve at a few
 * points, because there was no way to see inside a solve. `onSolution` reports every
 * incumbent with the solver's own wall time, so one run now yields the trace the
 * deadline slices were approximating — and yields it in the time of the longest slice
 * rather than the sum of all of them.
 */
const run = async (set, maxTimeInSeconds, hint) => {
  const started = process.hrtime.bigint();
  const trace = [];
  const result = await solveTrack({
    steps: total(set), box: 6, minY: 0, exclude: ['cross'], inventory: set,
    objective: 'maximiseScore', symmetryBreaking: true, maxTimeInSeconds, hint,
    onSolution: ({ seconds, score, route }) => trace.push({ seconds, score, route }),
  });
  return { ...result, trace, seconds: Number(process.hrtime.bigint() - started) / 1e9 };
};

const arg = (name, fallback) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const REPS = Number(arg('reps', 1));
const PROVE_CAP = Number(arg('prove-cap', 180));
// A layout to start each solve from, as a shape string — `--hint=LIRIROSOLORLLSORII`.
// Only sound for a candidate that can actually build it, so this is left off by
// default: the ladder's whole point is that the sets differ.
const HINT = arg('hint', null);
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
// One run per candidate, capped at PROVE_CAP, with every improving solution recorded
// as the solver finds it. This used to be four solves at four deadlines, sampling the
// curve because there was no way to watch one solve; cpsat-js 1.2.0's onSolution
// reports incumbents with the solver's own wall clock, so the curve is now traced.
console.log(`Tracing every incumbent of one solve per candidate, capped at ${PROVE_CAP}s, `
  + `${REPS} rep(s).`);
if (HINT) console.log(`Hinted from ${HINT} — only meaningful for sets that can build it.`);
console.log(`Ladder: ${LADDER}.\n`);

for (const set of CANDIDATES) {
  const held = total(set);
  const inventory = Object.entries(set)
    .filter(([, n]) => n > 0).map(([pool, n]) => `${POOL_LETTER[pool]}${n}`).join(' ');
  console.log(`── ${held} cubes  ${inventory}`);

  for (let rep = 0; rep < REPS; rep++) {
    const solved = await run(set, PROVE_CAP, HINT ? routeOf(HINT) : undefined);

    // The curve, as the solver walked it. Each entry is re-flavoured from its own
    // route, so "how good was it at four seconds" is answerable without a second run.
    if (!solved.trace.length) {
      console.log(`   no solution at all within ${PROVE_CAP}s (${solved.status})`);
    }
    for (const step of solved.trace) {
      const f = flavour(step.route);
      console.log(`   ${step.seconds.toFixed(1).padStart(6)}s  ${String(f.score).padStart(3)} pts  `
        + `${f.cubes}/${held} cubes, ${f.faces} faces, ${f.span}, `
        + `${f.turnShare}% turns${f.inverts ? ', inverts' : ''}`);
    }

    if (solved.status === 'OPTIMAL' && solved.route) {
      const f = flavour(solved.route);
      console.log(`   PROVED optimal in ${solved.seconds.toFixed(1)}s: ${f.score} pts, `
        + `${f.cubes}/${held} cubes`);
      console.log(`          ${shapeOf(solved.route)}`);
      // The disqualifier worth shouting about: fast to solve because there is
      // nothing to solve. A set whose best answer leaves half itself in the box is
      // the wrong set however good the timing looks.
      if (f.cubes < held * 0.8) {
        console.log(`   !! DEGENERATE — the optimum leaves ${held - f.cubes} of ${held} `
          + 'cubes in the box');
      }
    } else if (solved.status === 'INFEASIBLE') {
      console.log('   !! INFEASIBLE — this set cannot close a loop at all');
    } else {
      console.log(`   not proved within ${PROVE_CAP}s (${solved.status})`);
    }
  }
  console.log('');
}
