<script>
  // The best and the worst of the crossed sweep, by how much knots, poses, close
  // calls, repeats and longest side matter to you: a slider per metric, and the
  // layouts that come out top and bottom of every legal one in sweeps.db under
  // those weights. Ties are common — a weighting reads a layout only through its
  // five numbers — so each end says how many layouts share its score, and
  // shuffles through examples of them. Not every knot has been read; an end says
  // how many unread layouts could still reach it, which only a zero weight allows.
  import { Slider } from 'bits-ui';
  import Shuffle from '@lucide/svelte/icons/shuffle';
  import LayoutViewer from './LayoutViewer.svelte';
  import { SWEEP_CROSSED_WEIGHTS } from '$lib/sweeps.js';
  import { extremes } from '$lib/weighting.js';

  // `train` is LayoutViewer's: its callbacks, or null for no train. A slider
  // replaces `weights` rather than writing into it: an object handed in as a prop
  // is not reactive state, so a write into it would change nothing on screen.
  let {
    weights = $bindable({ knotted: 1, poses: 1, closeCalls: 1, repeats: 1, longestSide: 1 }),
    table = SWEEP_CROSSED_WEIGHTS,
    aspect = '16 / 10',
    train = {},
  } = $props();

  // The tally marks examples for every weighting up to its own maximum, so the
  // sliders go no further.
  const max = table.maxWeight;

  const METRICS = [
    { name: 'knotted', label: 'Knotted', hint: 'knotted is better' },
    { name: 'poses', label: 'Poses', hint: 'more is better' },
    { name: 'closeCalls', label: 'Close calls', hint: 'more is better' },
    { name: 'repeats', label: 'Repeats', hint: 'fewer is better' },
    { name: 'longestSide', label: 'Longest side', hint: 'shorter is better' },
  ];

  const ends = $derived(extremes(table, weights));

  // Example 0, not a random one: the page is prerendered, and the server and the
  // browser must agree on what the HTML says.
  let picks = $state({ best: 0, worst: 0 });

  const shown = end => ends[end].examples[picks[end] % ends[end].examples.length];

  function shuffle(end) {
    const { length } = ends[end].examples;
    const pick = () => Math.floor(Math.random() * length);
    // One re-roll if the draw lands on what is already showing.
    const next = pick();
    picks[end] = next === picks[end] % length ? pick() : next;
  }

  const plural = (n, one) => `${n.toLocaleString('en-GB')} ${one}${n === 1 ? '' : 's'}`;
</script>

<figure class="weighted-tracks">
  <div class="weights" role="group" aria-label="How much each metric matters">
    {#each METRICS as { name, label, hint } (name)}
      <span class="label" id="weight-{name}">{label} <small>{hint}</small></span>
      <Slider.Root
        type="single"
        value={weights[name]}
        onValueChange={value => (weights = { ...weights, [name]: value })}
        min={0}
        {max}
        step={1}
        class="slider"
        aria-labelledby="weight-{name}"
      >
        <span class="track"><Slider.Range class="range" /></span>
        <Slider.Thumb index={0} class="thumb" aria-labelledby="weight-{name}" />
      </Slider.Root>
      <output for="weight-{name}">{weights[name]}</output>
    {/each}
  </div>

  {#each [['best', 'Best'], ['worst', 'Worst']] as [end, title] (end)}
    {@const { shape, knot, row } = shown(end)}
    <LayoutViewer {shape} {aspect} {train}>
      {#snippet caption()}
        <p class="reading">
          <strong>{title}</strong>
          {knot === null ? 'knot not read' : knot === 'unknot' ? 'no knot' : knot}, {plural(row.poses, 'pose')},
          {plural(row.closeCalls, 'close call')}, {plural(row.repeats, 'repeat')},
          longest side {row.longestSide}
        </p>
        <p class="shape">{shape}</p>
        <p class="ties">
          {ends[end].count.toLocaleString('en-GB')} of {table.legal.toLocaleString('en-GB')} tie{#if ends[end].unsure},
            and {ends[end].unsure.toLocaleString('en-GB')} more whose knots are not read could{/if}
        </p>
        <button
          type="button"
          class="shuffle"
          onclick={() => shuffle(end)}
          disabled={ends[end].examples.length < 2}
          aria-label="Another {end} layout"
          title="Another {end} layout"
        >
          <Shuffle aria-hidden="true" />
        </button>
      {/snippet}
    </LayoutViewer>
  {/each}
</figure>

<style>
  figure {
    display: grid;
    gap: 1.25rem;
    margin: 0 0 1.25rem;
  }

  /* Label, slider, value: one row per metric, the sliders lined up. */
  .weights {
    display: grid;
    grid-template-columns: auto 1fr 2ch;
    align-items: center;
    gap: 0.75rem 1rem;
  }

  .label small {
    display: block;
    color: var(--muted);
  }

  output {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  :global(.weighted-tracks .slider) {
    position: relative;
    display: flex;
    align-items: center;
    height: 1.25rem;
    touch-action: none;
  }

  .track {
    position: relative;
    flex: 1;
    height: 0.375rem;
    border-radius: 999px;
    background: var(--card-footer);
    overflow: hidden;
  }

  :global(.weighted-tracks .range) {
    position: absolute;
    height: 100%;
    background: var(--grid-color);
  }

  :global(.weighted-tracks .thumb) {
    display: block;
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid var(--grid-color);
    border-radius: 50%;
    background: var(--wash);
    cursor: pointer;
  }

  .reading,
  .shape,
  .ties {
    margin: 0;
  }

  /* A 36-letter word: let it break anywhere rather than push the card wide. */
  .shape {
    font-family: ui-monospace, monospace;
    overflow-wrap: anywhere;
  }

  .ties {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .shuffle {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-left: auto;
    padding: 0;
    border: 2px solid currentColor;
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .shuffle:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
