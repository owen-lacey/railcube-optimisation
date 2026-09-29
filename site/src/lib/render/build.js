// A track assembling itself: one piece at a time, in the order the route is
// walked, each arriving down the rail onto the end of what is there already.
//
// There are two ways a piece can arrive, and which one it gets is not a setting —
// it is whether that cube is already on the stage.
//
//   A **mint** is a piece that is not there yet: it comes in from off the edge of
//   the frame, out of nowhere, which is all the builder could ever do on its own.
//
//   A **pick-up** is a piece that *is* there — lying on the floor where the
//   previous layout's collapse left it. It is not replaced with a new mesh that
//   happens to look like it; it is the same cube, lifted off the floor and
//   carried to its new slot. That is the point of the sequence in `Layout`: a set
//   of pieces being rearranged, not one track deleted and another drawn. See
//   `stage.js` for the registry that makes it possible.
//
// Either way the arrival ends the same, and that ending is the hard-won part. The
// cubes join male-to-female along the direction of travel, so a piece cannot be
// pressed onto the track from outside at all: the last thing it does is come into
// line with the rail and slide on axially. A pick-up's lift is therefore a lift to
// the *standoff*, and the slide from there is the same slide a mint makes.
//
// This is a scripted tween and not the tumbler run backwards. A rigid-body
// simulation is not reversible — a pile does not know which of the thousands of
// tracks that collapse into it was the one — so nothing here touches cannon.
//
// **The lighting comes out exactly right**, which is worth the trouble it costs. A
// container rotation cannot recompute a polygon normal, so a `place`d piece
// carries the lighting of its baked pose; the tumbler lives with that mid-air and
// re-bakes on landing, because it cannot know a resting orientation in advance.
// Here the resting orientation is the one thing that *is* known in advance — it is
// the pose the solver chose — so a piece is baked at its final pose the moment it
// sets off and the container carries what it still has to lose. That delta reaches
// nothing precisely as the piece lands, so the finished track is lit identically
// to a static one and nothing is baked twice.

import { CUBE, ALARM, ALARM_FLASH, ALARM_PERIOD } from './dimensions.js';
import { toWorld, poseRotation, axisAngle, compose, turnToward, add } from './vec.js';
import { createDriver } from './drive.js';
import { originAt, comAt } from '../shapes.js';
import { identify } from '../../../../src/layouts.js';

// The beat. FLIGHT is longer than PACE, so several pieces are in the air at once
// and arrivals read as a stream rather than as a row of separate events; at these
// numbers the 18-cube set is built in under three seconds. PACE is overridable per
// build, so a story can stretch the gap and look at one arrival on its own.
export const PACE = 0.1;        // seconds per piece
export const FLIGHT = 0.34;     // seconds the axial slide takes
const HOLD = 0.6;      // seconds the closed loop is left alone before the train starts

// A pick-up's first leg: off the floor and up to the standoff. Longer than the
// slide because it covers much more ground — a cube can have fallen most of the
// way across the layout — and because it is the leg where the piece turns.
export const LIFT = 0.55;       // seconds
const LIFT_HEIGHT = 1.5;   // cubes of arc, so a piece rises clear rather than dragging

// **The joint is at the ends of the rail, not on the face.** The cubes click
// together male-to-female along the direction of travel, so a piece has to be
// brought into line with the rail and slid on axially, from the side the previous
// piece's male end points at, moving backwards onto it. Pressing a piece down onto
// the face is how a Brio set goes together and is wrong for this toy.
//
// So the last leg of every arrival is one straight line, down the connector axis
// and nothing else. STANDOFF is where it starts, back along the piece's *own*
// heading — read off the pose rather than fixed in the world, which is what makes
// a piece bound for the underside of the track come at it from underneath.
//
// A cube and a bit, because that is as far as the lane can be relied on: measured
// over every layout in `src/layouts.js`, a one-cube axial lane is free for all but
// six of 188 pieces, and those six are irreducible rather than unlucky. Four are
// the piece that *closes* a loop, which has both of its ends mated and therefore no
// free axis to arrive on at all — a real track has to be flexed to close. Two slide
// onto an already-placed cross, where the route revisits track it laid earlier. At
// two cubes of lane the blocked count rises to thirteen, which is what set the
// number.
const STANDOFF = 1.3;  // cubes back along the piece's own heading: the connector axis

