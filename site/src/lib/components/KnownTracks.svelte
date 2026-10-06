<script>
  // A sweep, one layout at a time: a random track every `every` ms, numbered from
  // 1 in the sweep file's order. Pausing holds the track and the train on it,
  // and typing a number pauses on that track; play lets it go again. A figure —
  // see `$lib/figure.js`.
  import Frame from './Frame.svelte';
  import PlayPause from './PlayPause.svelte';
  import { SWEEP_CROSSED } from '$lib/sweeps.js';
  import { shuffler } from '$lib/shuffle.svelte.js';

  // `train` is the viewer's: its callbacks, or null for no train.
  let { sweep = SWEEP_CROSSED, every = 2000, aspect = '16 / 10', train = {} } = $props();

  const shapes = $derived(sweep.shapes);

  let playing = $state(true);
  // What the shuffle watches for being on screen: the footer is, whenever the
  // track is.
  let host = $state(null);
  const pick = shuffler({
    count: () => shapes.length,
    every: () => every,
    running: () => playing,
    host: () => host,
  });

  // Focusing the number holds the track, or the next shuffle would overwrite
  // whatever is being typed. The number takes effect on blur; anything that is not
  // a track number puts the field back to the one showing.
  function hold() {
    playing = false;
  }

  function choose(event) {
    const n = Number(event.currentTarget.value);
    if (Number.isInteger(n) && n >= 1 && n <= shapes.length) pick.index = n - 1;
    event.currentTarget.value = String(pick.index + 1);
  }
</script>

<Frame view={{ shape: shapes[pick.index].shape, train, paused: !playing }} {aspect}>
  {#snippet footer()}
    <label bind:this={host}>
      Track #<input
        type="number"
        min="1"
        max={shapes.length}
        value={pick.index + 1}
        onfocus={hold}
        onblur={choose}
        aria-label="Track number, 1 to {shapes.length}"
      />
    </label>
    <PlayPause bind:playing label="the tracks" />
  {/snippet}
</Frame>

<style>
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
