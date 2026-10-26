<script>
  // How much of the inventory a track being built has spent: a row per piece type
  // the inventory holds, in the catalogue's order, each a small box in the piece's
  // colour for every piece of it, a box going as its piece is put down. Laid over
  // the viewer's corner, like the Scorecard.
  import { PIECES } from '$lib/catalogue.js';

  // `used` and `inventory` are both `{ [type]: count }`; `usedOf` in
  // `$lib/building.js` gives the first.
  let { used, inventory } = $props();

  const rows = $derived(PIECES
    .filter(piece => (inventory[piece.type] ?? 0) > 0)
    .map(piece => ({ piece, count: used[piece.type] ?? 0, total: inventory[piece.type] })));
</script>

<dl class="inventory" aria-label="Pieces used">
  {#each rows as { piece, count, total } (piece.type)}
    <dt>{piece.name}</dt>
    <dd style:--piece={piece.hex}>
      <span class="boxes" role="img" aria-label={`${count} of ${total} used`}>
        {#each { length: total }, i (i)}<span class="box" data-used={i >= total - count || undefined}></span>{/each}
      </span>
    </dd>
  {/each}
</dl>

<style>
  /* The Scorecard's look: small, and see-through like a callout. */
  .inventory {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
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

  /* Wraps when the card is given less room than a row needs. */
  .boxes {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  /* A used box keeps its place, fading out where it stood. */
  .box {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 1px;
    background: var(--piece);
    transition: opacity 0.2s ease-out;
  }

  .box[data-used] {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .box {
      transition: none;
    }
  }
</style>