// The turn a mint carries when it sets off, about its own right — so it tumbles
// end over end along the line it travels rather than spinning about some axis
// unrelated to where it is going. A pick-up has no equivalent: the turn it makes
// is the one it actually needs, from however it fell to the pose it is going to.
const TILT = 100;      // degrees

const UP = [0, 0, 1];  // world up, in PolyCSS's frame — see `toWorld`

const clamp = t => Math.max(0, Math.min(1, t));
// A turn that is *finished* by `at` and is then exactly nothing, so the piece is
// square for what follows — not nearly square. A piece still rotating as its
// connectors engage is the picture this is all avoiding.
const settleBy = at => s => 1 - (1 - clamp(s / at)) ** 3;
const turnEase = settleBy(0.6);       // a mint's tilt, spent over the opening 60%
const liftTurnEase = settleBy(0.8);   // a pick-up's turn, square before the lift ends
// Position eases in and out: off the mark smoothly, and settling onto the joint
// rather than ramming it.
const smooth = s => { const t = clamp(s); return t * t * (3 - 2 * t); };

const scale = (v, k) => v.map(x => x * k);
const lerp = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

/**
 * What is to be built: one entry per cube, in the order they click together.
 *
 * A crossed cross is in the route twice but is one cube, so it is clicked into
 * place once — and then driven over twice.
 */
function slotsFor(stage, pieces, { beat = 0, lift = 0, flight = 0, delay = 0 } = {}) {
  const ids = identify(pieces);
  return pieces.filter(p => !p.revisit).map((piece, i) => {
    // A pose's basis holds the images of the piece's own right, heading and rail
    // face, in that order — so the arrival is read straight off it and turns with
    // the piece: it slides in along its heading, tumbling about its own right.
    const basis = poseRotation(piece.pose);
    const position = toWorld(piece.cell);
    // Whether this is a pick-up is settled here, before anything is minted, so
    // every slot is judged against the stage as the collapse left it.
    const pickUp = stage.held(ids[i]);
    return {
      id: ids[i],
      type: piece.type,
      color: piece.color,
      basis,
      position,
      standoff: scale(basis[1], STANDOFF * CUBE),
      spin: basis[0],
      pickUp,
      at: delay + i * beat,
      lands: delay + i * beat + (pickUp ? lift : 0) + flight,
    };
  });
}

/**
 * The four durations a build is made of, scaled by one tempo.
 *
 * `speed` is a single multiplier rather than four separate props because that is
 * the thing anyone actually wants to change: how long the whole assembly takes.
 * Doubling it halves every part of it, so the proportions — and so the *look* of an
 * arrival, which the easings are tuned against — are exactly preserved. `pace` is
 * still separate because it is the one duration worth setting on its own: it is the
 * gap between pieces, and stretching only that is how you watch one arrival.
 *
 * At the default 18-cube set: speed 1 is 2.6 s of assembly and 3.2 s before the
 * train sets off; speed 1.5 is 1.7 s and 2.1 s; speed 2 is 1.3 s and 1.6 s.
 */
const timingFor = (pace, speed, delay) => ({
  delay,
  beat: pace / speed,
  lift: LIFT / speed,
  flight: FLIGHT / speed,
  hold: HOLD / speed,
});

/**
 * Put a cube down finished: at its final pose, in its final place, with nothing
 * on the container. Mints it if it is not on the stage; re-bakes it if it is,
 * which is what re-lights a piece that has been lying on the floor.
 */
function finish(stage, slot) {
  const existing = stage.held(slot.id);
  const cube = stage.cube(slot.id, slot);
  if (existing) cube.bake(slot.basis, slot.position);
  return cube;
}

/**
 * Off the floor and up to the standoff, turning into the pose on the way.
 *
 * The turn is over by 80% of the leg, so the piece is square before the slide
 * starts. The arc is a straight line between the two points with a rise added to
 * the middle of it — enough that a cube lifts clear of the track rather than
 * dragging along the floor to get where it is going.
 *
 * Only a pick-up has one of these, so only `buildPhase` calls it.
 */
