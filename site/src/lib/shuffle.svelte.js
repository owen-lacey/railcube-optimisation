import { untrack } from 'svelte';

/**
 * A random pick out of `count()` things, drawn afresh every `every()` ms while
 * `running()` holds and `host()` is on screen in a visible tab. Off screen nothing
 * changes, since every new pick is a whole layout redrawn.
 *
 * It starts at 0, not at a random pick: the pages are prerendered, and the server
 * and the browser must agree on what the HTML says. The first shuffle happens on
 * screen. `index` can be set, to hold a pick of the caller's choosing.
 *
 * Call it while a component initialises; the effects belong to that component.
 */
export function shuffler({ count, every = () => 2000, running = () => true, host }) {
  let index = $state(0);
  let onScreen = $state(false);

  function shuffle() {
    const pick = () => Math.floor(Math.random() * count());
    // One re-roll if the draw lands on what is already showing.
    const next = pick();
    index = next === index ? pick() : next;
  }

  $effect(() => {
    const node = host();
    if (!node) return;
    let visible = false;
    const update = () => (onScreen = visible && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    io.observe(node);
    document.addEventListener('visibilitychange', update);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  });

  $effect(() => {
    if (!running() || !onScreen) return;
    // Untracked, or the effect would depend on the `index` it writes and re-run itself.
    untrack(shuffle);
    const timer = setInterval(shuffle, every());
    return () => clearInterval(timer);
  });

  return {
    get index() {
      return index;
    },
    set index(value) {
      index = value;
    },
  };
}
