<script>
  // A layout from its shape string: a viewing pane, and a caption under it for
  // whatever the figure says or offers about what is in the pane.
  //
  // In the page it is never handled, so a drag over it scrolls the page. A button
  // opens it full screen, and only there can it be turned, zoomed and panned. Full
  // screen is the same card moved into the top layer, not a copy: a `<dialog>`
  // open in place, laid out as if it were not there, then opened modally. So the
  // train, the paused state and whatever the caption holds carry on as they were.
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import Minimize2 from '@lucide/svelte/icons/minimize-2';
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
    // Handling full screen, or null for a viewer that cannot be opened full screen
    // — see TrackViewer. In the page it is never handled.
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

  // How long the card takes to grow to full screen, or back, in seconds.
  const GROW = 0.38;
  const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

  let dialog = $state(null);
  let toggle = $state(null);
  let space = $state(null);
  // Laid out full screen, which outlasts being handled: on the way back the view
  // eases home while the card shrinks.
  let expanded = $state(false);
  let handled = $state(false);
  let moving = null;
  let reduced = false;
  // The room the card took in the page, kept while it is full screen so the page
  // does not close up under it and scroll.
  let room = $state(null);

  // The card's box in the page, as keyframe values for the dialog's own box.
  function boxOf({ top, left, width, height }) {
    return { top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px`, padding: '0px' };
  }
  const FULL = { top: '0px', left: '0px', width: '100%', height: '100%', padding: '0.75rem' };

  // The dialog's box moves rather than being scaled, so the viewer is resized every
  // frame and the track grows with it, square rather than stretched.
  function grow(from, to) {
    const timing = { duration: GROW * 1000, easing: EASE };
    const backdrop = from === FULL ? [1, 0] : [0, 1];
    dialog.animate({ opacity: backdrop }, { ...timing, pseudoElement: '::backdrop' });
    moving = dialog.animate([from, to], timing);
    // Cancelled when the dialog is closed out from under it, which is not a failure.
    return moving.finished.catch(() => {}).finally(() => (moving = null));
  }

  function expand() {
    if (moving) return;
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const card = dialog.firstElementChild;
    const rect = card.getBoundingClientRect();
    room = { height: card.offsetHeight, margin: getComputedStyle(card).marginBottom };
    // Both in one task, so nothing is painted in between.
    dialog.close();
    dialog.showModal();
    expanded = true;
    handled = true;
    if (!reduced) grow(boxOf(rect), FULL);
  }

  // The button and Escape shrink it back first; any other close (a phone's back
  // gesture) lands in `closed` straight away.
  async function dismiss() {
    if (moving || !expanded) return;
    handled = false;
    if (!reduced) await grow(FULL, boxOf(space.getBoundingClientRect()));
    dialog.close();
  }

  // Escape is taken at the key rather than at the dialog's `cancel`, which a
  // browser lets go uncancelled unless the page has been interacted with since
  // the dialog opened.
  function keydown(event) {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault();
    dismiss();
  }

  // However it is closed, it lands here and is opened in place again. Closing to
  // go full screen lands here too, after the fact, and is already open again.
  function closed() {
    if (dialog.open) return;
    moving?.cancel();
    dialog.show();
    expanded = false;
    handled = false;
    room = null;
    toggle?.focus({ preventScroll: true });
  }
</script>

{#snippet footer()}
  {@render caption(result.scene)}
{/snippet}

<div class="room" bind:this={space} style:height={room && `${room.height}px`} style:margin-bottom={room?.margin}>
  <!-- Open from the first paint, so a prerendered page shows the card. -->
  <dialog bind:this={dialog} open onclose={closed} onkeydown={keydown} aria-label="The layout {letters}, full screen">
    <!-- The footer is there whether or not anything is drawn: a figure in it may be
         what says what to draw. -->
    <LayoutCard footer={caption ? footer : undefined}>
      {#if result.state === 'ok'}
        <div class="pane">
          {#if controls}
            <!-- First in the card, so it is where focus lands either way. Its
                 pointer-down stops here, so a click is not also a drag. -->
            <button
              type="button"
              class="toggle"
              bind:this={toggle}
              onpointerdown={event => event.stopPropagation()}
              onclick={() => (expanded ? dismiss() : expand())}
              aria-label={expanded ? 'Close the full-screen view' : 'Open full screen'}
              title={expanded ? 'Close the full-screen view' : 'Open full screen'}
            >
              {#if expanded}<Minimize2 aria-hidden="true" />{:else}<Maximize2 aria-hidden="true" />{/if}
            </button>
          {/if}
          <TrackViewer
            pieces={result.scene.pieces}
            camera={result.scene.camera}
            grid={result.scene.grid ?? null}
            origin={result.scene.origin ?? null}
            train={result.scene.closed ? train : null}
            {transition}
            alarm={result.scene.offender?.id ?? null}
            controls={handled ? controls : null}
            aspect={expanded ? 'auto' : aspect}
            {paused}
            blueprint
            label="The layout {letters}"
          />
        </div>
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
  </dialog>
</div>

<style>
  /* In the page the dialog is laid out as if it were not there. */
  dialog:not(:modal) {
    display: contents;
  }

  /* Full screen: the card fills the screen, the viewer whatever the footer leaves. */
  dialog:modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0.75rem;
    box-sizing: border-box;
    border: 0;
    background: var(--page);
    color: inherit;
  }

  dialog::backdrop {
    background: var(--page);
  }

  dialog:modal :global(.card) {
    display: flex;
    flex-direction: column;
    height: 100%;
    margin: 0;
    box-sizing: border-box;
  }

  .pane {
    position: relative;
  }

  dialog:modal .pane {
    flex: 1;
    min-height: 0;
  }

  dialog:modal .pane :global(.viewer) {
    height: 100%;
  }

  /* Matches the viewer's reset button, in the corner it leaves free. */
  .toggle {
    position: absolute;
    right: 0.5rem;
    bottom: 0.5rem;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 2px solid currentColor;
    border-radius: 0.5rem;
    background: var(--card-footer);
    color: inherit;
    cursor: pointer;
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
