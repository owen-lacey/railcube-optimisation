// Spike, not a feature: what does a solution hint buy, and how many optima are
// there? Delete this once cpsat-js grows a real hint API.
//
//   node scripts/hint-spike.js                      # 8 workers
//   node --conditions=browser scripts/hint-spike.js # the browser's 1 worker
//
// cpsat-js has no hint API, so this reaches around it rather than adding a
// workaround to src/. Two facts make it possible: solve() calls model.toProto(),
// and every variable carries the name it was created with into the proto. So we
// intercept toProto, look the selector booleans up BY NAME, and populate
// CpModelProto.solution_hint (field 6). Nothing in src/ changes.
//
// The hint message is built as a plain object with $typeName rather than through
// create(): protobuf-es v2 messages ARE plain objects, and cpsat-js's exports map
// blocks the deep import its schema would need.

import { CpModel } from 'cpsat-js';

import { solveTrack } from '../src/solver/index.js';
import { transitionTable } from '../src/solver/transitions.js';
import { POSES, PIECE_TYPES, SCORES, chainTrack } from '../src/track.js';

const LETTER = {
  straight: 'S', cross: 'X', leftCurve: 'L',
  rightCurve: 'R', insideCurve: 'I', outsideCurve: 'O',
};
const TYPE_OF = Object.fromEntries(Object.entries(LETTER).map(([t, l]) => [l, t]));
const shape = route => route.map(t => LETTER[t]).join('');
const routeOf = s => [...s].map(l => TYPE_OF[l]);
const total = set => Object.values(set).reduce((a, b) => a + b, 0);
const scoreOf = route => route.reduce((n, t) => n + SCORES[t], 0);

/**
 * The (variable name -> value) assignment a known route implies: which selector
 * is true at each step, and which steps are active at all.
 *
 * Partial on purpose — the false selectors are left unhinted, because
 * `sum(selectors) == active` propagates them to zero the moment the true one is
 * fixed. That is what a hint is for: name the decisions, let propagation do the
 * rest.
 */
function hintFor(route, steps, exclude = ['cross']) {
  const rows = transitionTable().filter(row => !exclude.includes(PIECE_TYPES[row.type]));
  const assignment = new Map();

  chainTrack(route).forEach((piece, i) => {
    const r = rows.findIndex(row =>
      POSES[row.pose] === piece.pose && PIECE_TYPES[row.type] === piece.type);
    if (r < 0) throw new Error(`no transition row for ${piece.type} at ${piece.pose}`);
    assignment.set(`sel_${i}_${r}`, 1);
    assignment.set(`active_${i}`, 1);
  });
  for (let i = route.length; i < steps; i++) assignment.set(`active_${i}`, 0);
  return assignment;
}

/** Patch toProto so the next solve carries this hint. Returns an undo. */
function withHint(assignment) {
  const original = CpModel.prototype.toProto;
  CpModel.prototype.toProto = function patched() {
    const proto = original.call(this);
    const vars = [], values = [];
    proto.variables.forEach((variable, index) => {
      if (assignment.has(variable.name)) {
        vars.push(index);
        values.push(BigInt(assignment.get(variable.name)));
      }
    });
    if (vars.length !== assignment.size) {
      throw new Error(`hinted ${vars.length} of ${assignment.size} named variables`);
    }
    proto.solutionHint = {
      $typeName: 'operations_research.sat.PartialVariableAssignment', vars, values,
    };
    return proto;
  };
  return () => { CpModel.prototype.toProto = original; };
}

const timed = async fn => {
  const started = process.hrtime.bigint();
  const result = await fn();
  return { ...result, seconds: Number(process.hrtime.bigint() - started) / 1e9 };
};

const SETS = {
  '16 pure curves': { straight: 0, leftCurve: 4, rightCurve: 4, insideCurve: 4, outsideCurve: 4, cross: 0 },
  '20 S8+3each': { straight: 8, leftCurve: 3, rightCurve: 3, insideCurve: 3, outsideCurve: 3, cross: 0 },
  '24 S8+4each': { straight: 8, leftCurve: 4, rightCurve: 4, insideCurve: 4, outsideCurve: 4, cross: 0 },
};
// Optima the sweep found and scripts/check-route.js already verified.
const KNOWN = {
  '16 pure curves': 'IOLIRRORIOROLLIL',
  '20 S8+3each': 'SILOLOSSLORISSRISSRS',
  '24 S8+4each': 'IILOLOSSOSLORRIISSSRSRSL',
};

const spec = (set, extra = {}) => ({
  steps: total(set), box: 6, minY: 0, exclude: ['cross'], inventory: set,
  objective: 'maximiseScore', symmetryBreaking: true, ...extra,
});

console.log(`${process.execArgv.includes('--conditions=browser') ? 1 : 8} worker(s)\n`);

// ---- 1. What does a hint do to the time? ---------------------------------

for (const [name, set] of Object.entries(SETS)) {
  const cold = await timed(() => solveTrack(spec(set, { maxTimeInSeconds: 300 })));
  const undo = withHint(hintFor(routeOf(KNOWN[name]), total(set)));
  let warm;
  try {
    warm = await timed(() => solveTrack(spec(set, { maxTimeInSeconds: 300 })));
  } finally {
    undo();
  }
  console.log(`${name.padEnd(16)} cold ${cold.seconds.toFixed(1)}s ${cold.status} ${cold.score}pts`
    + `   hinted ${warm.seconds.toFixed(1)}s ${warm.status} ${warm.score}pts`);
}

// ---- 2. How many optimal solutions are there? ---------------------------

// Owen's suspicion, measured. Enumerate by no-good cuts, then keep the ones that
// scored the optimum — with an objective in the model every solve returns the best
// remaining, so the optima come out first, as a block.
const countOptima = async (set, cap) => {
  const best = (await solveTrack(spec(set, { maxTimeInSeconds: 300 }))).score;
  const found = await solveTrack(spec(set, { allSolutions: true, maxSolutions: cap }));
  const optimal = found.routes.filter(r => scoreOf(r) === best);
  return {
    best, optimal: optimal.length, routes: optimal,
    seen: found.routes.length, truncated: found.truncated,
  };
};

/**
 * The same physical loop read from a different starting piece is a different
 * route to the model — the start cell and pose are pinned — but the same track to
 * a reader. Mirroring swaps the curve colours, likewise. So the number that
 * matters for a shuffle is the count up to rotation and reflection, not the raw
 * count of optimal solutions.
 */
const canonical = (route) => {
  const mirror = r => r.map(t =>
    ({ leftCurve: 'rightCurve', rightCurve: 'leftCurve' }[t] ?? t));
  const rotations = r => r.map((_, i) => [...r.slice(i), ...r.slice(0, i)].join(','));
  return [...rotations(route), ...rotations(mirror(route))].sort()[0];
};

// Only the cheap set gets enumerated. Each no-good cut makes the next solve
// slower, so 40 rounds on a set that takes 35s to solve once is an hour of
// machine time for a number the 3s set already answers.
for (const [name, set] of [['16 pure curves', SETS['16 pure curves']]]) {
  const counted = await timed(() => countOptima(set, 40));
  const distinct = new Set(counted.routes.map(canonical));
  console.log(`\n${name}: optimum ${counted.best}pts — ${counted.optimal} optimal routes `
    + `among the first ${counted.seen}${counted.truncated ? ' (capped)' : ''}, `
    + `${distinct.size} distinct up to rotation+mirror, in ${counted.seconds.toFixed(1)}s`);
  for (const route of counted.routes.slice(0, 5)) console.log(`    ${shape(route)}`);
}
