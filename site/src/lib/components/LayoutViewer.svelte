<script>
  // A layout from its shape string: a viewing pane, and a caption under it for
  // whatever the figure says or offers about what is in the pane.
  //
  // In the page it is never handled, so a drag over it scrolls the page. A button
  // opens it full screen (`ExpandingCard`), and only there can it be turned,
  // zoomed and panned.
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
    // Handling full screen, or null for a viewer that cannot be opened full screen
    // — see TrackViewer. In the page it is never handled.
    controls = attachControls,
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
  let handled = $state(false);

  // The overlay's corner of the pane, to its far edges, so the track is framed
  // clear of it in the page. Full screen there is room enough, and the track is
  // centred again. Read off `handled` rather than `expanded`, which holds until
  // the card has shrunk back: the track sets off for its place in the page as the
  // card does.
  let overlaid = $state(null);
  let overlayWidth = $state(0);
  let overlayHeight = $state(0);
  const overlayBox = $derived(overlaid && overlayWidth && !handled
    ? { width: overlaid.offsetLeft + overlayWidth, height: overlaid.offsetTop + overlayHeight }
    : null);

  // The dock, down to the bottom edge, so the track is framed clear of it, full
  // screen too.
  let docked = $state(null);
  let dockWidth = $state(0);
  let dockHeight = $state(0);
  const dockBox = $derived(docked && dockWidth && dockHeight
    ? { edge: 'bottom', width: dockWidth, height: dockHeight + parseFloat(getComputedStyle(docked).bottom) }
    : null);

  const reserved = $derived(overlayBox ?? dockBox);
</script>

{#snippet footer()}
  {@render caption(result.scene)}
{/snippet}

<!-- The footer is there whether or not anything is drawn: a figure in it may be
     what says what to draw. -->
<ExpandingCard footer={caption ? footer : undefined} label="The layout {letters}, full screen" bind:expanded bind:handled>
  {#snippet children(toggle)}
    {#if result.state === 'ok'}
      {#if controls}{@render toggle()}{/if}
      {#if overlay}
        <div class="overlay" bind:this={overlaid} bind:offsetWidth={overlayWidth} bind:offsetHeight={overlayHeight}>
          {@render overlay(result.scene)}
        </div>
      {/if}
      {#if dock}
        <div class="dock" bind:this={docked} bind:offsetWidth={dockWidth} bind:offsetHeight={dockHeight}>
          {@render dock(result.scene)}
        </div>
      {/if}
      <TrackViewer
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
        controls={handled ? controls : null}
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
  /* Clear of the reset button (top right) and the toggle (bottom right). It never
     takes a drag from the viewer under it. */
  .overlay {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 1;
    pointer-events: none;
  }

  /* Clear of the toggle (bottom right, 36px, 0.5rem in from the edge). */
  .dock {
    position: absolute;
    left: 0.5rem;
    right: calc(1rem + 36px);
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
