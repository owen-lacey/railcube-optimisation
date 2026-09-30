<script>
  // A sweep, one layout at a time: a random track every `every` ms, numbered from
  // 1 in the sweep file's order. Pausing holds the track and the train on it,
  // and typing a number pauses on that track; play lets it go again.
  import { onMount, untrack } from 'svelte';
  import LayoutViewer from './LayoutViewer.svelte';
  import PlayPause from './PlayPause.svelte';
  import { SWEEP_CROSSED } from '$lib/sweeps.js';

  let { sweep = SWEEP_CROSSED, every = 2000, aspect = '16 / 10', drive = true } = $props();

  const shapes = $derived(sweep.shapes);

  // Track 1, not a random one: the page is prerendered, and the server and the
  // browser must agree on what the HTML says. The first shuffle happens on screen.
  let index = $state(0);
  let playing = $state(true);
  let onScreen = $state(false);
  let host;

  function shuffle() {
    const pick = () => Math.floor(Math.random() * shapes.length);
    // One re-roll if the draw lands on what is already showing.
    const next = pick();
    index = next === index ? pick() : next;
  }

  // Focusing the number holds the track, or the next shuffle would overwrite
  // whatever is being typed. The number takes effect on blur; anything that is not
  // a track number puts the field back to the one showing.
  function hold() {
    playing = false;
  }

  function choose(event) {
    const n = Number(event.currentTarget.value);
    if (Number.isInteger(n) && n >= 1 && n <= shapes.length) index = n - 1;
    event.currentTarget.value = String(index + 1);
  }

  // Off screen, nothing changes: every swap is a whole layout redrawn.
  onMount(() => {
    let visible = false;
    const update = () => (onScreen = visible && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    io.observe(host);
    document.addEventListener('visibilitychange', update);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  });

  $effect(() => {
    if (!playing || !onScreen) return;
    // Untracked, or the effect would depend on the `index` it writes and re-run itself.
    untrack(shuffle);
    const timer = setInterval(shuffle, every);
    return () => clearInterval(timer);
  });
</script>

<figure bind:this={host}>
  <LayoutViewer
    shape={shapes[index].shape}
    interactive={true}
    paused={!playing}
    {aspect}
    {drive}
  >
    {#snippet footer()}
      <label>
        Track #<input
          type="number"
          min="1"
          max={shapes.length}
          value={index + 1}
          onfocus={hold}
          onblur={choose}
          aria-label="Track number, 1 to {shapes.length}"
        />
      </label>
      <PlayPause bind:playing label="the tracks" />
    {/snippet}
  </LayoutViewer>
</figure>

<style>
  figure {
    margin: 0 0 1.25rem;
  }

  label {
    font-variant-numeric: tabular-nums;
  }

  input {
    width: 4.5ch;
    font: inherit;
    color: var(--ink);
    background: var(--wash);
    border: 1px solid var(--rule);
    border-radius: 0.375rem;
    padding: 0.15rem 0.35rem;
    margin-left: 0.15rem;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  input::-webkit-inner-spin-button,
  input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
</style>
