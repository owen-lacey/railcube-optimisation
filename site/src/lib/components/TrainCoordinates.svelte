<script>
  // Where the train is, as the post's coordinates: a layout in its cell lattice,
  // a caption reading out the cell the train is entering, and a slider for which
  // piece it is on.
  import LayoutViewer from './LayoutViewer.svelte';
  import TrainScrubber from './TrainScrubber.svelte';
  import { axesScene } from '$lib/scenes.js';

  let {
    shape,
    // What the caption reads out: 'position', the cell the train is in, `(x, y, z)`
    // from the start cube; or 'position-pose', that and the pose of the piece it
    // last entered.
    readout = 'position',
    // Letters → scene: `axesScene` draws the origin's axes beside the lattice,
    // `cellScene` the lattice alone. Both in scenes.js.
    scene = axesScene,
    aspect = undefined,
  } = $props();

  // Which piece the train is on, in route order, and whether the slider has it.
  let at = $state(0);
  let held = $state(false);
  // The cell the train is in, the model's `[right, up, forwards]` from the start
  // cube (docs/coordinates.md), and the pose of the piece it last entered, `'DF'`
  // say; each null while there is no train.
  let cell = $state(null);
  let pose = $state(null);

  const train = {
    at: () => (held ? at : null),
    onAt: i => { if (!held) at = i; },
    onCell: c => (cell = c),
    onPose: p => (pose = p),
  };

  // The model's cell is [right, up, forwards]; the post's axes are x left, y
  // forwards, z up (docs/coordinates.md): the last two swap and x is negated.
  const readerFrame = ([right, up, forwards]) => [0 - right, forwards, up];
</script>

<LayoutViewer {shape} {aspect} {scene} {train}>
  {#snippet caption({ pieces })}
    <p class="caption">
      Train entering cell {cell ? `(${readerFrame(cell).join(', ')})` : '—'}{#if readout === 'position-pose'}, pose {pose ?? '—'}{/if}
    </p>
    <TrainScrubber {pieces} bind:at bind:held />
  {/snippet}
</LayoutViewer>
