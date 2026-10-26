<script>
  // A layout from its shape string: a viewing pane, and a caption under it for
  // whatever the figure says or offers about what is in the pane.
  //
  // In the page a drag over it scrolls the page until the hand is on; full screen
  // (`ExpandingCard`) it is always handled — turned, zoomed and panned.
  import TrackViewer from './TrackViewer.svelte';
  import ExpandingCard from './ExpandingCard.svelte';
  import { attachControls } from '$lib/render/controls.js';
  import { layoutScene } from '$lib/scenes.js';

  let {
    shape = '',
    aspect = '16 / 10',
    // Letters → scene. `layoutScene` frames the cubes; `cellScene` draws them in
    // their lattice; `axesScene` adds the origin's axes, `lengthsScene` the
    // lattice's side lengths; `apartScene` and `joinedScene` outline each group's
    // ends, with callouts. All in scenes.js.
    scene = layoutScene,
    // What a shape change looks like — see `transition` in TrackViewer. A redraw
    // is framed tight on each layout; a tumble on a fixed box, so it never moves.
    transition = { kind: 'redraw' },
    // The train's callbacks, or null for no train — see `train` in TrackViewer.
    // There is only ever a train on a route that closes.
    train = {},
    // Hold the train where it is, and anything else moving.
    paused = false,
    // The card's footer, given the scene, or undefined while there is nothing drawn.
    // Unset, the card has none.
    caption = undefined,
    // Laid over the pane's top-left corner, given the scene, while there is one
    // drawn. Unset, nothing is.
    overlay = undefined,
    // Docked along the pane's bottom edge, given the scene, while there is one
    // drawn: unlike the overlay it takes clicks, and stays full screen. Unset,
    // nothing is.
    dock = undefined,
  } = $props();

  const letters = $derived(shape.trim().toUpperCase());

  // The shape is re-derived through `chainOpen`, which reports rather than
  // refuses: an unfinished or stuck route is drawn as far as it goes, with a
  // piece that has nowhere to go flashing red where it was asked to land.
  // `routeOf` still throws on a letter outside the six piece types, which is
  // the one thing left that blanks the viewer.
  const result = $derived.by(() => {
    if (!letters) return { state: 'empty' };
    try {
      return { state: 'ok', scene: scene(letters) };
    } catch (error) {
      return { state: 'invalid', message: error.message };
    }
  });

  // Laid out full screen, which outlasts being handled: on the way back the view
  // eases home while the card shrinks.
  let expanded = $state(false);
  let full = $state(false);
  let handled = $state(false);
  // The hand's corner, which the dock stops short of.
  let cornerWidth = $state(0);

  // The overlay's corner of the pane, to its far edges, so the track is framed
  // clear of it in the page. Full screen there is room enough, and the track is
  // centred again. Read off `full` rather than `expanded`, which holds until the
  // card has shrunk back: the track sets off for its place in the page as the
  // card does.
  let overlaid = $state(null);
  let overlayWidth = $state(0);
  let overlayHeight = $state(0);
  const overlayBox = $derived(overlaid && overlayWidth && !full
    ? { edge: 'top-left', width: overlaid.offsetLeft + overlayWidth, height: overlaid.offsetTop + overlayHeight }
    : null);

  // The dock, down to the bottom edge, so the track is framed clear of it, full
  // screen too.
  let docked = $state(null);
  let dockWidth = $state(0);
  let dockHeight = $state(0);
  const dockBox = $derived(docked && dockWidth && dockHeight
    ? { edge: 'bottom', width: dockWidth, height: dockHeight + parseFloat(getComputedStyle(docked).bottom) }
    : null);

  const reserved = $derived([overlayBox, dockBox].filter(Boolean));

  let track = $state(null);

  /** The part of the pane shots are framed in — see `region` in TrackViewer. */
  export function region() {
    return track?.region() ?? null;
  }
</script>

{#snippet footer()}
  {@render caption(result.scene)}
{/snippet}

<!-- The footer is there whether or not anything is drawn: a figure in it may be
     what says what to draw. -->
<ExpandingCard footer={caption ? footer : undefined} label="The layout {letters}, full screen" bind:expanded bind:full bind:handled>
  {#snippet children(toggle, hand)}
    {#if result.state === 'ok'}
      {#if overlay}
        <div class="overlay" bind:this={overlaid} bind:offsetWidth={overlayWidth} bind:offsetHeight={overlayHeight}>
          {@render overlay(result.scene)}
        </div>
      {/if}
      {#if dock}
        <div class="dock" style:--corner-width="{cornerWidth}px" bind:this={docked} bind:offsetWidth={dockWidth} bind:offsetHeight={dockHeight}>
          {@render dock(result.scene)}
        </div>
      {/if}
      <TrackViewer
        bind:this={track}
        pieces={result.scene.pieces}
        camera={result.scene.camera}
        grid={result.scene.grid ?? null}
        origin={result.scene.origin ?? null}
        lengths={result.scene.lengths ?? null}
        outlines={result.scene.outlines ?? []}
        ghosts={result.scene.ghosts ?? []}
        notes={result.scene.notes ?? []}
        train={result.scene.closed ? train : null}
        {transition}
        alarm={result.scene.offender?.id ?? null}
        highlight={result.scene.highlight ?? null}
        controls={handled ? attachControls : null}
        tools={toggle}
        cornerTools={hand}
        bind:cornerWidth
        aspect={expanded ? 'auto' : aspect}
        {paused}
        {reserved}
        blueprint
        label="The layout {letters}"
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
  {/snippet}
</ExpandingCard>

<style>
  /* Clear of the toolbar (top right). It never takes a drag from the viewer under it. */
  .overlay {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 1;
    pointer-events: none;
  }

  /* Short of the hand, and a gap, while there is one. */
  .dock {
    position: absolute;
    left: 0.5rem;
    right: calc(0.5rem + var(--corner-width) + min(var(--corner-width), 0.5rem));
    bottom: 0.5rem;
    z-index: 1;
  }

  .empty {
    display: grid;
    place-items: center;
    align-content: center;
    text-align: center;
  }

  .empty p {
    margin: 0;
  }
</style>
