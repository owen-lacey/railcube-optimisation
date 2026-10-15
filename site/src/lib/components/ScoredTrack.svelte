<script>
  // The crossed sweep's ten best or ten worst, as `RankedTracks` steps through them,
  // each with its scorecard laid over the top-left corner of the viewer. A figure —
  // see `$lib/figure.js` — but on its own only: a host draws the view, and the
  // scorecard with it would need the host to draw overlays.
  import RankedTracks from './RankedTracks.svelte';
  import Scorecard from './Scorecard.svelte';

  // As `RankedTracks`'.
  let { end = 'best', count = 10, aspect = '16 / 10', train = {} } = $props();
</script>

<RankedTracks {end} {count} {aspect} {train}>
  {#snippet overlay(shape)}
    <Scorecard {shape} />
  {/snippet}
</RankedTracks>
