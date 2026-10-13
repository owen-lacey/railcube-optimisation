// A ghost train riding a growing track, a piece at a time.
//
// It stands where the track ends, and each piece added is ridden once it has
// landed: from where a train stands at the piece's entry to where it stands at its
// exit. A piece taken off is ridden backwards first, and goes only once the train
// is off it. Pieces added faster than they can be ridden are ridden in turn.
//
// The rider is the stage's (`stage.rider`), not a phase's, because it has to
// outlive one: a growing track replaces its phase on every letter, and the train
// carries on from wherever it has got to. What it keeps is the route it is on and
// how far along it is, `x` pieces — 2.5 is half-way through the third.

import { trackPath, trainAt } from './rail.js';
import { CUBE, SPEED } from './dimensions.js';
import { railPoint, frameOf, bodyOf } from './drive.js';
import { add, sub, len, compose, transpose, turnToward } from './vec.js';
import { step } from '../../../../src/track.js';

const SAMPLES = 48;    // rail samples per piece
// The share of a ride over which a train standing off the new piece's rail is
// brought onto it. A train at rest stands on a straight it imagines next (see
// `stance`), so on a curve it is a little off the rail the curve lays.
const SETTLE = 0.4;
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

const smooth = t => t * t * (3 - 2 * t);
const keyOf = p => `${p.type}${p.pose}${p.cell}`;

/** Where the train is once it has ridden the first `k` pieces of `route`: a head. */
export function headAt(route, k) {
  if (k < route.length) return { cell: route[k].cell, pose: route[k].pose };
  const last = route[k - 1];
  return step(last.cell, last.pose, last.type);
}

/**
 * How a train at rest stands at `head`: half a cube along a straight from it, in
 * its cell — where the 'after' ghost has always stood. Which piece comes next is
 * not known, so it is the one that keeps going.
 */
const stance = head => trainAt('straight', head.cell, head.pose);

/**
 * The ride over one piece: rail samples from half a cube into it, where a train
 * at rest at its entry stands, through its exit to half a cube along the straight
 * after it, where one at rest at its exit stands. Paced by the body, as the driver
 * paces a lap, and `turn` and `offset` take the train from its stance at the entry
 * onto the rail.
 */
function rideOf(piece) {
  const exit = step(piece.cell, piece.pose, piece.type);
  const rail = trackPath([piece, { type: 'straight', ...exit }], SAMPLES).slice(0, SAMPLES * 1.5 + 1);
  const gaps = rail.slice(1).map((s, i) => len(sub(s.pos, rail[i].pos)));
  let k = 0;
  let run = 0;
  while (run + gaps[k] < CUBE / 2) run += gaps[k++];
  const samples = [railPoint(rail[k], rail[k + 1], (CUBE / 2 - run) / gaps[k]), ...rail.slice(k + 1)];
  const along = [0];
  for (let i = 1; i < samples.length; i++) along.push(along[i - 1] + len(sub(bodyOf(samples[i]), bodyOf(samples[i - 1]))));
  const from = stance(piece);
  return {
    samples,
    along,
    length: along.at(-1),
    turn: compose(from.basis, transpose(frameOf(samples[0]))),
    offset: sub(from.position, samples[0].pos),
  };
}

/** Where a train is `f` of the way through a ride, `{ basis, position }`. */
function placeOn(ride, f) {
  const d = f * ride.length;
  let j = 1;
  while (j < ride.along.length - 1 && ride.along[j] < d) j++;
  const gap = ride.along[j] - ride.along[j - 1];
  const at = railPoint(ride.samples[j - 1], ride.samples[j], gap ? Math.min(1, (d - ride.along[j - 1]) / gap) : 1);
  const w = smooth(Math.min(1, f / SETTLE));
  return {
    basis: compose(turnToward(ride.turn, IDENTITY, w), frameOf(at)),
    position: add(at.pos, ride.offset.map(v => v * (1 - w))),
  };
}

/** How many pieces two routes have in common from the start. */
function agreement(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && keyOf(a[n]) === keyOf(b[n])) n += 1;
  return n;
}

/**
 * The way back: from where the rider is, backwards along the route it is on, to
 * where that route and `route` stop agreeing. `legs` in time order, and
 * `offAt(i, piece)`, when the train is off `piece`, the `i`th of a route — at once
 * if the route it is on does not have it there.
 */
export function backwards(rider, route) {
  const on = rider.route ?? [];
  const meet = agreement(on, route);
  const legs = [];
  const off = new Map();
  let x = rider.x;
  let t = 0;
  while (x > meet) {
    const i = Math.ceil(x) - 1;
    const ride = rideOf(on[i]);
    const seconds = (x - i) * ride.length / SPEED;
    legs.push({ route: on, i, ride, from: x - i, to: 0, t0: t, t1: t + seconds });
    t += seconds;
    off.set(i, t);
    x = i;
  }
  const offAt = (i, piece) => (on[i] && keyOf(on[i]) === keyOf(piece) ? off.get(i) ?? 0 : 0);
  return { legs, x, done: t, offAt };
}

/**
 * The way on, after `back`: along `route` from where the rider has got to, to its
 * end, each piece ridden once `readyAt(i)` says it has landed and the last ride
 * is over.
 */
export function forwards(back, route, readyAt) {
  const legs = [];
  let t = back.done;
  for (let x = back.x; x < route.length; x = Math.floor(x) + 1) {
    const i = Math.floor(x);
    const ride = rideOf(route[i]);
    const t0 = Math.max(t, readyAt(i));
    t = t0 + (i + 1 - x) * ride.length / SPEED;
    legs.push({ route, i, ride, from: x - i, to: 1, t0, t1: t });
  }
  return legs;
}

const sameHead = (a, b) => a.pose === b.pose && String(a.cell) === String(b.cell);

/**
 * Run the rider back, then on along `route`, as a function of the phase's clock:
 * true while it has somewhere still to go. `onArrive(head)` is told each head it
 * comes to rest at, `{ cell, pose, index }`, `index` the pieces ridden.
 *
 * Where the way back ends it moves on to `route`, which agrees with the one it was
 * on up to there — unless they part at the very start, when the start has moved:
 * then it is put at the new one. A rider with no route yet is put at the start
 * at once, and `instant` puts it straight at the end.
 */
export function riding(rider, { route, back, ahead, onArrive, instant = false }) {
  const arrive = (on, k) => onArrive?.({ ...headAt(on, k), index: k });
  const rest = (on, k) => {
    rider.route = on;
    rider.x = k;
    const { basis, position } = stance(headAt(on, k));
    rider.place(basis, position);
    arrive(on, k);
  };
  let joined = false;
  const join = () => {
    joined = true;
    if (sameHead(headAt(rider.route, back.x), headAt(route, back.x))) rider.route = route;
    else rest(route, back.x);
  };

  if (instant) {
    rest(route, route.length);
    return () => false;
  }
  if (!rider.route) rest(route, 0);

  const legs = [...back.legs, ...ahead];
  let next = 0;
  return elapsed => {
    while (next < legs.length && elapsed >= legs[next].t1) {
      const { route: on, i, to } = legs[next++];
      if (on === route && !joined) join();
      rest(on, i + to);
    }
    if (!joined && elapsed >= back.done) join();
    const leg = legs[next];
    if (!leg) return false;
    if (elapsed < leg.t0) return true;
    const f = leg.from + (leg.to - leg.from) * (elapsed - leg.t0) / (leg.t1 - leg.t0);
    rider.x = leg.i + f;
    const { basis, position } = placeOn(leg.ride, f);
    rider.place(basis, position);
    return true;
  };
}
