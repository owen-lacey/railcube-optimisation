<script>
  // A builder's buttons: one per piece in its colour, and a backspace set apart.
  import Delete from '@lucide/svelte/icons/delete';
  import { PIECES } from '$lib/catalogue.js';

  // `disabled` stops adding; `spent` is the letters with none left to add;
  // `canRemove` is whether there is a piece to take off.
  let { disabled = false, spent = new Set(), canRemove = false, onadd, onremove } = $props();
</script>

<div class="keys">
  {#each PIECES as piece (piece.type)}
    <button
      type="button"
      class="piece"
      style:--piece={piece.hex}
      disabled={disabled || spent.has(piece.letter)}
      onclick={() => onadd(piece.letter)}
      aria-label={spent.has(piece.letter) ? `${piece.name}: none left` : `Add piece: ${piece.name}`}
      title={spent.has(piece.letter) ? `${piece.name}: none left` : piece.name}
    >{piece.letter}</button>
  {/each}
  <button
    type="button"
    class="remove"
    disabled={!canRemove}
    onclick={onremove}
    aria-label="Remove the last piece"
    title="Remove the last piece"
  ><Delete fill="currentColor" aria-hidden="true" /></button>
</div>

<style>
  .keys {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  button {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 0.5rem;
    font: inherit;
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .piece {
    border: none;
    background: var(--piece);
    color: var(--page);
    font-family: ui-monospace, monospace;
    font-size: 1.25rem;
    font-weight: 700;
  }

  /* Set apart from the pieces: outlined rather than filled, and a little further
     off, so it reads as an action on the track rather than one more piece. */
  .remove {
    width: 56px;
    margin-left: 0.5rem;
    border: 2px solid var(--card-border);
    background: transparent;
    color: inherit;
  }

  /* The icon's body is filled, so the × inside it has to be cut out in the page
     colour or it vanishes into the fill. The body is the icon's first path. */
  .remove :global(svg path:not(:first-of-type)) {
    stroke: var(--wash, #fff);
  }
</style>
