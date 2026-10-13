<script>
  // A `LayoutCard` that a button opens full screen. Full screen is the same card
  // moved into the top layer, not a copy: a `<dialog>` open in place, laid out as
  // if it were not there, then opened modally. So whatever the card holds — a
  // train, a paused state, a half-built track — carries on as it was.
  //
  // The card's pane is `children`, handed the toggle button to place, or not, in
  // it. `expanded` (laid out full screen) and `handled` (open for handling) are
  // bound out, for the pane and the footer to read. `onkeydown` has the keys while
  // it is full screen: focus cannot leave a modal dialog, and the dialog itself
  // takes it when anything else in it is clicked.
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import Minimize2 from '@lucide/svelte/icons/minimize-2';
  import LayoutCard from './LayoutCard.svelte';

  let {
    children,
    footer = undefined,
    label,
    expanded = $bindable(false),
    handled = $bindable(false),
    onkeydown = undefined,
  } = $props();

  // How long the card takes to grow to full screen, or back, in seconds.
  const GROW = 0.38;
  const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

  let dialog = $state(null);
  let toggle = $state(null);
  let space = $state(null);
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
    handled = false;
    room = null;
    toggle?.focus({ preventScroll: true });
  }
</script>

{#snippet button()}
  <!-- First in the card, so it is where focus lands either way. Its pointer-down
       stops here, so a click is not also a drag. -->
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
{/snippet}

<div class="room" bind:this={space} style:height={room && `${room.height}px`} style:margin-bottom={room?.margin}>
  <!-- Open from the first paint, so a prerendered page shows the card. Focusable
       from script only, so a click anywhere in it keeps the keys in it. -->
  <dialog bind:this={dialog} open tabindex="-1" onclose={closed} onkeydown={keydown} aria-label={label}>
    <LayoutCard {footer}>
      <div class="pane">
        {@render children(button)}
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
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: var(--card-footer);
    color: inherit;
    cursor: pointer;
  }
</style>
