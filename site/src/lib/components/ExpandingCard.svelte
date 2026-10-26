<script>
  // A `LayoutCard` that a button opens full screen. Full screen is the same card
  // moved into the top layer, not a copy: a `<dialog>` open in place, laid out as
  // if it were not there, then opened modally. So whatever the card holds — a
  // train, a paused state, a half-built track — carries on as it was.
  //
  // In the page a drag over the card scrolls the page, unless the hand is on: then,
  // as full screen, it turns, zooms and pans the view. Closing full screen turns the
  // hand off again.
  //
  // The card's pane is `children`, handed the card's buttons to place, or not, in
  // it: the full-screen toggle, for `TrackViewer`'s `tools`, and the hand, in the
  // page only, for its `cornerTools`. `expanded` (laid out full screen), `full`
  // (full screen and not on the way back) and `handled` (open for handling: full,
  // or the hand on) are bound out, for the pane and the footer to read. `onkeydown` has the keys while it is
  // full screen: focus cannot leave a modal dialog, and the dialog itself takes it
  // when anything else in it is clicked.
  import Hand from '@lucide/svelte/icons/hand';
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import Minimize2 from '@lucide/svelte/icons/minimize-2';
  import LayoutCard from './LayoutCard.svelte';
  import { GROW, GROW_CSS } from '$lib/grow.js';

  let {
    children,
    footer = undefined,
    label,
    expanded = $bindable(false),
    full = $bindable(false),
    handled = $bindable(false),
    onkeydown = undefined,
  } = $props();


  let dialog = $state(null);
  let toggle = $state(null);
  let space = $state(null);
  let moving = null;
  let reduced = false;
  // The room the card took in the page, kept while it is full screen so the page
  // does not close up under it and scroll.
  let room = $state(null);
  let hand = $state(false);

  $effect(() => { handled = full || hand; });

  // The card's box in the page, as keyframe values for the dialog's own box.
  function boxOf({ top, left, width, height }) {
    return { top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px`, padding: '0px' };
  }
  const FULL = { top: '0px', left: '0px', width: '100%', height: '100%', padding: '0.75rem' };

  // The dialog's box moves rather than being scaled, so the viewer is resized every
  // frame and the track grows with it, square rather than stretched.
  function grow(from, to) {
    const timing = { duration: GROW * 1000, easing: GROW_CSS };
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
    full = true;
    if (!reduced) grow(boxOf(rect), FULL);
  }

  // The button and Escape shrink it back first; any other close (a phone's back
  // gesture) lands in `closed` straight away.
  async function dismiss() {
    if (moving || !expanded) return;
    full = false;
    hand = false;
    if (!reduced) await grow(FULL, boxOf(space.getBoundingClientRect()));
    dialog.close();
  }

  // Escape is taken at the key rather than at the dialog's `cancel`, which a
  // browser lets go uncancelled unless the page has been interacted with since
  // the dialog opened.
  function keydown(event) {
    if (!expanded) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
      return;
    }
    if (handled) onkeydown?.(event);
  }

  // However it is closed, it lands here and is opened in place again. Closing to
  // go full screen lands here too, after the fact, and is already open again.
  function closed() {
    if (dialog.open) return;
    moving?.cancel();
    dialog.show();
    expanded = false;
    full = false;
    hand = false;
    room = null;
    toggle?.focus({ preventScroll: true });
  }
</script>

{#snippet grip()}
  {#if !full}
    <button
      type="button"
      onpointerdown={event => event.stopPropagation()}
      ontouchstart={event => event.stopPropagation()}
      onclick={() => (hand = !hand)}
      aria-pressed={hand}
      aria-label={hand ? 'Stop turning the view' : 'Turn, zoom and pan the view'}
      title={hand ? 'Stop turning the view' : 'Turn, zoom and pan the view'}
    >
      <Hand aria-hidden="true" />
    </button>
  {/if}
{/snippet}

{#snippet button()}
  <button
    type="button"
    bind:this={toggle}
    onpointerdown={event => event.stopPropagation()}
    ontouchstart={event => event.stopPropagation()}
    onclick={() => (expanded ? dismiss() : expand())}
    aria-label={expanded ? 'Close the full-screen view' : 'Open full screen'}
    title={expanded ? 'Close the full-screen view' : 'Open full screen'}
  >
    {#if expanded}<Minimize2 aria-hidden="true" />{:else}<Maximize2 aria-hidden="true" />{/if}
  </button>
{/snippet}

<div class="room" bind:this={space} style:height={room && `${room.height}px`} style:margin-bottom={room?.margin}>
  <!-- Open from the first paint, so a prerendered page shows the card. Focusable
       from script only, so a click anywhere in it keeps the keys in it. -->
  <dialog bind:this={dialog} open tabindex="-1" onclose={closed} onkeydown={keydown} aria-label={label}>
    <LayoutCard {footer}>
      <div class="pane">
        {@render children(button, grip)}
      </div>
    </LayoutCard>
  </dialog>
</div>

<style>
  /* The browser paints a dialog's text in its own default colour, open or modal,
     so the card would not take the page's ink without this. */
  dialog {
    color: inherit;
  }

  dialog:focus {
    outline: none;
  }

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
</style>
