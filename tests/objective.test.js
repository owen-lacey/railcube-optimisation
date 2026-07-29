// Rung 7: the weighted objective — what a layout is worth, not how long it is.
//
// The step count IS the inventory, so no loop length is ever guessed: the model
// is handed 32 steps for the starter set and decides for itself how many to use.
// Dropped = inventory minus used, and the loop length falls out as a by-product.
//
// Pieces are scored rather than counted (SCORES in track.js: a straight 1,
// everything that turns the train 2), so the longest loop and the best loop are
// no longer the same thing — and the tests below have to ask about the score.
//
// The consequence next-session.md leans on: this model is trivially feasible.
// Drop everything but a four-piece ring and you always have an answer, so an
// INFEASIBLE result is never a fact about track layouts — it is a bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { solveTrack } from '../src/solver/index.js';
import { enumerateLoops } from '../src/enumerate.js';
import { chainTrack, countPools, overflowingPool, SCORES } from '../src/track.js';
import { STARTER } from './fixtures.js';

const LETTER = {
  leftCurve: 'L', rightCurve: 'R', insideCurve: 'I',
  outsideCurve: 'O', straight: 'S', cross: 'X',
};
const shape = route => route.map(t => LETTER[t]).join('');
const total = inv => Object.values(inv).reduce((a, b) => a + b, 0);

const SLOW = process.env.SLOW === '1';
const slow = SLOW ? test : (name, fn) => test(`${name} [skipped: set SLOW=1]`, { skip: true }, fn);

// A small set the tests can be exhaustive about. Four curves of each colour and
// four straights, in a 4-cell box: the best it can do is eight pieces, so
// dropping is a real choice rather than a formality.
//
// Four of each colour, not two: a flat loop turns through a full circle, so it
// needs four turns of the SAME handedness. Two and two closes nothing at all,
// and the whole file comes back INFEASIBLE.
const SMALL = { straight: 4, leftCurve: 4, rightCurve: 4, insideCurve: 0, outsideCurve: 0, cross: 0 };
const SMALL_BOX = 4;

// Scored in plain JavaScript from a route, the same way the tests count
// everything else. `scoreOf` inside the solver is a separate implementation on
// purpose — if they ever disagree, one of them is wrong and this notices.
//
// This one scores the traversal rather than the table, which is only the same
// number because every set in this file excludes the cross. Crossings are rung 8.
const scoreOf = route => route.reduce((n, type) => n + SCORES[type], 0);

const best = (inventory, opts = {}) => solveTrack({
  steps: total(inventory), box: SMALL_BOX, minY: 0, exclude: ['cross'],
  inventory, objective: 'maximiseScore', ...opts,
});

// ---- The objective means what it says ------------------------------------

test('dropped plus used equals the inventory', async () => {
  const result = await best(SMALL);
  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.route.length + result.dropped, total(SMALL));
});

// Never trust the solver's own count. Re-derive it from the route.
test('the reported count matches the route actually returned', async () => {
  const result = await best(SMALL);
  const used = Object.values(countPools(result.route)).reduce((a, b) => a + b, 0);
  assert.equal(used, result.route.length);
  assert.equal(result.dropped, total(SMALL) - used);
  assert.equal(overflowingPool(result.route, SMALL), null);
});

test('the answer is a legal track', async () => {
  const result = await best(SMALL);
  assert.doesNotThrow(() => chainTrack(result.route), shape(result.route));
});

// ---- It really is a maximum ----------------------------------------------

// The oracle knows every loop this inventory can build. The solver's answer must
// be the best-scoring of them — not merely a good one.
//
// It asks about the score, not the length, and the difference is real: with
// curves worth 2 and straights 1, a shorter loop made of curves can beat a longer
// one padded with straights. Asserting on length here would either fail or, worse,
// pass by coincidence on a set where the two happen to agree.
test('the solver finds the best-scoring loop the small set can build', async () => {
  const all = enumerateLoops({
    inventory: SMALL, maxPieces: total(SMALL), box: SMALL_BOX, minY: 0,
    checkTrain: true, exclude: ['cross'],
  });
  const bestScore = Math.max(...all.map(scoreOf));
  const result = await best(SMALL);
  assert.equal(result.score, bestScore,
    `solver scored ${result.score} (${shape(result.route)}), oracle's best is ${bestScore}`);
  // And the score it reports is the score of the route it returned.
  assert.equal(result.score, scoreOf(result.route));
});

