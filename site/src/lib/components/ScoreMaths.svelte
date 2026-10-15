<script>
  // How a layout's combined score is worked out, a row per reading: its value,
  // times the points each unit of it is worth, signed by whether more is better.
  // The rows sum to the score. The sum is `termsOf` in `$lib/weighting.js`. Given
  // `onweigh`, the points each are sliders.
  import WeightSlider from './WeightSlider.svelte';
  import { termsOf } from '$lib/weighting.js';
  import { SWEEP_CROSSED_RANKED } from '$lib/sweeps.js';

  // `readings` is `{ knotted, poses, closeCalls, repeats, longestSide }`: a swept
  // layout's from `$lib/readings.js`, a track being built's from `$lib/score.js`.
  // Null is no track yet, and every value is a dash. `onweigh(name, value)` is
  // handed a slider's new weight, from 0 to its `max`, an object by metric name;
  // without it the weights are fixed.
  let {
    readings,
    weights = SWEEP_CROSSED_RANKED.weights,
    onweigh = undefined,
    max = undefined,
  } = $props();

  // The Scorecard's order, which is the post's.
  const LABELS = [
    ['longestSide', 'Longest side'],
    ['closeCalls', 'Close calls'],
    ['poses', 'Orientation count'],
    ['repeats', 'Repeats'],
    ['knotted', 'Knotted'],
  ];

  const DASH = '—';
  // A stand-in reading for no track, so the points each still show.
  const NONE = Object.fromEntries(LABELS.map(([name]) => [name, 0]));

  const working = $derived.by(() => {
    const { terms, total } = termsOf(readings ?? NONE, weights);
    const byName = Object.fromEntries(terms.map(t => [t.name, t]));
    const rows = LABELS.map(([name, label]) => ({ ...byName[name], label, weight: weights[name] ?? 0 }));
    if (!readings) return { rows: rows.map(row => ({ ...row, value: null, contribution: null })), total: null };
    return { rows, total };
  });

  // Signed with a real minus. A zero is unsigned.
  const signed = n => {
    if (n === null) return DASH;
    if (n === 0) return '0';
    return `${n < 0 ? '−' : '+'}${Math.abs(n)}`;
  };
  const shown = (name, value) => {
    if (value === null) return DASH;
    if (name === 'knotted') return value ? 'yes' : 'no';
    return value;
  };
</script>

<table class="maths">
  <thead>
    <tr>
      <th scope="col">Metric</th>
      <th scope="col">Value</th>
      <th scope="col">Points each</th>
      <th scope="col">Points</th>
    </tr>
  </thead>
  <tbody>
    {#each working.rows as { name, label, value, points, weight, contribution } (name)}
      <tr>
        <th scope="row">{label}</th>
        <td>{shown(name, value)}</td>
        {#if onweigh}
          <td class="weigh">
            <div>
              <WeightSlider value={weight} max={max[name]} onchange={value => onweigh(name, value)} label="{label} points each" />
              <span>{signed(points)}</span>
            </div>
          </td>
        {:else}
          <td>{signed(points)}</td>
        {/if}
        <td>{signed(contribution)}</td>
      </tr>
    {/each}
  </tbody>
  <tfoot>
    <tr>
      <th scope="row" colspan="3">Score</th>
      <td>{signed(working.total)}</td>
    </tr>
  </tfoot>
</table>

<style>
  /* The Scorecard's look, widened to the working. */
  .maths {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }

  th,
  td {
    padding: 0.05rem 0.4rem;
    text-align: right;
    white-space: nowrap;
  }

  th:first-child {
    padding-left: 0;
    text-align: left;
  }

  td:last-child {
    padding-right: 0;
    font-weight: 600;
  }

  /* The slider, then its value, which keeps one width so the slider never moves.
     The column takes whatever width the others leave, and the slider all of it. */
  .weigh {
    width: 100%;
  }

  .weigh div {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .weigh :global(.weight-slider) {
    flex: 1;
    min-width: 4.5rem;
  }

  .weigh span {
    min-width: 3ch;
  }

  thead th {
    color: var(--muted);
    font-weight: 400;
  }

  tbody th {
    color: var(--muted);
    font-weight: 400;
  }

  tfoot th,
  tfoot td {
    padding-top: 0.25rem;
    border-top: 2px solid var(--card-border);
    font-weight: 700;
  }

  tfoot td {
    font-size: 1rem;
  }
</style>