function lift(slot, s) {
  const basis = turnToward(slot.from.basis, slot.basis, liftTurnEase(s));
  const com = lerp(slot.from.com, slot.to, smooth(s));
  const risen = add(com, scale(UP, Math.sin(Math.PI * clamp(s)) * LIFT_HEIGHT * CUBE));
  slot.cube.place(basis, originAt(slot.type, basis, risen));
}

/**
 * The axial slide onto the joint: one straight line and nothing else.
 *
 * Every arrival in the project ends with this, however the piece got to the
 * standoff, which is why it sits out here rather than inside one phase.
 */
function slide(slot, s) {
  const back = 1 - smooth(s);
  const position = add(slot.position, scale(slot.standoff, back));
  // A mint still has its tilt to lose; a pick-up spent its turn on the lift and
  // comes down the lane square, so its slide is a pure translation.
  const basis = slot.pickUp
    ? slot.basis
    : compose(axisAngle(slot.spin, TILT * (1 - turnEase(s))), slot.basis);
  slot.cube.place(basis, position);
}

/**
 * The rest of an arrival that was cut short: from wherever the cube had got to,
 * home. The cube is already on the connector axis, so a straight line from there
 * stays on it.
 */
function resume(slot, s) {
  slot.cube.place(
    turnToward(slot.from.basis, slot.basis, turnEase(s)),
    lerp(slot.from.position, slot.position, smooth(s)),
  );
}

/** Is this cube exactly home in its slot — landed, and not still on its way? */
const restsAt = (cube, slot) => cube
  && cube.position.every((v, k) => Math.abs(v - slot.position[k]) < 1e-6)
  && cube.basis.every((row, r) => row.every((v, k) => Math.abs(v - slot.basis[r][k]) < 1e-6));

/**
 * The same slide, run the other way: off the joint and back out along the
 * connector axis to the standoff, where the piece is gone.
 *
 * It is the arrival reversed exactly — the position eases back over the whole leg
 * and the tilt comes back over the last 60% of it — so taking a piece off reads
 * as the same motion as putting it on. It goes from wherever the cube *is* rather
 * than from its slot, because a piece can be taken off while it is still arriving;
 * a cube that had landed starts from its slot anyway, and for that one the two are
 * the same motion to the letter.
 */
function unslide(leaving, s) {
  const basis = turnToward(leaving.from.basis, leaving.to.basis, 1 - turnEase(1 - s));
  leaving.cube.place(basis, lerp(leaving.from.position, leaving.to.position, smooth(s)));
}

/**
 * Where each leaving cube is going: the standoff behind its slot, turned by the
 * tilt a mint arrives with. The last piece of the route goes first, so a tail is
 * taken off the way it was put on, backwards.
 */
function departuresFor(leaving, { beat, flight }) {
  return [...leaving].reverse().map(({ cube, piece }, i) => {
    const basis = poseRotation(piece.pose);
    return {
      cube,
      from: { basis: cube.basis, position: cube.position },
      to: {
        basis: compose(axisAngle(basis[0], TILT), basis),
        position: add(toWorld(piece.cell), scale(basis[1], STANDOFF * CUBE)),
      },
      at: i * beat,
      ends: i * beat + flight,
      gone: false,
    };
  });
}

/**
 * A finished track, drawn all at once and driven — no assembly at all.
 *
 * What a reader who has asked for reduced motion gets instead of a build, what a
 * viewer's first paint is, and what a static track viewer is made of. `drive` is
 * off for the catalogue views, which are loose pieces rather than routes and so
 * have no rail for a train to find.
 */
export function trackPhase(stage, pieces, { drive = true } = {}) {
  for (const slot of slotsFor(stage, pieces)) finish(stage, slot);
  if (!drive) return { advance: () => false };

  const driver = createDriver(stage);
  driver.setRoute(pieces);
  return {
    advance: (_, elapsed) => { driver.at(elapsed); },
    // The train is the one thing here the stage does not own, so it is the one
    // thing this has to take away with it.
    dispose: driver.dispose,
  };
}

