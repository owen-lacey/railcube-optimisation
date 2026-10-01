<script>
  // Story fixture: Highlight among prose, at the post's paragraph size.
  import Highlight from './Highlight.svelte';

  let { colour } = $props();
</script>

<p>
  The coordinates of the train are given by how many cubes along it is from the
  starting <Highlight {colour}>highlighted cube</Highlight>, with enough words
  after it that the line wraps and the spacing between lines can be judged by eye.
</p>

<style>
  p {
    max-width: 38rem;
    font-size: 1.0625rem;
    line-height: 1.65;
  }
</style>
