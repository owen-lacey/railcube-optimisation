<script>
  // The combined score, worked out: one layout drawn large with the maths of its
  // score under it (`ScoreMaths`), and the crossed sweep's hundred best under the
  // post's weights as tiles docked along the viewer's bottom to pick it from
  // (`TileStrip`). The ranking is `scripts/rank-tracks.js`'s. A figure on its own
  // only, since the tiles are viewers of their own.
  import LayoutViewer from './LayoutViewer.svelte';
  import ScoreMaths from './ScoreMaths.svelte';
  import TileStrip from './TileStrip.svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { readingsOf } from '$lib/readings.js';
  import { SWEEP_CROSSED_RANKED } from '$lib/sweeps.js';

  // `train` is the large viewer's: its callbacks, or null for no train.
  let { ranked = SWEEP_CROSSED_RANKED, train = {} } = $props();

  const tracks = $derived(ranked.best);

  let picked = $state(0);
  const shape = $derived(tracks[picked].shape);

  // Narrow, the viewer is taller to leave the track room above the tiles.
  const wide = new MediaQuery('min-width: 40rem');
  const aspect = $derived(wide.current ? '16 / 10' : '4 / 3');
</script>

{#snippet maths()}
  <ScoreMaths readings={readingsOf(shape)} weights={ranked.weights} />
{/snippet}

{#snippet tiles()}
  <TileStrip {tracks} bind:picked label="The hundred best layouts" />
{/snippet}

<LayoutViewer
  {shape}
  {train}
  {aspect}
  transition={{ kind: 'move', pan: 0.6 }}
  caption={maths}
  dock={tiles}
/>