/**
 * A track being *extended*: whatever is already standing stays exactly where it
 * is, and only the pieces that are new arrive.
 *
 * This is the one a track being typed needs, and the difference from `buildPhase`
 * is the whole of it. There, a cube already on the stage is a cube lying on the
 * floor after a collapse, so it is picked up and carried. Here it is a cube that is
 * already *in the right place* — the viewer takes off every cube that no longer
 * belongs before running this — so the right thing to do with it is nothing at all:
 * no bake, no transform, not a single write. A piece already down must not so much
 * as twitch when the next letter is typed.
 *
 * `leaving` is the pieces that no longer belong, `{ cube, piece }` each: the cube
 * detached from the stage (see `stage.detach`) and the piece it was standing as.
 * They slide back out the way they came in before anything new arrives, and this
 * phase disposes them — at the end of the slide, or at once if it is itself
 * replaced first, so a quick second change never strands one half-way out.
 *
 * `alarm` is the ID of a cube the model has rejected — a piece that has been asked
 * to go somewhere it cannot. It pulses between two reds from the moment it lands
 * and does not stop, so the phase never finishes while one is showing. It is done
 * here rather than in a phase of its own because a cube must only ever have one
 * thing writing to it in a frame.
 */
export function growPhase(stage, pieces, {
  pace = PACE, speed = 1, drive = false, alarm = null, instant = false, leaving = [],
} = {}) {
  const timing = timingFor(pace, speed, 0);
  const slots = slotsFor(stage, pieces, timing);
  const departing = departuresFor(leaving, timing);
  // Nothing arrives until everything leaving has gone, so a piece put in the place
  // of one taken off never passes through it on the way.
  const clear = departing.reduce((last, d) => Math.max(last, d.ends), 0);
  // `pickUp` here means the cube is on the stage. One that is home in its slot is
  // standing and is left alone; the arrivals are everything else, re-timed to set
  // off one after another from the moment the way is clear. A cube on the stage
  // but *not* home was still arriving when the phase before this one was replaced
  // — a second click inside a flight — and it carries on from where it got to,
  // straight away, rather than being left frozen in mid-air.
  const arriving = slots.filter(slot => !(slot.pickUp && restsAt(stage.cubes.get(slot.id), slot)));
  let queued = 0;
  for (const slot of arriving) {
    if (slot.pickUp) {
      const { basis, position } = stage.cubes.get(slot.id);
      slot.from = { basis, position };
      slot.at = 0;
    } else {
      slot.at = clear + queued++ * timing.beat;
    }
    slot.lands = slot.at + timing.flight;
  }
  arriving.sort((a, b) => a.at - b.at);

  const alarmed = alarm ? slots.find(slot => slot.id === alarm) : null;
  // It is minted in ALARM already — `openScene` paints it — so the first repaint
  // due is the pale one, half a period after it lands.
  let lit = ALARM;
  const alarmFrom = alarmed && (arriving.includes(alarmed) ? alarmed.lands : 0);

  const driver = drive ? createDriver(stage) : null;
  const closes = arriving.reduce((last, s) => Math.max(last, s.lands), clear) + timing.hold;

  let next = 0;
  let flying = [];
  let closedAt = null;

  function pulse(elapsed) {
    if (elapsed < alarmFrom) return;
    const half = ALARM_PERIOD / 2;
    const want = Math.floor((elapsed - alarmFrom) / half) % 2 === 0 ? ALARM : ALARM_FLASH;
    if (want === lit) return;
    stage.cube(alarmed.id, alarmed).recolour(want);
    lit = want;
  }

  function leave(elapsed) {
    for (const d of departing) {
      if (d.gone || elapsed < d.at) continue;
      if (elapsed >= d.ends) {
        d.cube.dispose();
        d.gone = true;
      } else {
        unslide(d, (elapsed - d.at) / timing.flight);
      }
    }
  }

  const leavingStill = () => departing.some(d => !d.gone);

  if (instant) {
    for (const d of departing) { d.cube.dispose(); d.gone = true; }
    for (const slot of arriving) stage.cube(slot.id, slot).place(slot.basis, slot.position);
  }

  return {
    advance(_, elapsed) {
      if (!instant) {
        leave(elapsed);
        while (next < arriving.length && elapsed >= arriving[next].at) {
          const slot = arriving[next++];
          slot.cube = stage.cube(slot.id, slot);
          flying.push(slot);
        }
        flying = flying.filter(slot => {
          if (elapsed >= slot.lands) {
            slot.cube.place(slot.basis, slot.position);   // the delta is now nothing
            return false;
          }
          (slot.pickUp ? resume : slide)(slot, (elapsed - slot.at) / timing.flight);
          return true;
        });
      }

      // A piece that cannot go down keeps saying so. Not under `instant`, which is
      // what a reader who has asked for reduced motion gets: it stays the flat red
      // it was minted in, because a pulsing element is the whole of what that
      // preference is about.
      if (alarmed && !instant) {
        pulse(elapsed);
        return undefined;
      }
      if (!driver) {
        const settled = next === arriving.length && !flying.length && !leavingStill();
        return instant || settled ? false : undefined;
      }
      if (closedAt === null && elapsed >= (instant ? 0 : closes)) {
        closedAt = elapsed;
        driver.setRoute(pieces);
      }
      driver.at(elapsed - closedAt);
    },
    dispose() {
      driver?.dispose();
      for (const d of departing) if (!d.gone) { d.cube.dispose(); d.gone = true; }
    },
  };
}

