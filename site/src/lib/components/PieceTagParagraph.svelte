<script>
  // Story fixture: PieceTag among prose, at the post's paragraph size.
  import PieceTag from './PieceTag.svelte';
</script>

<p>
  A track that reads <PieceTag letter="S" /> <PieceTag letter="L" />
  <PieceTag letter="R" /> <PieceTag letter="I" /> <PieceTag letter="O" />
  <PieceTag letter="X" /> goes straight, turns left, turns right, dips inside,
  swings outside and crosses itself, with enough words after it that the line
  wraps and the spacing between lines can be judged by eye.
</p>

<style>
  p {
    max-width: 38rem;
    font-size: 1.0625rem;
    line-height: 1.65;
  }
</style>
