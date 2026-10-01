<script>
  import TrackViewer from './TrackViewer.svelte';
  import PlayPause from './PlayPause.svelte';
  import LayoutCard from './LayoutCard.svelte';
  import { axisAnchor, LABEL_SPOTS } from '$lib/render/axes.js';
  import { openScene, frame, extentOf, frameFit, cornersOf } from '$lib/scenes.js';

  let {
    shape = '',
    aspect = '16 / 10',
    // What a shape change looks like. 'none' is an instant redraw framed tight on
    // that layout — the trade the front page makes on a phone, where the fixed
    // frame's empty room costs more scale than a rearrangement is worth. 'tumble'
    // collapses the old layout and builds the new one out of the pieces that fall;
    // 'build' empties the stage and assembles the new one from off the edge of the
    // frame, framed tight like 'none'.
    change = 'none',
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
    // Draw the viewer on a blueprint's sheet of dots, reaching every edge of the
    // canvas. It does not change the framing. On for every layout; a single piece
    // is drawn by `PieceViewer`, which leaves it off.
    blueprint = true,
    // Caption the cell the train is in, `(x, y, z)` from the start cube.
    trainCaption = false,
    // Draw the origin's axis arrows, so the caption's x, y, z have a direction each.
    origin = false,
    // A slider for which piece the train is on, split into one segment per piece
    // in route order and coloured as that piece, with a play/pause beside it. It
    // snaps to a piece's start, which puts the train where it enters that piece;
    // the right end is a whole lap on. Played, the train steps piece to piece
    // rather than gliding, and the slider follows it until dragged or paused.
    scrub = false,
    // Hold the train where it is, and anything else moving.
    paused = false,
    // Extra controls for the card's footer, after the caption and scrubber.
    footer = undefined,
  } = $props();

  // Which piece the train is on, in route order, and whether the slider has it.
  let at = $state(0);
  let held = $state(false);

  // The cell the train is in, the model's `[right, up, forwards]` from the start
  // cube (docs/coordinates.md), or null while there is no train.
  let trainCell = $state(null);

  // The model's cell is [right, up, forwards]; the post's axes are x left, y
  // forwards, z up (docs/coordinates.md): the last two swap and x is negated.
  const readerFrame = ([right, up, forwards]) => [0 - right, forwards, up];

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
      // The arrows stand outside the box's low corner, so the frame has to reach
      // them — their corner and each label, which is past each tip.
      const anchor = origin ? axisAnchor(box) : null;
      const arrows = origin
        ? [anchor, ...LABEL_SPOTS.map(({ position }) => position.map((v, a) => v + anchor[a]))]
        : [];
      const camera = box ? frameFit([...cornersOf(box), ...arrows]) : frame(pieces);
      return { state: 'ok', pieces, closed, offender, box, camera };
    } catch (error) {
      return { state: 'invalid', message: error.message };
    }
  });

  const showScrub = $derived(result.state === 'ok' && scrub && drive && result.closed && change === 'none');
  // The slider's track: a segment per piece, each its piece's colour, those from
  // the thumb on faded. A boundary sits where the thumb's centre does at that
  // piece, and the thumb's centre stops half a thumb short of each end, so the
  // bar does too. Every segment gives up half a gap at each end, the end ones
  // included, so all of them are the same length.
  const segments = $derived.by(() => {
    if (result.state !== 'ok') return null;
    const n = result.pieces.length;
    const edge = i => `calc(var(--thumb) / 2 + (100% - var(--thumb)) * ${i / n})`;
    const stops = result.pieces.map(({ color }, i) => {
      const paint = i < at ? color : `color-mix(in srgb, ${color} var(--fade), transparent)`;
      const from = `calc(${edge(i)} + var(--gap) / 2)`;
      const to = `calc(${edge(i + 1)} - var(--gap) / 2)`;
      return `transparent ${from}, ${paint} ${from} ${to}, transparent ${to}`;
    });
    return `linear-gradient(to right, ${stops.join(', ')})`;
  });

  const showCaption = $derived(result.state === 'ok' && trainCaption && drive && result.closed);
</script>

{#snippet controls()}
  {#if showCaption}
    <p class="caption">
      Train entering cell {trainCell ? `(${readerFrame(trainCell).join(', ')})` : '—'}
    </p>
  {/if}
  {#if showScrub}
    <div class="scrubber">
      <PlayPause bind:playing={() => !held, playing => (held = !playing)} label="the train" />
      <input
        class="scrub"
        type="range"
        min="0"
        max={result.pieces.length}
        step="1"
        bind:value={at}
        style:--segments={segments}
        oninput={() => (held = true)}
        aria-label="Where the train is round the lap"
      />
    </div>
  {/if}
  {@render footer?.()}
{/snippet}

<LayoutCard footer={showScrub || showCaption || footer ? controls : undefined}>
  {#if result.state === 'ok'}
    <TrackViewer
      pieces={result.pieces}
      camera={result.camera}
      drive={drive && result.closed}
      sequence={change === 'tumble'}
      build={change === 'build'}
      {pace}
      {speed}
      {handover}
      {drop}
      {reach}
      grid={grid ? result.box : null}
      {blueprint}
      {aspect}
      {interactive}
      {paused}
      label="The layout {letters}"
      origin={origin ? result.box : null}
      onTrainCell={cell => (trainCell = cell)}
      trainAt={scrub ? () => (held ? at : null) : undefined}
      onTrainAt={scrub ? i => { if (!held) at = i; } : undefined}
    />
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
</LayoutCard>

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

  /* The play/pause and the slider are one control, so they stay on one line: the
     slider gives up width before the pair wraps. */
  .scrubber {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .scrubber > :global(.play-pause) {
    flex: none;
  }

  /* The thumb takes the play/pause's outline colour, so the two read as one control.
     A fixed width, and narrower only where the footer is. */
  .scrub {
    --thumb: 1.25rem;
    --track: 0.75rem;
    --gap: 2px;
    --fade: 35%;
    width: 20rem;
    min-width: 0;
    height: var(--thumb);
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  .scrub::-webkit-slider-runnable-track {
    height: var(--track);
    background: var(--segments);
  }

  .scrub::-moz-range-track {
    height: var(--track);
    background: var(--segments);
  }

  .scrub::-webkit-slider-thumb {
    width: var(--thumb);
    height: var(--thumb);
    margin-top: calc((var(--track) - var(--thumb)) / 2);
    border: 2px solid var(--card-footer);
    border-radius: 50%;
    background: currentColor;
    appearance: none;
  }

  .scrub::-moz-range-thumb {
    width: var(--thumb);
    height: var(--thumb);
    box-sizing: border-box;
    border: 2px solid var(--card-footer);
    border-radius: 50%;
    background: currentColor;
  }

  .scrub:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 4px;
    border-radius: calc(var(--thumb) / 2);
  }
</style>
