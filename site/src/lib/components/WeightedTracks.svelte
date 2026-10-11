<script>
  // The best and the worst of the crossed sweep, by how much knots, poses, close
  // calls, repeats and longest side matter to you: a slider per metric, and the
  // ten that come out top and the ten bottom of every legal layout in sweeps.db
  // under those weights, stepped through by hand. A weighting reads a layout only
  // through its five numbers, so each of the ten is a different five, shown by
  // one layout that has them.
  import { Slider } from 'bits-ui';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import LayoutViewer from './LayoutViewer.svelte';
  import { SWEEP_CROSSED_WEIGHTS } from '$lib/sweeps.js';
  import { ends } from '$lib/weighting.js';

  // `train` is LayoutViewer's: its callbacks, or null for no train. A slider
  // replaces `weights` rather than writing into it: an object handed in as a prop
  // is not reactive state, so a write into it would change nothing on screen.
  let {
    weights = $bindable({ knotted: 1, poses: 1, closeCalls: 1, repeats: 1, longestSide: 1 }),
    table = SWEEP_CROSSED_WEIGHTS,
    aspect = '16 / 10',
    train = {},
  } = $props();

  // The tally holds every weighting's ends up to its own maximum, so the sliders
  // go no further.
  const max = table.maxWeight;

  const METRICS = [
    { name: 'knotted', label: 'Knotted', hint: 'knotted is better' },
    { name: 'poses', label: 'Poses', hint: 'more is better' },
    { name: 'closeCalls', label: 'Close calls', hint: 'more is better' },
    { name: 'repeats', label: 'Repeats', hint: 'fewer is better' },
    { name: 'longestSide', label: 'Longest side', hint: 'shorter is better' },
  ];

  const ranked = $derived(ends(table, weights));

  // Where each end is in its ten. A slider sends both back to the first.
  let picks = $state({ best: 0, worst: 0 });

  const weigh = (name, value) => {
    weights = { ...weights, [name]: value };
    picks = { best: 0, worst: 0 };
  };

  const turn = (end, by) => {
    const { length } = ranked[end];
    picks[end] = (picks[end] + by + length) % length;
  };

  const plural = (n, one) => `${n.toLocaleString('en-GB')} ${one}${n === 1 ? '' : 's'}`;
</script>

<figure class="weighted-tracks">
  <div class="weights" role="group" aria-label="How much each metric matters">
    {#each METRICS as { name, label, hint } (name)}
      <span class="label" id="weight-{name}">{label} <small>{hint}</small></span>
      <Slider.Root
        type="single"
        value={weights[name]}
        onValueChange={value => weigh(name, value)}
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
    {@const { row } = ranked[end][picks[end]]}
    <LayoutViewer shape={row.shape} {aspect} {train}>
      {#snippet caption()}
        <p class="reading">
          <strong>{title}</strong>
          {row.knot === 'unknot' ? 'no knot' : row.knot}, {plural(row.poses, 'pose')},
          {plural(row.closeCalls, 'close call')}, {plural(row.repeats, 'repeat')},
          longest side {row.longestSide}
        </p>
        <p class="shape">{row.shape}</p>
        <div class="ranked" role="group" aria-label="{title} layouts">
          <button type="button" class="turn" aria-label="Previous {end} layout" onclick={() => turn(end, -1)}><ChevronLeft /></button>
          <span class="position">{picks[end] + 1} / {ranked[end].length}</span>
          <button type="button" class="turn" aria-label="Next {end} layout" onclick={() => turn(end, 1)}><ChevronRight /></button>
        </div>
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
  .shape {
    margin: 0;
  }

  /* A 36-letter word: let it break anywhere rather than push the card wide. */
  .shape {
    font-family: ui-monospace, monospace;
    overflow-wrap: anywhere;
  }

  /* As RankedTracks'. */
  .ranked {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Wide enough for "10 / 10", so the arrows never move. */
  .position {
    min-width: 7ch;
    text-align: center;
    font-family: ui-monospace, monospace;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .turn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
</style>