/**
 * A track clicking itself together. Pieces already on the stage are picked up off
 * the floor; anything else is minted from off-frame.
 */
export function buildPhase(stage, pieces, {
  pace = PACE, speed = 1, drive = true, delay = 0, onPickUp = null,
} = {}) {
  const timing = timingFor(pace, speed, delay);
  const slots = slotsFor(stage, pieces, timing);
  const driver = drive ? createDriver(stage) : null;
  // The train sets off once the loop is closed, which is the *last* landing —
  // and with two kinds of arrival that is no longer simply the last piece.
  const closes = slots.reduce((last, s) => Math.max(last, s.lands), 0) + timing.hold;

  let next = 0;          // the next slot to set off
  let flying = [];       // slots in the air, in no particular order
  let closedAt = null;   // loop time the train set off, null until it has

  /**
   * Set a piece going.
   *
   * A pick-up is re-baked at its final pose here and the container immediately
   * put back to where the piece is actually lying, so it does not visibly snap:
   * from this moment the delta on the container is only what the arrival still
   * has to spend, and it is lit as it will be when it lands.
   */
  function begin(slot) {
    // Taken off whatever else was moving it *before* its position is read, so the
    // flight starts from exactly where the piece was left and nothing writes to it
    // twice in a frame. When the collapse is still running, this is the hand
    // closing round a cube: its body leaves the pile and the rest keeps falling.
    if (slot.pickUp) onPickUp?.(slot.id);
    const cube = stage.cube(slot.id, slot);
    if (slot.pickUp) {
      slot.from = { basis: cube.basis, com: comAt(slot.type, cube.basis, cube.position) };
      slot.to = comAt(slot.type, slot.basis, add(slot.position, slot.standoff));
      cube.bake(slot.basis, slot.position);
      cube.place(slot.from.basis, originAt(slot.type, slot.from.basis, slot.from.com));
    }
    slot.cube = cube;
    flying.push(slot);
  }

  // Everything here is a function of how long the phase has been running, which
  // is what makes it a tween: no state accumulates between frames but the list of
  // what is in the air.
  return {
    advance(_, elapsed) {
      while (next < slots.length && elapsed >= slots[next].at) begin(slots[next++]);

      flying = flying.filter(slot => {
        if (elapsed >= slot.lands) {
          slot.cube.place(slot.basis, slot.position);   // the delta is now nothing at all
          return false;
        }
        const since = elapsed - slot.at;
        if (slot.pickUp && since < timing.lift) lift(slot, since / timing.lift);
        else slide(slot, (since - (slot.pickUp ? timing.lift : 0)) / timing.flight);
        return true;
      });

      if (!driver) return next === slots.length && !flying.length ? false : undefined;
      if (closedAt === null && slots.length && elapsed >= closes) {
        closedAt = elapsed;
        driver.setRoute(pieces);
      }
      if (closedAt !== null) driver.at(elapsed - closedAt);
    },
    dispose() { driver?.dispose(); },
  };
}
