<script>
  // A layout's five readings, in the order the post names them: compactness,
  // close calls, orientation count, repeats and knots. All but the knot are read
  // off the chained track here; the knot is the one the data files store, since
  // reading one takes topoly. The shape goes back through `chainTrack`, as in
  // LayoutViewer, so an illegal one is an error rather than a set of numbers.
  import { chainTrack } from '../../../../src/track.js';
  import { routeOf } from '../../../../src/layouts.js';
  import { closeCallsOf, metricsOf, posesOf, spanOf } from '../../../../src/metrics.js';
  import { knotOf } from '$lib/sweeps.js';

  let { shape } = $props();

  const readings = $derived.by(() => {
    const placed = chainTrack(routeOf(shape));
    const knot = knotOf(shape);
    return [
      ['Longest side', Math.max(...spanOf(placed))],
      ['Close calls', closeCallsOf(placed)],
      ['Orientation count', posesOf(placed)],
      ['Repeats', metricsOf(placed).repeats],
      ['Knotted', knot === 'unknot' ? 'no' : 'yes'],
    ];
  });
</script>

<dl class="scorecard">
  {#each readings as [label, value] (label)}
    <dt>{label}</dt>
    <dd>{value}</dd>
  {/each}
</dl>

<style>
  /* Laid over the scene, so small, and see-through like a callout so the dots and
     any track behind it still show. */
  .scorecard {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.1rem 0.75rem;
    margin: 0;
    padding: 0.35rem 0.6rem;
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--card-footer) 85%, transparent);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  dt,
  dd {
    margin: 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
