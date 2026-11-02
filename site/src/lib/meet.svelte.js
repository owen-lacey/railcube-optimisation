// What the meet-in-the-middle figures share: the trials they step through, on one
// fixed layout of the crossed sweep (`meet-figure.json`, by `scripts/meet-figure.js`),
// and their card's shape.
import { onMount } from "svelte";
import { joinedScene, trialScene } from "$lib/scenes.js";
import data from "$lib/data/meet-figure.json" with { type: "json" };

export { data };

const [first, second] = data.a.segments;
const [third, last] = data.b.segments;

/**
 * A loop's last segment, searched for: each decoy and then the real one, a candidate
 * to join to everything `before` it. `candidates` are their letters and `routes`
 * each joined on to `before`. `pictures` are a trial's three: the candidate `apart`
 * beside what is built, `turned` to carry on from it, and `joined` to it, its end's
 * callout marked ✗ or ✓ against `target`. `camera` is 'follow', each picture framed
 * on its own, or 'fixed', one shot over every candidate.
 */
function trials(before, { decoys, segment, target }, camera) {
  const candidates = [...decoys, segment];
  const routes = candidates.map(candidate => before + candidate);
  const trial = (state, judged = false) =>
    trialScene(before.length, { state, judged, target, routes: camera === "fixed" ? routes : null });
  return {
    candidates,
    routes,
    pictures: { apart: trial("apart"), turned: trial("turned"), joined: trial("joined", true) },
  };
}

/** The first segment, the one the others carry on from. */
export const FIRST = first;

/**
 * The search for loop 'a''s second segment, on from its first; or for loop 'b''s
 * last, on from the rest of the track. See `trials`.
 */
export function loopTrials(loop, camera) {
  if (loop === "a") return trials(first, { decoys: data.a.decoys, segment: second, target: data.a.heading }, camera);
  if (loop !== "b") throw new Error(`there is no loop ${loop}`);
  return trials(first + second + third, { decoys: data.b.decoys, segment: last, target: data.b.heading }, camera);
}

/**
 * Whole tracks, loop A with each loop B in turn: other layouts' loop Bs, which close
 * the track but miscount the box, then the real one, which spends it. `routes` are
 * the whole tracks, and `scene` draws one;
 * `camera` is 'follow', each framed on its own, or 'fixed', one shot over them all.
 */
export function spendTrials(camera) {
  const loopA = first + second;
  const routes = [...data.spend.decoys.map(({ loop }) => loop), third + last].map(loop => loopA + loop);
  return {
    routes,
    scene: letters => ({
      ...joinedScene(letters, { ends: false, routes: camera === "fixed" ? routes : null }),
      closed: false,
    }),
  };
}

/**
 * The figures' viewer shape: `aspect()` if given, else square on a phone and 16/10
 * otherwise — at 16/10 the inventory would cover a phone's whole viewer. Call it
 * while a component is being set up.
 */
export function viewerShape(aspect) {
  let narrow = $state(false);
  onMount(() => {
    const query = window.matchMedia("(max-width: 600px)");
    const update = () => {
      narrow = query.matches;
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  });
  return {
    get value() {
      return aspect() ?? (narrow ? "1 / 1" : "16 / 10");
    },
  };
}
