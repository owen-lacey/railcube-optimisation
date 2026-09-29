<script>
  // One piece type as a card: outlined in the piece's own colour, with the
  // letter a shape string spells it with on a band of that colour underneath.
  import PieceViewer from './PieceViewer.svelte';
  import { PIECES } from '$lib/catalogue.js';

  // The canonical pose stands the inside curve side-on, hiding most of its rail;
  // turned a quarter clockwise, the rail faces the viewer.
  const POSES = { insideCurve: 'UL' };

  let { type } = $props();

  const piece = $derived(PIECES.find(p => p.type === type));
</script>

<figure style:--piece={piece.hex}>
  <PieceViewer {type} pose={POSES[type]} scale={1.6} aspect="1 / 1" label={piece.name} />
  <figcaption>{piece.letter}</figcaption>
</figure>

<style>
  figure {
    width: 100px;
    margin: 0;
    border: 2px solid var(--piece);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  figcaption {
    padding: 0.15rem 0;
    background: var(--piece);
    color: white;
    font-family: ui-monospace, monospace;
    font-size: 1rem;
    font-weight: 700;
    text-align: center;
  }
</style>
