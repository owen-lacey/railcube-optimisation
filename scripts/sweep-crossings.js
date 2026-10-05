/**
 * A long list of distinct crossed-cross layouts, recorded as JSON Lines.
 *
 *   node scripts/sweep-crossings.js --min-loop 10 --max 200
 *   node scripts/sweep-crossings.js --out sweep-crossed.jsonl --max 500
 *   node scripts/sweep-crossings.js --min-loop 10 --engine native
 *
 * Run as a ladder: one process per `--min-loop`, concurrently, each to its own
 * file (the default `--out` is named after it). A crossing splits the route into
 * two loops, and left free the solver closes nearly every one the smallest way it
 * is allowed — banning six just moved the pile-up to eight. So each rung asks for
 * the smaller loop to be at least k, and the pile-up lands on k instead of on
 * whatever is smallest. It is "at least", not "exactly": a rung may return larger
 * loops too, so two rungs' files can share shapes. Split `--workers` across the
 * rungs by hand; see the note on oversubscription below.
 *
 * Why this exists rather than `explore.py --random`: the Python explorer has no
 * crossing encoding at all, and this inventory *requires* a crossing. With 14
 * straights and 20 curves the straights-plus-uncrossed-crosses parity is even
 * only if the cross is traversed twice, so a 35-cube full spend is a 36-step
 * route with exactly one revisit. Asked for 35 steps, explore.py would prove
 * INFEASIBLE and be right to.
 *
 * Why no-good cuts rather than a random objective: `allSolutions` forbids the
 * exact selector assignment it just used and re-solves, so no layout can come
 * back twice — a random objective re-treads (see CLAUDE.md on `--random`). The
 * cost is that it is quadratic in solutions found, since every round adds a
 * clause, which is why `--max` exists.
 *
 * Why not `enumerateAllSolutions`, which would stream from one solve: measured,
 * it cannot do this instance. CP-SAT enumerates only on a single worker, and one
 * worker found nothing here in 300 s; at 8 workers cpsat-js returns
 * MODEL_INVALID because the portfolio and enumeration are incompatible.
 *
 * Every line is written from `onSolution` as its round completes, not collected
 * and dumped at the end, so a killed sweep keeps everything it had found. Each
 * one has already been through `chainTrack` — `solveTrack`'s own reporting
 * chains every incumbent before handing it over, so an illegal route throws
 * rather than reaching the file.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { chainTrack } from '../src/track.js';
import { solveTrack } from '../src/solver/index.js';
import { loopsOf, routeOf, shapeOf } from '../src/layouts.js';

/** Extents of the material, the same three numbers check-route.js reports. */
const spanOf = placed => {
  const cells = placed.flatMap(p => p.material);
  return [0, 1, 2]
    .map(a => Math.max(...cells.map(c => c[a])) - Math.min(...cells.map(c => c[a])) + 1)
    .join('x');
};

/** How far the material reaches from the origin — the solver's box measure. */
const boxOf = placed => Math.max(
  ...placed.flatMap(p => p.material).flatMap(c => c.map(Math.abs)));

const INVENTORY = {
  straight: 14, cross: 1,
  insideCurve: 8, outsideCurve: 4, leftCurve: 4, rightCurve: 4,
};
// The crossed cross is two steps and one cube, so the route is one longer than
// the inventory. Parity does the rest: 36 is even and 35 would not be.
const CUBES = Object.values(INVENTORY).reduce((a, b) => a + b, 0);
const STEPS = CUBES + 1;
const BOX = 8;  // box 6 found nothing in 240 s; box 8 proved optimal in 48 s

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

// The smaller of a crossing's two loops must be at least this many steps. Unset,
// nothing is bounded and the six-step figure eight XSLLLSX is almost all you get.
const minLoop = process.argv.includes('--min-loop') ? Number(arg('min-loop')) : null;
const out = arg('out', `sweep-crossed-${minLoop === null ? 'free' : `min${minLoop}`}.jsonl`);
const max = Number(arg('max', 0)) || Infinity;
const perSolve = Number(arg('time', 180));
// 6 rather than the default 8: this runs alongside another sweep on a 14-core
// box, and 8 + 8 oversubscribes badly enough to turn a 49 s solve into a
// 180 s timeout — measured. Still >= 6, which is what picks the full portfolio.
const workers = Number(arg('workers', 6));
// Sound only because left and right curve counts are equal, which they are at
// four each. It halves the search by fixing which handedness appears first; the
// mirror pass puts the other half back without solving for it.
const symmetry = !process.argv.includes('--no-symmetry');
// Which CP-SAT runs the model: cpsat-js, or native OR-Tools (see src/solver/native.js).
// It changes how fast layouts arrive, never which question they answer, so it is
// not in the fingerprint.
const engine = arg('engine', 'wasm');

// A sweep file holds one question. The fingerprint goes on every line so a file
// of two inventories — a file of incomparable layouts — is caught on sight.
const config = { inventory: INVENTORY, steps: STEPS, box: BOX, minY: 0,
                 startPose: 'DF', minLoopLength: minLoop };
const fingerprint = JSON.stringify(config);

const already = existsSync(out)
  ? readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
  : [];
