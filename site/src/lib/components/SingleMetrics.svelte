<script>
  // The crossed sweep's best layout on each metric alone, a tab per metric: the
  // layout at that metric's best that is lowest on the other four, with its
  // scorecard over the viewer's top-left corner and the metric's own row picked
  // out. `scripts/single-metrics.js` chooses them. A figure — see `$lib/figure.js`
  // — whose scorecard shows on its own only, as `ScoredTrack`'s does.
  import { Tabs } from 'bits-ui';
  import Frame from './Frame.svelte';
  import Scorecard from './Scorecard.svelte';
  import { SWEEP_CROSSED_SINGLES } from '$lib/sweeps.js';
  import { LABELS } from '$lib/weighting.js';

  // `train` is the viewer's: its callbacks, or null for no train.
  let { singles = SWEEP_CROSSED_SINGLES, aspect = '16 / 10', train = {} } = $props();

  let metric = $state(singles.layouts[0].metric);

  const shape = $derived(singles.layouts.find(l => l.metric === metric).shape);
</script>

{#snippet scorecard()}
  <Scorecard {shape} emphasis={metric} />
{/snippet}

<Tabs.Root bind:value={metric} class="single-metrics">
  <Frame view={{ shape, train }} {aspect} overlay={scorecard}>
    {#snippet footer()}
      <Tabs.List class="metrics" aria-label="Metric to prioritise">
        {#each singles.layouts as { metric: name } (name)}
          <Tabs.Trigger value={name} class="metric">{LABELS[name]}</Tabs.Trigger>
        {/each}
      </Tabs.List>
    {/snippet}
  </Frame>
</Tabs.Root>

<style>
  /* One button per metric, wrapping onto a second row on a phone. */
  :global(.single-metrics .metrics) {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  /* As SnapshotViewer's views. */
  :global(.single-metrics .metric) {
    padding: 0.35rem 0.75rem;
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  :global(.single-metrics .metric[data-state='active']) {
    background: color-mix(in srgb, currentColor 18%, transparent);
    font-weight: 600;
  }
</style>
