// Watching the solver work: `onSolution` and the stream of incumbents.
//
// The hazard here is the one CLAUDE.md's third rule is about. A callback that fires
// once when it should fire three times satisfies every natural assertion — the last
// solution is still the answer, the score still matches, the route is still legal —
// so the count is asserted explicitly, and the models are set up to make a chain of
// at least two unavoidable rather than hoped for.
//
// The trick for that is a bad hint. Hinted from a four-piece ring worth 8, the first
// incumbent is that ring and the optimum is 16, so an improving search cannot report
// only one solution. Measured: 2 incumbents in 0.9 s at one worker, 3 in 1.5 s at
// eight — a chain, quickly, without a slow model.
//
// Nothing here reads a solver variable. Every score, length and count is recomputed
// from the route that came back, chained through src/track.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrack } from '../src/solver/index.js';
import { routeOf, shapeOf } from '../src/layouts.js';
import { inversionRoute } from '../src/routes.js';
import { SET, SCORES, chainTrack } from '../src/track.js';
import { STARTER } from './fixtures.js';

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

// Which cpsat-js build the exports map handed us, because it changes what asking for
// eight workers means. The portable build has no threads and clamps the request to one,
// which also makes its callbacks live; the threaded build really does run eight and
// records instead. The library does not say which it is, so this reads the flag that
// decides — the same one scripts/benchmark-sets.js keys off.
const PORTABLE = process.execArgv.includes('--conditions=browser')
  || (process.env.NODE_OPTIONS ?? '').includes('--conditions=browser');

const total = set => Object.values(set).reduce((a, b) => a + b, 0);

/** A poor ring to start from, so there is always something better to find. */
const POOR_HINT = routeOf('LLLL');

const watched = async extra => {
  const seen = [];
  const result = await solveTrack({
    steps: 8, box: 6, minY: 0, exclude: ['cross'], inventory: SET,
    objective: 'maximiseScore', symmetryBreaking: true, hint: POOR_HINT,
    onSolution: s => seen.push(s), ...extra,
  });
  return { seen, result };
};

/** What a route is worth, counted here rather than taken from the callback. */
const scoreOf = route => chainTrack(route)
  .filter(p => !p.revisit)
  .reduce((n, p) => n + SCORES[p.type], 0);

/** The assertions that must hold of any stream, whatever the model. */
function assertWellFormedStream(seen, result) {
  assert.ok(seen.length >= 2, `expected a chain of incumbents, got ${seen.length}`);

  seen.forEach((s, i) => {
    assert.equal(s.index, i, 'index counts from 0 without gaps');
    // Legal, and legal as re-derived here — not as the solver reported it.
    assert.doesNotThrow(() => chainTrack(s.route), shapeOf(s.route));
    assert.equal(s.score, scoreOf(s.route), shapeOf(s.route));
    assert.equal(s.pieces.length, s.route.length);
    assert.ok(s.score <= s.bound, `score ${s.score} over its own bound ${s.bound}`);
    assert.ok(s.seconds > 0, 'stamped with the solver’s wall clock');
    if (i) {
      assert.ok(s.score > seen[i - 1].score, 'each incumbent improves on the last');
      assert.ok(s.seconds >= seen[i - 1].seconds, 'and is found no earlier');
    }
  });

  // The stream's last word and the returned answer have to be the same layout, or the
  // thing that was drawn last is not the thing that was solved.
  const last = seen[seen.length - 1];
  assert.equal(last.score, result.score);
  assert.deepEqual(last.route, result.route);
}

// ---- The two delivery modes ----------------------------------------------

test('one worker reports incumbents live, as it finds them', async () => {
  const { seen, result } = await watched({ numWorkers: 1 });

  assert.equal(result.status, 'OPTIMAL');
  assertWellFormedStream(seen, result);
  assert.ok(seen.every(s => s.live), 'a single-worker search can call into JS from inside');
});