for (const row of already) {
  if (JSON.stringify(row.config) !== fingerprint) {
    console.error(`${out} was recorded for a different question — use a new --out`);
    process.exit(1);
  }
}
if (already.length) console.log(`${out} holds ${already.length} layout(s); appending`);

console.log(`${CUBES} cubes over ${STEPS} steps  box ${BOX}  ${perSolve}s a solve`
  + `  ${workers} workers  ${engine}  max ${max === Infinity ? 'unbounded' : max}`
  + `  ${minLoop === null ? 'loops unbounded' : `smaller loop >= ${minLoop}`}`);

const shapes = new Set(already.map(r => r.shape));
const started = Date.now();
let written = already.length;

/**
 * The mirror of a shape, which is a legal track spending the same inventory.
 *
 * Reflection maps left curves to right ones and leaves every other piece alone,
 * so it stays affordable only because this inventory holds four of each — the
 * same condition `symmetryBreaking` needs, and the reason the two go together
 * here. Verified through `chainTrack` like anything else before it is recorded.
 *
 * Not to be confused with a cyclic shift of the route, which is *not* a new
 * layout: entering the same closed loop at a different piece describes the same
 * physical track, rotated in space. Those are excluded deliberately — a list
 * padded with them would be one track claiming to be thirty-six.
 */
const mirrorOf = shape => [...shape].map(l => ({ L: 'R', R: 'L' }[l] ?? l)).join('');

const write = (shape, mirrored, s) => {
  if (shapes.has(shape)) return;   // an incumbent can repeat within a round
  const pieces = chainTrack(routeOf(shape));   // never trust the solver's word
  const revisits = pieces.filter(p => p.revisit).length;
  shapes.add(shape);
  appendFileSync(out, `${JSON.stringify({
    shape,
    mirrored,
    score: s.score,
    cubes: pieces.length - revisits,
    revisits,
    span: spanOf(pieces),
    box: boxOf(pieces),
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    config,
  })}\n`);
  written += 1;
  console.log(`  ${String(written).padStart(4)}  ${((Date.now() - started) / 1000).toFixed(0)}s`
    + `  ${s.score} pts  ${revisits} revisit(s)  ${mirrored ? 'mirror ' : 'solved '}  ${shape}`);
};

// Each solved layout and its mirror. The mirror costs no search at all, which is
// what pays for `symmetryBreaking` cutting one handedness out of the model.
const record = s => {
  const shape = shapeOf(s.route);
  write(shape, false, s);
  write(mirrorOf(shape), true, s);
};

// A cold first dive is the expensive part, and it is worth avoiding: at this size
// the same question has come back OPTIMAL in 49 s and UNKNOWN at 180 s on
// different runs, which is the variance CLAUDE.md records for the 36-cube regime.
// So round one starts from a layout already known to be legal. Hints are advisory
// and cannot change what is feasible; and `allSolutions` calls `model.clearHints()`
// after the first cut, since from then on the hint points at a forbidden solution.
// Witnesses by the smaller of their two loops, because a hint has to satisfy the
// constraints or it is worse than none. The first came out of an earlier sweep
// with its passes twelve steps apart; the second is the tight figure eight
// itself. A rung above twelve has no witness and runs unhinted.
const WITNESSES = [
  'RLRXSLIOOLLOOISXIRIISSSISSSSISSSSSRI',    // smaller loop 12
  'RIISROLXSLLLSXSRIOSISIRSISSSOOSIISSS',    // smaller loop 6
];

/** The smaller of the two loops a crossing makes, off the chained route. */
const smallerLoop = shape => loopsOf(chainTrack(routeOf(shape)))[0];
const allows = shape => minLoop === null || smallerLoop(shape) >= minLoop;

// The symmetry break allows a right curve only after a left one, so a hint that
// meets a right curve first is asked for as its mirror: an equally good track,
// and the handedness the model has not forbidden.
const handed = shape => (symmetry && shape.indexOf('R') < shape.indexOf('L') ? mirrorOf(shape) : shape);

const given = arg('hint', null);
if (given !== null && !allows(given)) {
  console.error(`--hint has a loop of ${smallerLoop(given)}, below --min-loop ${minLoop}`);
  process.exit(1);
}
const HINT = given ?? WITNESSES.find(allows) ?? null;

try {
  const result = await solveTrack({
    steps: STEPS, box: BOX, minY: 0, inventory: INVENTORY,
    crossings: true, minCrossings: 1, fill: true,
    minLoopLength: minLoop,
    symmetryBreaking: symmetry,
    hint: HINT === null ? undefined : routeOf(handed(HINT)),
    allSolutions: true,
    maxSolutions: max === Infinity ? undefined : max,
    maxTimeInSeconds: perSolve,
    numWorkers: workers,
    engine,
    onSolution: record,
  });
  console.log(`status ${result.status}${result.truncated ? ' (truncated at --max)' : ''}`);
} catch (error) {
  // `allSolutions` throws when a round ends on anything but a solution or
  // INFEASIBLE — a per-solve timeout, typically. Everything found is already on
  // disk, so this is the end of the sweep rather than a lost run.
  console.log(`sweep ended: ${error.message}`);
}

console.log(`${written} distinct layout(s) in ${out}`
  + ` after ${((Date.now() - started) / 1000).toFixed(0)}s`);
