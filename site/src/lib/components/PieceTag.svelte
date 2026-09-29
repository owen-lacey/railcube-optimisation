<script>
  // A piece's letter as a small badge in the piece's own colour, for use inside
  // a line of prose. Inline, so it takes the surrounding font and line height.
  import { PIECES } from '$lib/catalogue.js';

  let { letter } = $props();

  const piece = $derived(PIECES.find(p => p.letter === letter));
</script>

<span style:--piece={piece.hex}>{piece.letter}</span>

<style>
  span {
    padding: 0 0.35em;
    border-radius: 0.3em;
    background: var(--piece);
    color: white;
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
    font-weight: 700;
    line-height: inherit;
  }
</style>
