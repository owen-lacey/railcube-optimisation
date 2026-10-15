<script>
  // The combined score with the weights yours to set: one layout drawn large with
  // the maths of its score under it (`ScoreMaths`), each weight a slider, and the
  // ten best of every legal crossed layout in sweeps.db under those weights as
  // tiles docked along the viewer's bottom (`TileStrip`). A slider re-ranks them
  // and picks the first. A weighting reads a layout only through its five numbers,
  // so each of the ten is a different five, shown by one layout that has them. A
  // figure on its own only, since the tiles are viewers of their own.
  import LayoutViewer from './LayoutViewer.svelte';
  import ScoreMaths from './ScoreMaths.svelte';
  import TileStrip from './TileStrip.svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { SWEEP_CROSSED_WEIGHTS } from '$lib/sweeps.js';
  import { ends, WEIGHTS } from '$lib/weighting.js';

  // `train` is the large viewer's: its callbacks, or null for no train. A slider
  // replaces `weights` rather than writing into it: an object handed in as a prop
  // is not reactive state, so a write into it would change nothing on screen.
  let {
    weights = $bindable(WEIGHTS),
    table = SWEEP_CROSSED_WEIGHTS,
    train = {},
  } = $props();

  // Each row carries its five readings, so it is what ScoreMaths reads.
  const best = $derived(ends(table, weights).best);
  const tracks = $derived(best.map(({ row, score }) => ({ id: row.id, shape: row.shape, score })));

  let picked = $state(0);
  const row = $derived(best[picked].row);

  const weigh = (name, value) => {
    weights = { ...weights, [name]: value };
    picked = 0;
  };

  // Narrow, the viewer is taller to leave the track room above the tiles.
  const wide = new MediaQuery('min-width: 40rem');
  const aspect = $derived(wide.current ? '16 / 10' : '4 / 3');
</script>

{#snippet maths()}
  <ScoreMaths readings={row} {weights} onweigh={weigh} max={table.maxWeights} />
{/snippet}

{#snippet tiles()}
  <TileStrip {tracks} bind:picked label="The ten best layouts under these weights" />
{/snippet}

<LayoutViewer
  shape={row.shape}
  {train}
  {aspect}
  transition={{ kind: 'move', pan: 0.6 }}
  caption={maths}
  dock={tiles}
/>
