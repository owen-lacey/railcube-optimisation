<script>
  // How a population of tracks scores, one bar per score, with one score picked
  // out: a closed loop's, against the crossed sweep's layouts or the leaderboard's.
  //
  // The scores are whole points, so they are their own bins. The axis spans the
  // population and the picked score both, since a board score need not fall inside
  // the sweep's range. Most of a population sits in a few bars, so a bar with any
  // count is drawn at least a sliver tall — its true count is in its tooltip — and
  // the picked score has a marker of its own, so it reads even where its bar is a
  // sliver or there is no bar at all.

  // `counts` is `[score, count]` pairs; `score` the one picked out, or null for
  // none, and its marker says what share of the population it beats. `noun` names
  // what is counted, in a bar's tooltip.
  let { counts, score = null, noun } = $props();

  // The least a bar with any count is drawn, as a share of the tallest.
  const SLIVER = 0.02;

  const tally = $derived(new Map(counts));
  const low = $derived(Math.min(counts[0][0], score ?? Infinity));
  const high = $derived(Math.max(counts.at(-1)[0], score ?? -Infinity));
  const bins = $derived(high - low + 1);
  const tallest = $derived(Math.max(...counts.map(([, n]) => n)));
  const total = $derived(counts.reduce((sum, [, n]) => sum + n, 0));
  const below = $derived(counts.reduce((sum, [s, n]) => sum + (s < score ? n : 0), 0));
  const at = $derived(((score - low + 0.5) / bins) * 100);

  const heightOf = n => (n === 0 ? 0 : Math.max(n / tallest, SLIVER) * 100);
  const number = n => n.toLocaleString('en-GB');

  // The share beaten, to a whole percent, except that it never rounds to 0% while
  // anything is beaten nor to 100% while anything is not.
  const beaten = $derived.by(() => {
    const share = (below / total) * 100;
    if (below > 0 && share < 1) return '<1%';
    if (below < total && share > 99) return `${Math.min(Math.floor(share * 10) / 10, 99.9)}%`;
    return `${Math.round(share)}%`;
  });
</script>

<figure>
  <div class="plot">
    <svg viewBox="0 0 {bins} 100" preserveAspectRatio="none" aria-hidden="true">
      {#each { length: bins } as _, i}
        {@const s = low + i}
        {@const n = tally.get(s) ?? 0}
        <rect class:picked={s === score} x={i + 0.1} width="0.8" y={100 - heightOf(n)} height={heightOf(n)}>
          <title>Score {s}: {number(n)} {noun}</title>
        </rect>
      {/each}
    </svg>
    {#if score !== null}
      <div class="marker" style:left="{at}%">
        <span class="tag" class:end={at > 75} class:start={at < 25}>Yours: {score}, beats {beaten}</span>
      </div>
    {/if}
  </div>
  <div class="axis" aria-hidden="true"><span>{low}</span><span>Score</span><span>{high}</span></div>
</figure>

<style>
  figure {
    margin: 0;
  }

  .plot {
    position: relative;
    height: 5rem;
    margin-top: 1.5rem;
    border-bottom: 1px solid var(--rule);
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  rect {
    fill: var(--muted);
    opacity: 0.45;
  }

  rect.picked {
    fill: var(--grid-color);
    opacity: 1;
  }

  .marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--grid-color);
    pointer-events: none;
  }

  .tag {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    padding-bottom: 0.2rem;
    white-space: nowrap;
    font-size: 0.85rem;
    font-weight: 600;
  }

  /* Near an edge the label hangs inwards, so it never leaves the plot. */
  .tag.start {
    left: 0;
    transform: none;
  }

  .tag.end {
    left: auto;
    right: 0;
    transform: none;
  }

  .axis {
    display: flex;
    justify-content: space-between;
    padding-top: 0.2rem;
    color: var(--muted);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
</style>
