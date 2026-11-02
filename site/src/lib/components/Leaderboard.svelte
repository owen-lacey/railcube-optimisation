<script>
  // A ranked list of tracks, and the reader's own wherever it ranks: rank, name,
  // score and the track, which opens in the front page's builder. A row with no
  // name is "Unnamed". Notes are never shown — the Worker does not serve them.
  import { base } from '$app/paths';

  // `rows` are `{ id, rank, name, score, shape }`, best first; `entry` is the
  // reader's row or null.
  let { rows, entry, caption } = $props();

  const below = $derived(entry && !rows.some(row => row.id === entry.id));
  const linkOf = shape => `${base}/?track=${shape}`;
</script>

<table>
  <caption>{caption}</caption>
  <thead>
    <tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col">Score</th><th scope="col">Track</th></tr>
  </thead>
  <tbody>
    {#each rows as row (row.id)}
      {@render line(row)}
    {/each}
    {#if below}
      <tr class="gap" aria-hidden="true"><td colspan="4">⋯</td></tr>
      {@render line(entry)}
    {/if}
  </tbody>
</table>

{#snippet line(row)}
  <tr class:yours={row.id === entry?.id}>
    <td>{row.rank}</td>
    <td class="name" class:unnamed={!row.name}>{row.name ?? 'Unnamed'}</td>
    <td>{row.score}</td>
    <td class="shape"><a href={linkOf(row.shape)}>{row.shape}</a></td>
  </tr>
{/snippet}

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  caption {
    caption-side: bottom;
    padding-top: 0.5rem;
    color: var(--muted);
    font-size: 0.85rem;
    text-align: left;
  }

  th,
  td {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--rule);
    text-align: left;
  }

  th {
    color: var(--muted);
    font-weight: 500;
    font-size: 0.85rem;
  }

  .shape {
    max-width: 0;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, monospace;
  }

  .name {
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .unnamed {
    color: var(--muted);
    font-style: italic;
  }

  a {
    color: inherit;
  }

  .yours {
    background: var(--wash);
    font-weight: 700;
  }

  .gap td {
    color: var(--muted);
    text-align: center;
  }
</style>
