<script>
  // A track with its scorecard laid over the top-left corner of the viewer. A
  // figure — see `$lib/figure.js` — but on its own only: a host draws the view, and
  // the scorecard with it would need the host to draw overlays.
  import Frame from './Frame.svelte';
  import Scorecard from './Scorecard.svelte';

  // `scene` is letters → scene, from scenes.js; unset, `layoutScene`.
  let { shape, scene = undefined } = $props();
</script>

<Frame view={{ shape, scene }}>
  {#snippet overlay()}
    <Scorecard {shape} />
  {/snippet}
</Frame>
