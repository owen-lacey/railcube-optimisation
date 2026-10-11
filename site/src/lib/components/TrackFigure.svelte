<script>
  // A track, shown for its own sake: the layout, driven, and free to be handled.
  // A figure — see `$lib/figure.js`.
  import Frame from './Frame.svelte';

  // `scene` is letters → scene, from scenes.js; unset, `layoutScene`.
  let { shape, scene = undefined } = $props();
</script>

<Frame view={{ shape, scene }} />
