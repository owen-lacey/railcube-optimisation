<script>
  // A track, shown for its own sake: the layout, driven, and free to be handled.
  // A figure — see `$lib/figure.js`.
  import Frame from './Frame.svelte';

  let { shape } = $props();
</script>

<Frame view={{ shape }} />
