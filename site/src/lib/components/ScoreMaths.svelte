<script>
  // How a layout's combined score is worked out, a row per reading: its value, the
  // range it is rescaled over (the whole crossed sweep's), where it sits in that
  // range, signed by whether more is better, times its weight. The rows sum to the
  // score. The readings are the Scorecard's (`$lib/readings.js`), the sum is
  // `termsOf` in `$lib/weighting.js`.
  import { readingsOf } from '$lib/readings.js';
  import { termsOf } from '$lib/weighting.js';
  import { SWEEP_CROSSED_RANKED } from '$lib/sweeps.js';

  let {
    shape,
    ranges = SWEEP_CROSSED_RANKED.ranges,
    weights = SWEEP_CROSSED_RANKED.weights,
  } = $props();

  // The Scorecard's order, which is the post's.
  const LABELS = [
    ['longestSide', 'Longest side'],
    ['closeCalls', 'Close calls'],
    ['poses', 'Orientation count'],
    ['repeats', 'Repeats'],
    ['knotted', 'Knotted'],
  ];

  const working = $derived.by(() => {
    const { terms, total } = termsOf(ranges, readingsOf(shape), weights);
    const byName = Object.fromEntries(terms.map(t => [t.name, t]));
    return { rows: LABELS.map(([name, label]) => ({ ...byName[name], label })), total };
  });

  // Signed with a real minus, to two places. A zero is unsigned.
  const signed = n => {
    const text = Math.abs(n).toFixed(2);
    if (Number(text) === 0) return text;
    return `${n < 0 ? '−' : '+'}${text}`;
  };
  const shown = (name, value) => (name === 'knotted' ? (value ? 'yes' : 'no') : value);
</script>

<table class="maths">
  <thead>
    <tr>
      <th scope="col">Metric</th>
      <th scope="col">Value</th>
      <th scope="col">Range</th>
      <th scope="col">Scaled</th>
      <th scope="col">Weight</th>
      <th scope="col">Points</th>
    </tr>
  </thead>
  <tbody>
    {#each working.rows as { name, label, value, low, high, scaled, sign, weight, contribution } (name)}
      <tr>
        <th scope="row">{label}</th>
        <td>{shown(name, value)}</td>
        <td>{low}–{high}</td>
        <td>{signed(scaled * sign)}</td>
        <td>×{weight}</td>
        <td>{signed(contribution)}</td>
      </tr>
    {/each}
  </tbody>
  <tfoot>
    <tr>
      <th scope="row" colspan="5">Score</th>
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
