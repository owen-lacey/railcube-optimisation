<script>
  // Story fixture: OrientationChip among prose, at the post's paragraph size.
  import OrientationChip from './OrientationChip.svelte';
</script>

<p>
  The train sets off facing <OrientationChip orientation="DF" />, meets the
  cross for the first time at <OrientationChip orientation="DL" />, and comes
  back round the other half of the figure-of-eight at
  <OrientationChip orientation="DR" />, with enough words after it that the line
  wraps and the spacing between lines can be judged by eye.
</p>

<style>
  p {
    max-width: 38rem;
    font-size: 1.0625rem;
    line-height: 1.65;
  }
</style>
