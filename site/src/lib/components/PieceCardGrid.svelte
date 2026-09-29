<script>
  // Every piece type's card, as six in a row, two rows of three or three rows of
  // two — whichever is widest that fits. Never an uneven split like 4 + 2.
  import PieceCard from './PieceCard.svelte';
  import { PIECES } from '$lib/catalogue.js';
</script>

<div class="frame">
  <div class="grid">
    {#each PIECES as piece (piece.type)}
      <PieceCard type={piece.type} />
    {/each}
  </div>
</div>

<style>
  /* Columns follow the space the grid is given, not the viewport. */
  .frame {
    container-type: inline-size;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, 100px);
    justify-content: center;
    gap: 12px;
  }

  /* 3 × 100px + 2 gaps */
  @container (min-width: 324px) {
    .grid {
      grid-template-columns: repeat(3, 100px);
    }
  }

  /* 6 × 100px + 5 gaps */
  @container (min-width: 660px) {
    .grid {
      grid-template-columns: repeat(6, 100px);
    }
  }
</style>
