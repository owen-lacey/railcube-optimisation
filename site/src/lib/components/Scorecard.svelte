<script>
  // A layout's five readings, in the order the post names them: compactness,
  // close calls, orientation count, repeats and knots. See `$lib/readings.js`.
  import { readingsOf } from '$lib/readings.js';

  let { shape } = $props();

  const readings = $derived.by(() => {
    const { longestSide, closeCalls, poses, repeats, knotted } = readingsOf(shape);
    return [
      ['Longest side', longestSide],
      ['Close calls', closeCalls],
      ['Orientation count', poses],
      ['Repeats', repeats],
      ['Knotted', knotted ? 'yes' : 'no'],
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
