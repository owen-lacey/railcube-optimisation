<script>
  // Story fixture: PositionChip among prose, at the post's paragraph size, beside
  // an OrientationChip.
  import OrientationChip from './OrientationChip.svelte';
  import PositionChip from './PositionChip.svelte';
</script>

<p>
  Adding a track that finishes at <PositionChip at={[-3, 2, -2]} /> to one
  finishing at <PositionChip at={[4, -3, 0]} /> gives a track that finishes at
  <PositionChip at={[1, -1, -2]} />, and it is complete if it gets back to
  <PositionChip at={[0, 0, 0]} />, facing <OrientationChip orientation="DF" />.
  A piece on the floor at <PositionChip relative={[0, 0, 0]} /> must keep
  <PositionChip relative={[0, 0, 1]} /> clear, with enough words after it that the
  line wraps and the spacing between lines can be judged by eye.
</p>

<style>
  p {
    max-width: 38rem;
    font-size: 1.0625rem;
    line-height: 1.65;
  }
</style>
