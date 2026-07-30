// Hints: somewhere for the search to start.
//
// A hint constrains nothing, which makes it awkward to test. Every assertion about
// the answer passes just as well when the hint is quietly dropped on the floor — so
// if this file only solved hinted models and checked the results, `hintRoute` could
// become a no-op tomorrow and nothing here would notice. That is the same trap the
// vacuous timing tests fell into, in a new place.
//
// What pins it down is the rejections. Each one can only happen if the hint was
// actually walked, piece by piece, against the model's own transition rows: an
// unread hint cannot notice that it fails to close, that it is too long, or that it
// names a piece this model excluded. Those tests are the reason the rest are worth
// anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrack } from '../src/solver/index.js';
import { LAYOUTS, routeOf, shapeOf } from '../src/layouts.js';
import { inversionRoute } from '../src/routes.js';
import { SET, chainTrack, countPieces } from '../src/track.js';

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

const total = set => Object.values(set).reduce((a, b) => a + b, 0);

/** The model's set, as the browser asks it. */
const spec = extra => ({
  steps: total(SET), box: 6, minY: 0, exclude: ['cross'], inventory: SET,
  symmetryBreaking: true, ...extra,
});

// ---- The rejections, which are what prove the hint is read at all ----------

test('a hint that does not close is rejected before any solving', async () => {
  await assert.rejects(
    () => solveTrack(spec({ hint: ['straight', 'straight', 'straight'] })),
    /does not close/,
  );
});

test('a hint that runs over its own pieces is rejected', async () => {
  // Eight left curves: the 2x2 ring driven round twice, so it closes on the cell and
  // the pose and is still not a track anybody could build.
  await assert.rejects(
    () => solveTrack(spec({ hint: routeOf('LLLLLLLL') })),
    /collision at cell/,
  );
});

test('a hint longer than the step budget is rejected', async () => {
  await assert.rejects(
    () => solveTrack(spec({ steps: 4, hint: inversionRoute })),
    /14 pieces but there are only 4 steps/,
  );
});

test('a hint naming a piece this model excludes is rejected', async () => {
  await assert.rejects(
    () => solveTrack(spec({ exclude: ['cross', 'leftCurve'], hint: inversionRoute })),
    /has no row for/,
  );
});

// ---- What a hint is allowed to be -----------------------------------------

// Small step budgets here on purpose. What these two are about is what the hint is
// allowed to be, and the cost of the solve is set by the model's size rather than by
// the hint — an 18-step feasibility solve is four seconds of proving nothing extra.
test('a hint may be shorter than the step budget', async () => {
  const result = await solveTrack(spec({ steps: 8, hint: routeOf('LLLL') }));
  assert.equal(result.status, 'OPTIMAL');
  assert.doesNotThrow(() => chainTrack(result.route), shapeOf(result.route));
});

// A hint the model cannot satisfy is still only a hint: this ring spends four
// straights and the set holds two, so CP-SAT has to abandon it and search anyway.
test('a hint the inventory cannot afford still solves', async () => {
  const unaffordable = routeOf('SSLLSSLL');
  assert.ok(countPieces(chainTrack(unaffordable)).straight > SET.straight,
    'fixture is meant to be unaffordable');

  const result = await solveTrack(spec({ steps: 8, hint: unaffordable }));
  assert.equal(result.status, 'OPTIMAL');
  assert.doesNotThrow(() => chainTrack(result.route), shapeOf(result.route));
});

// ---- What a hint must not change ------------------------------------------

// The claim worth testing about correctness, rather than about speed: whatever the
// hint says, the optimum is the optimum. Hinted from a legal 14-cube loop worth 26,
// the answer still has to be the 18-cube one worth 34.
slow('a hint does not change the optimum', async () => {
  const hinted = await solveTrack(spec({ objective: 'maximiseScore', hint: inversionRoute }));
  const cold = await solveTrack(spec({ objective: 'maximiseScore' }));

  assert.equal(hinted.status, 'OPTIMAL');
  assert.equal(cold.status, 'OPTIMAL');
  assert.equal(hinted.score, cold.score);
  assert.equal(hinted.score, 34);
  // Counted in plain JavaScript from the chained route, never from the solver.
  assert.equal(chainTrack(hinted.route).filter(p => !p.revisit).length, 18);
  assert.equal(hinted.dropped, 0);
});

// Hinting the answer is the case a shuffle uses: a stored layout goes back in as the
// starting point. It must come out at least as good as it went in.
slow('hinting a stored optimum returns an optimum', async () => {
  const result = await solveTrack(
    spec({ objective: 'maximiseScore', hint: routeOf(LAYOUTS.set.shape) }),
  );

  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.score, 34);
  assert.equal(result.dropped, 0);
});
