<script>
  // A track's pieces against the box's: a row per piece type the inventory holds,
  // in the catalogue's order, an empty bordered slot for every piece of it, filled
  // in the piece's colour as the track uses one. A piece the box has no slot for is
  // drawn past the slots with no border; a slot the track leaves empty stays empty.
  // `mark`, 'match' or 'miss', is a ✓ or ✗ on the whole: whether the track spends
  // the box exactly. Laid over the viewer's corner, like `InventoryCard`.
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import { PIECES } from '$lib/catalogue.js';

  // `used` and `inventory` are both `{ [type]: count }`; `usedOf` in
  // `$lib/building.js` gives the first.
  let { used, inventory, mark = null } = $props();

  const rows = $derived(PIECES
    .filter(piece => (inventory[piece.type] ?? 0) > 0)
    .map(piece => ({ piece, count: used[piece.type] ?? 0, total: inventory[piece.type] })));
</script>

<div class="inventory">
  <dl aria-label="Pieces used, against the box">
    {#each rows as { piece, count, total } (piece.type)}
      <dt>{piece.name}</dt>
      <dd style:--piece={piece.hex}>
        <span class="slots" role="img" aria-label={`${count} of ${total}`}>
          {#each { length: Math.max(count, total) }, i (i)}<span
              class="slot"
              data-filled={i < count || undefined}
              data-over={i >= total || undefined}
            ></span>{/each}
        </span>
      </dd>
      <dd class="count">{count} / {total}</dd>
    {/each}
  </dl>
  <!-- Its room is kept with no mark, so the panel is one size throughout. -->
  <span class="mark {mark ?? ''}" aria-label={mark === 'match' ? 'Spends the box' : mark === 'miss' ? 'Does not spend the box' : undefined}>
    {#if mark === 'match'}<Check />{:else if mark === 'miss'}<X />{/if}
  </span>
</div>

<style>
  /* InventoryCard's look: small, and see-through like a callout. */
  .inventory {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.6rem;
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--card-footer) 85%, transparent);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  dl {
    display: grid;
    grid-template-columns: auto auto auto;
    align-items: center;
    gap: 0.1rem 0.75rem;
    margin: 0;
  }

  dt,
  dd {
    margin: 0;
  }

  .count {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .slots {
    display: flex;
    gap: 2px;
  }

  /* An empty slot is its border; a filled one the piece inside it; one past the
     slots the piece with no border. */
  .slot {
    box-sizing: border-box;
    width: 0.55rem;
    height: 0.55rem;
    border: 1px solid var(--grid-color);
    border-radius: 1px;
    transition: background-color 0.2s ease-out;
  }

  .slot[data-filled] {
    background: var(--piece);
  }

  .slot[data-over] {
    border-color: transparent;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 2em;
    color: var(--verdict-miss);
  }

  .mark.match {
    color: var(--verdict-match);
  }

  .mark :global(svg) {
    width: 2em;
    height: 2em;
    stroke-width: 3;
    animation: mark 0.3s ease-out;
  }

  @keyframes mark {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .slot {
      transition: none;
    }

    .mark :global(svg) {
      animation: none;
    }
  }
</style>
