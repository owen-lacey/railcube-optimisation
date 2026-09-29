<script>
  import TrackViewer from './TrackViewer.svelte';
  import { AXIS_GAP } from '$lib/render/dimensions.js';
  import { openScene, frame, extentOf, frameTight } from '$lib/scenes.js';

  let {
    shape = '',
    aspect = '16 / 10',
    // Off, a shape change is an instant redraw framed tight on that layout —
    // the trade the front page makes on a phone, where the fixed frame's empty
    // room costs more scale than the rearrangement is worth.
    sequence = true,
    drive = true,
    interactive = false,
    pace = 0.04,
    speed = 1.2,
    handover = 0.5,
    drop = 2,
    // How far the fixed frame reaches — the box the shapes were solved in. Unset
    // means the JS solver's own constraint; see `fixedFrame` in scenes.js.
    reach = undefined,
    // Draw the model's cell lattice around the layout and its train, framed tight
    // on that box rather than on the cubes alone.
    grid = false,
    // Caption the cell the train is in, `(x, y, z)` from the start cube.
    trainCaption = false,
    // Draw the origin's axis arrows, so the caption's x, y, z have a direction each.
    origin = false,
    // A slider for where the train is round the lap, left the start and right a
    // whole lap on. It follows the train until it is dragged, and then holds it.
    scrub = false,
  } = $props();

  // How far round the lap the train is, 0 to 1, and whether the slider has it.
  let lap = $state(0);
  let held = $state(false);

  // The cell the train is in, the model's `[right, up, forwards]` from the start
  // cube (docs/coordinates.md), or null while there is no train.
  let trainCell = $state(null);

  // The model's cell is [right, up, forwards]; the post's axes are x left, y
  // forwards, z up (docs/coordinates.md): the last two swap and x is negated.
  const readerFrame = ([right, up, forwards]) => [0 - right, forwards, up];

  // How far past the box's low corner the arrows and their labels reach, in cells.
  const AXIS_REACH = Math.ceil(AXIS_GAP + 0.5);

  const letters = $derived(shape.trim().toUpperCase());

  // The shape is re-derived through `chainOpen`, which reports rather than
  // refuses: an unfinished or stuck route is drawn as far as it goes, with a
  // piece that has nowhere to go flashing red where it was asked to land.
  // `routeOf` still throws on a letter outside the six piece types, which is
  // the one thing left that blanks the viewer.
  const result = $derived.by(() => {
    if (!letters) return { state: 'empty' };
    try {
      const { pieces, closed, offender } = openScene(letters);
      const box = grid || origin ? extentOf(pieces) : null;
      // The arrows stand outside the box's low corner, so the frame has to reach them.
      const framed = origin
        ? { lo: [box.lo[0], box.lo[1] - AXIS_REACH, box.lo[2] - AXIS_REACH], hi: [box.hi[0] + AXIS_REACH, box.hi[1], box.hi[2]] }
        : box;
      const camera = framed ? frameTight(framed) : frame(pieces);
      return { state: 'ok', pieces, closed, offender, box, camera };
    } catch (error) {
      return { state: 'invalid', message: error.message };
    }
  });
</script>

{#if result.state === 'ok'}
  <TrackViewer
    pieces={result.pieces}
    camera={result.camera}
    drive={drive && result.closed}
    {sequence}
    {pace}
    {speed}
    {handover}
    {drop}
    {reach}
    grid={grid ? result.box : null}
    {aspect}
    {interactive}
    label="The layout {letters}"
    origin={origin ? result.box : null}
    onTrainCell={cell => (trainCell = cell)}
    trainAt={scrub ? () => (held ? lap : null) : undefined}
    onTrainAt={scrub ? f => { if (!held) lap = f; } : undefined}
  />
  {#if scrub && drive && result.closed && !sequence}
    <input
      class="scrub"
      type="range"
      min="0"
      max="1"
      step="any"
      bind:value={lap}
      oninput={() => (held = true)}
      aria-label="Where the train is round the lap"
    />
  {/if}
  {#if trainCaption && drive && result.closed}
    <p class="caption">
      Train in cell {trainCell ? `(${readerFrame(trainCell).join(', ')})` : '—'}
    </p>
  {/if}
{:else}
  <div class="empty" style:aspect-ratio={aspect}>
    {#if result.state === 'invalid'}
      <p class="failed">Not a legal track: {result.message}.</p>
      <p class="shape">{letters}</p>
    {:else}
      <p>Nothing to draw yet — give it a shape string.</p>
    {/if}
  </div>
{/if}

<style>
  .empty {
    display: grid;
    place-items: center;
    align-content: center;
    text-align: center;
  }

  .empty p {
    margin: 0;
  }

  .caption {
    text-align: center;
    font-family: ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    color: var(--grid-color);
  }

  .scrub {
    display: block;
    width: 100%;
    accent-color: var(--grid-color);
  }
</style>