test('eight workers report the same kind of stream, replayed at the end', async () => {
  const { seen, result } = await watched({ numWorkers: 8 });

  assert.equal(result.status, 'OPTIMAL');
  // The two searches are different searches, so only the shape of the stream is
  // asserted — never that the eight-worker run finds what the one-worker run finds.
  assertWellFormedStream(seen, result);
  // Eight workers cannot enter JS from inside the search, so they record and replay.
  // Unless this is the portable build, where the request was clamped back to one and
  // the incumbents are live after all — the clamp changes the delivery, not just the
  // speed, and that is the whole reason the browser can animate a search.
  assert.ok(seen.every(s => s.live === PORTABLE),
    PORTABLE ? 'clamped to one worker, so still live' : 'a threaded search records instead');
});

// ---- What the stream must agree with -------------------------------------

test('an incumbent has the same shape as the answer', async () => {
  const { seen, result } = await watched({ numWorkers: 1 });
  const last = seen[seen.length - 1];

  // The point of the shape being identical: one draw path for both.
  assert.deepEqual(Object.keys(last).sort(),
    ['bound', 'dropped', 'index', 'live', 'pieces', 'route', 'score', 'seconds']);
  assert.deepEqual(last.route, result.route);
  assert.deepEqual(last.pieces, result.pieces);
  assert.equal(last.dropped, result.dropped);
});

test('watching does not change the answer', async () => {
  const { result: seenResult } = await watched({ numWorkers: 1 });
  const blind = await solveTrack({
    steps: 8, box: 6, minY: 0, exclude: ['cross'], inventory: SET,
    objective: 'maximiseScore', symmetryBreaking: true, hint: POOR_HINT, numWorkers: 1,
  });

  assert.equal(seenResult.score, blind.score);
  assert.equal(seenResult.status, blind.status);
});

test('nothing is reported when there is nothing to report', async () => {
  const seen = [];
  const result = await solveTrack({
    steps: 3, box: 6, inventory: STARTER, numWorkers: 1, onSolution: s => seen.push(s),
  });

  assert.equal(result.status, 'INFEASIBLE');
  assert.deepEqual(seen, []);
});

// Enumeration re-solves the model once per solution, so the stream spans rounds. The
// index has to keep counting rather than restart, or a caller cannot tell "the fourth
// solution" from "the first solution of the fourth round".
test('enumeration reports across rounds, with the index counting on', async () => {
  const seen = [];
  const result = await solveTrack({
    steps: 4, box: 6, inventory: STARTER, allSolutions: true, maxSolutions: 3,
    numWorkers: 1, onSolution: s => seen.push(s),
  });

  assert.equal(result.routes.length, 3);
  assert.equal(seen.length, 3, 'one incumbent per round');
  assert.deepEqual(seen.map(s => s.index), [0, 1, 2]);
});

// ---- The real question ---------------------------------------------------

// Everything above uses an eight-step model to stay fast. This is the solve the
// browser actually runs, and the one the prototype draws: the model's whole set, on a
// single worker, hinted from a legal 14-cube loop worth 26.
//
// Measured on the portable build: first incumbent at 2.4 s, optimal at 14.0 s. Without
// the hint the first incumbent does not arrive for 29 s, which is the blank screen
// this whole exercise is about.
slow('the browser’s own solve streams a layout worth watching', async () => {
  const seen = [];
  const result = await solveTrack({
    steps: total(SET), box: 6, minY: 0, exclude: ['cross'], inventory: SET,
    objective: 'maximiseScore', symmetryBreaking: true, hint: inversionRoute,
    numWorkers: 1, onSolution: s => seen.push(s),
  });

  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.score, 34);
  assertWellFormedStream(seen, result);
  assert.ok(seen.every(s => s.live));
  // The first thing drawn is the hint itself, improved on later — which is the whole
  // reason the hint is there.
  assert.equal(seen[0].score, 26);
  assert.equal(chainTrack(seen[0].route).length, inversionRoute.length);
});
