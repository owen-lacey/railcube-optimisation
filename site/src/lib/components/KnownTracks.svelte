<script>
  // A sweep, one layout at a time, numbered by its row id in sweeps.db: a random
  // one on mount, and the shuffle button picks another. A figure — see `$lib/figure.js`.
  import { onMount } from 'svelte';
  import Shuffle from '@lucide/svelte/icons/shuffle';
  import Frame from './Frame.svelte';
  import { SWEEP_CROSSED } from '$lib/sweeps.js';

  // `train` is the viewer's: its callbacks, or null for no train.
  let { sweep = SWEEP_CROSSED, aspect = '16 / 10', train = {} } = $props();

  const shapes = $derived(sweep.shapes);

  // Every id padded to the largest one's digits, so the number never changes width.
  const width = $derived(String(Math.max(...shapes.map(s => s.id))).length);

  const pick = () => Math.floor(Math.random() * shapes.length);

  // Track 0 until mount, then a random one: the page is prerendered, and the
  // server and the browser must agree on what the HTML says.
  let index = $state(0);
  onMount(() => (index = pick()));

  function shuffle() {
    // One re-roll if the draw lands on what is already showing.
    const next = pick();
    index = next === index ? pick() : next;
  }
</script>

<Frame view={{ shape: shapes[index].shape, train }} {aspect}>
  {#snippet footer()}
    <span class="number">Track #{String(shapes[index].id).padStart(width, '0')}</span>
    <button type="button" class="shuffle" onclick={shuffle} aria-label="Another track" title="Another track">
      <Shuffle aria-hidden="true" />
    </button>
  {/snippet}
</Frame>

<style>
  .number {
    font-variant-numeric: tabular-nums;
  }

  /* Outlined like PlayPause and WeightedTracks' shuffle. */
  .shuffle {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
</style>