// ---- Trivially feasible, by construction ---------------------------------

// next-session.md: the model can always drop everything but a four-piece ring,
// so it can never be infeasible by accident and INFEASIBLE means a bug. True —
// but only once the box is big enough to hold a ring, and that needs saying.
test('a cramped box sheds pieces rather than failing', async () => {
  for (const box of [3, 4, 5]) {
    const result = await best(STARTER, { box, steps: 12 });
    assert.equal(result.status, 'OPTIMAL', `box ${box} came back ${result.status}`);
    assert.ok(result.route.length >= 4);
    assert.doesNotThrow(() => chainTrack(result.route), `box ${box}: ${shape(result.route)}`);
  }
});

// The exception to "infeasible means a bug", pinned so nobody spends an evening
// debugging it. The start cube is nailed to the origin facing forwards, and the
// smallest ring spans four cells, so it necessarily reaches three cells to one
// side. A box of 2 only offers −2…2 from the origin in each direction, which is
// five cells but not four *starting from the middle*. Three is the floor.
test('a box smaller than three holds no loop at all', async () => {
  for (const box of [1, 2]) {
    assert.equal((await best(STARTER, { box, steps: 12 })).status, 'INFEASIBLE',
      `box ${box} should not fit a ring`);
  }
  assert.equal((await best(STARTER, { box: 3, steps: 12 })).status, 'OPTIMAL');
});

// ---- The box must not be the thing being measured ------------------------

// Open question 5, answered by measurement rather than by picking a number. If
// growing the box improves the answer, the box was the binding constraint and
// the objective was quietly measuring the wrong thing.
slow('the box is not what limits the answer', async () => {
  const at = async box => (await best(STARTER, { box, steps: 16 })).score;
  const six = await at(6);
  const seven = await at(7);
  assert.equal(seven, six,
    `box 6 scores ${six} but box 7 scores ${seven} — the box is binding, not the inventory`);
});

// ---- Symmetry breaking ---------------------------------------------------

// Rotations of the same cyclic loop are the same track read from a different
// starting piece. Breaking that is allowed to change WHICH route comes back, but
// never how many pieces it has — so the oracle-agreement tests above stay valid
// with it off, and it stays honest with it on.
// The break is only sound if the solution set is genuinely closed under
// swapping left curves for right ones — otherwise it would rule out real
// answers. Checked against the oracle rather than assumed, because it is an
// assumption about the piece catalogue, not about the solver: it needs the two
// colours to ship in equal numbers, and every other piece to be its own mirror
// image.
test('the loop set is closed under mirroring, which is what makes the break legal', () => {
  const mirror = s => s.replace(/[LR]/g, c => (c === 'L' ? 'R' : 'L'));
  for (const n of [4, 6, 8]) {
    const loops = enumerateLoops({
      inventory: STARTER, maxPieces: n, minPieces: n, box: 6, minY: 0,
      checkTrain: true, exclude: ['cross'],
    }).map(shape);
    const set = new Set(loops);
    for (const s of loops) {
      assert.ok(set.has(mirror(s)), `${s} has no mirror image among the ${n}-piece loops`);
    }
  }
});

test('symmetry breaking does not change the optimal value', async () => {
  const off = await best(SMALL, { symmetryBreaking: false });
  const on = await best(SMALL, { symmetryBreaking: true });
  assert.equal(on.score, off.score);
  assert.equal(on.dropped, off.dropped);
  assert.doesNotThrow(() => chainTrack(on.route), shape(on.route));
});

// ---- The whole starter set -----------------------------------------------

slow('the starter set builds its best-scoring loop', async () => {
  const result = await best(STARTER, { maxTimeInSeconds: 300 });
  assert.ok(['OPTIMAL', 'FEASIBLE'].includes(result.status), result.status);
  assert.doesNotThrow(() => chainTrack(result.route), shape(result.route));
  assert.equal(overflowingPool(result.route, STARTER), null);
  assert.equal(result.route.length + result.dropped, total(STARTER));
});
