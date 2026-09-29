// Drawing a physics run: the binding between the cannon world in `physics.js`
// and the cubes on a stage.
//
// Nothing is drawn for the floor. cannon's floor is an infinite plane, and a slab
// under the pile used to be drawn to stand for it — a chamfered box, a hundred-odd
// polygons, appearing out of nowhere the moment a shape was typed and then sitting
// there as a dark square behind everything. The pieces stop where they stop with or
// without it, so it was a hundred polygons and a distraction. Gone.
//
// This is a *phase* rather than a viewer. It owns no camera, no loop and no
// meshes — the stage owns those, because the pile it leaves behind is picked up
// again by the build phase that follows it, and a mesh that belonged to the
// collapse could not survive that. See `stage.js`.
//
// A finished track never moves, so its pose goes into its vertices once. Here
// every piece moves, and that is what `meshes.js` exists for — see it for why an
// orientation goes on the container rather than into the vertices, and what that
// costs.
//
// What it costs, here, is that a piece carries its lighting with it as it turns.
// Two things keep that from being visible. Each mesh starts in the pose the
// layout put it in, so the rotation the container carries is only what has
// changed *since the fall started* — the first frame is lit exactly as a static
// track is. And when a piece stops moving its resting orientation is baked in,
// which re-lights it, so the settled pile everyone actually looks at is correct.
// The approximation exists only while something is mid-air.

import { poseRotation, cubePosition } from './vec.js';
import { createWorld, basisOf, isAsleep } from '../physics.js';
import { originAt } from '../shapes.js';
import { identify } from '../../../../src/layouts.js';

// How long a fall is given before the phase stops whatever the pile is doing.
//
// Sleeping alone is not enough to end it, which was measured rather than
// assumed: an 18-cube pile has 16 of its 18 bodies asleep within about four
// seconds, and then two arcs resting against each other rock gently against one
// another for ever, crossing the sleep threshold and coming back. Damping was
// tried and does not settle them either — a segmented approximation of a curve
// has small notches for a corner to drop into, and there is always somewhere to
// fall. The motion by then is under a fifth of a cube a second and nothing worth
// watching is still happening, so the honest thing is a deadline.
//
// Ten seconds is right when the collapse is the subject and you are waiting for
// it to finish. It is far too long when the collapse is the first half of a
// sequence and something is waiting behind it, so `limit` is a phase option and
// the sequence passes a much smaller one.
const SETTLE_LIMIT = 10;   // simulated seconds

const positionOf = body => [body.position.x, body.position.y, body.position.z];

/**
 * Hand a standing layout to gravity.
 *
 * The pieces must already be where the layout puts them — which they are, since
 * the thing that stands a layout up is whatever drew it. A cube that is not on
 * the stage yet is minted in its layout pose, so a cold viewer can collapse a
 * track it never assembled.
 */
export function tumblePhase(stage, pieces, { drop = 3, limit = SETTLE_LIMIT, keep = null } = {}) {
  const sim = createWorld(pieces, { drop });

  // `createWorld` and `identify` both walk the route in order and both drop
  // revisits, so the two lists line up index for index. That is what pairs a
  // rigid body with the cube it is the physics of.
  const ids = identify(pieces);
  const taken = new Set();
  const drawn = sim.bodies.map(({ piece, body }, i) => {
    const basis = poseRotation(piece.pose);
    const cube = stage.cube(ids[i], {
      type: piece.type,
      color: piece.color,
      basis,
      position: cubePosition(piece),
    });
    return { id: ids[i], body, cube, resting: true };
  });

  /**
   * A body that has stopped gets its orientation put in its vertices, where it
   * buys correct lighting for as long as the piece is looked at. This is the
   * expensive call, so it happens once per piece coming to rest.
   */
  function rest(item, basis) {
    item.cube.bake(basis, originAt(item.cube.type, basis, positionOf(item.body)));
    item.resting = true;
  }

  /**
   * Hand a cube over to whatever is going to carry it.
   *
   * Its body leaves the world, so the pile stops resting on a piece that has been
   * lifted out of it, and nothing here writes to that cube again — otherwise the
   * collapse and the build would both be moving it, every frame, in disagreement.
   */
  function release(id) {
    const item = drawn.find(d => d.id === id);
    if (!item || taken.has(id)) return;
    taken.add(id);
    sim.remove(item.body);
  }

  /** Write every moving body's current pose onto its cube. */
  function place() {
    for (const item of drawn) {
      if (taken.has(item.id)) continue;
      const asleep = isAsleep(item.body);
      if (asleep && item.resting) continue;   // nothing has changed, and nothing will
      const basis = basisOf(item.body.quaternion);
      if (asleep) {
        rest(item, basis);
        continue;
      }
      // Awake again after resting is fine: the delta is measured from whatever
      // orientation is currently in the vertices, not from the original pose.
      item.resting = false;
      // cannon reports a centre of mass and the mesh is keyed to a cell, so the
      // two are a centroid apart — turned into the orientation of the moment.
      item.cube.place(basis, originAt(item.cube.type, basis, positionOf(item.body)));
    }
  }

  /**
   * Re-light everything still in the air, for the frame the phase ends on — so a
   * pile that is going to be looked at is lit correctly rather than carrying the
   * lighting of whatever pose each piece was last baked in.
   *
   * `keep` names the cubes something *after* this phase is going to re-light
   * anyway, and they are skipped. That is not a micro-optimisation: baking is
   * `setPolygons`, which is the call `meshes.js` exists to ration, and relighting
   * a whole pile costs a `setPolygons` per cube *in a single frame*. Doing it for
   * eighteen cubes that the build is about to re-bake one at a time would put a
   * two-thousand-matrix spike at exactly the moment the next animation starts.
   */
  function settle() {
    for (const item of drawn) {
      if (item.resting || taken.has(item.id) || keep?.has(item.cube.id)) continue;
      rest(item, basisOf(item.body.quaternion));
    }
  }

  return {
    release,
    advance(delta, elapsed) {
      sim.step(delta);
      place();
      // Everything lifted out, or the deadline: either way there is nothing left
      // falling that anyone is going to look at.
      if (taken.size === drawn.length || sim.settled() || elapsed > limit) {
        settle();
        return false;
      }
    },
  };
}
