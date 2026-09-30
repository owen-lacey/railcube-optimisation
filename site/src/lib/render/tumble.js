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
export function tumblePhase(stage, pieces, { drop = 3, limit = SETTLE_LIMIT } = {}) {
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
    return { id: ids[i], body, cube };
  });

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
      // A sleeping body has not moved since it was last written, and will not.
      if (taken.has(item.id) || isAsleep(item.body)) continue;
      const basis = basisOf(item.body.quaternion);
      // cannon reports a centre of mass and the mesh is keyed to a cell, so the
      // two are a centroid apart — turned into the orientation of the moment.
      item.cube.place(basis, originAt(item.cube.type, basis, positionOf(item.body)));
    }
  }

  return {
    release,
    advance(delta, elapsed) {
      sim.step(delta);
      place();
      // Everything lifted out, or the deadline: either way there is nothing left
      // falling that anyone is going to look at.
      if (taken.size === drawn.length || sim.settled() || elapsed > limit) return false;
    },
  };
}
