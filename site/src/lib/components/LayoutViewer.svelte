<script>
  // A layout from its shape string: a viewing pane, and a caption under it for
  // whatever the figure says or offers about what is in the pane.
  import TrackViewer from './TrackViewer.svelte';
  import LayoutCard from './LayoutCard.svelte';
  import { attachControls } from '$lib/render/controls.js';
  import { layoutScene } from '$lib/scenes.js';

  let {
    shape = '',
    aspect = '16 / 10',
    // Letters → scene. `layoutScene` frames the cubes; `cellScene` draws them in
    // their lattice with the origin's axes. Both in scenes.js.
    scene = layoutScene,
    // What a shape change looks like — see `transition` in TrackViewer. A redraw
    // is framed tight on each layout; a tumble on a fixed box, so it never moves.
    transition = { kind: 'redraw' },
    // The train's callbacks, or null for no train — see `train` in TrackViewer.
    // There is only ever a train on a route that closes.
    train = {},
    // Handling, or null for a viewer that cannot be handled — see TrackViewer.
    controls = attachControls,
    // Hold the train where it is, and anything else moving.
    paused = false,
    // The card's footer, given the scene, or undefined while there is nothing drawn.
    // Unset, the card has none.
    caption = undefined,
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
</script>

{#snippet footer()}
  {@render caption(result.scene)}
{/snippet}

<!-- The footer is there whether or not anything is drawn: a figure in it may be
     what says what to draw. -->
<LayoutCard footer={caption ? footer : undefined}>
  {#if result.state === 'ok'}
    <TrackViewer
      pieces={result.scene.pieces}
      camera={result.scene.camera}
      grid={result.scene.grid ?? null}
      origin={result.scene.origin ?? null}
      train={result.scene.closed ? train : null}
      {transition}
      alarm={result.scene.offender?.id ?? null}
      {controls}
      {aspect}
      {paused}
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
</style>
