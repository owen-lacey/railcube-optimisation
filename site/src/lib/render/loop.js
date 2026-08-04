// An animation loop with its own clock.
//
// All three viewers need the same thing and none of them may be the one loop the
// old spike ran for the life of the page: a blog post is several viewers on one
// page, and each has to be startable, stoppable and disposable on its own.
//
// The clock is the loop's, not the wall's, which is the point of it. Time spent
// stopped — scrolled out of view, tab in the background — is not time that
// passed, so nothing teleports on the way back. And a single delta is capped, so
// a tab that was hidden for a minute does not try to catch that minute up in one
// frame: for the tumbler that is a pile shot through itself, for the train it is
// a lap skipped.

const CAP = 0.1;   // seconds; the longest single step any tick will be handed

/**
 * Run `tick(delta, elapsed)` — both in seconds — on every frame while started.
 * A tick returning `false` stops the loop, which is how an animation that has
 * finished stops asking for frames.
 */
export function createLoop(tick) {
  let frame = null;   // the rAF handle, null when stopped
  let last = null;
  let elapsed = 0;

  function step(now) {
    frame = requestAnimationFrame(step);
    const delta = last === null ? 0 : Math.min((now - last) / 1000, CAP);
    last = now;
    if (!delta) return;
    elapsed += delta;
    if (tick(delta, elapsed) === false) stop();
  }

  function start() {
    if (frame !== null) return;
    last = null;   // a fresh delta, so time spent stopped is not stepped through
    frame = requestAnimationFrame(step);
  }

  function stop() {
    if (frame === null) return;
    cancelAnimationFrame(frame);
    frame = null;
  }

  /** Back to zero, stopped — the start of a replay. */
  function reset() {
    stop();
    elapsed = 0;
  }

  return { start, stop, reset, at: () => elapsed };
}
