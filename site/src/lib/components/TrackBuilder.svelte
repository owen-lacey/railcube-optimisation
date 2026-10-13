<script>
  // Build a track by clicking pieces onto it, one at a time, from the start cell.
  //
  // It is `Sketch` with buttons for a keyboard, and everything that makes a track
  // being built different from one being shown is `TrackViewer`'s grow mode: the
  // pieces already down never move, a new one slides onto the end, removing the
  // last slides it back off, a piece with nowhere to go is drawn where it was
  // asked to go and pulses red, and the train appears once the loop closes.
  //
  // What is its own is the camera. The frame starts wide (`BUILD_FLOOR`) rather
  // than tight, and the viewer can be handled — turned, zoomed and slid about, by
  // mouse or by touch — without the next piece putting the camera back.
  //
  // The keyboard works too: the six letters, the arrows as a d-pad (forwards is a
  // straight, left and right the two flat curves), and Backspace.
  //
  // In the page it cannot be handled, so a drag over it scrolls the page: turning,
  // zooming and panning are full screen's, behind `ExpandingCard`'s button. The
  // buttons and the keys work either way.
  import { onMount } from 'svelte';
  import TrackViewer from './TrackViewer.svelte';
  import ExpandingCard from './ExpandingCard.svelte';
  import PieceKeys from './PieceKeys.svelte';
  import BuildPrompt from './BuildPrompt.svelte';
  import { attachControls } from '../render/controls.js';
  import { openScene, BUILD_FLOOR } from '$lib/scenes.js';
  import { claimKeys } from '$lib/keys.js';
  import { LIMIT, seed, added, removed, keyAction } from '$lib/building.js';

  let {
    shape = '',
    // Unset, it is wide on a wide screen and square on a phone, where 16/10 of a
    // narrow column leaves too little to handle.
    aspect = undefined,
    pace = 0.1,
    speed = 1.2,
  } = $props();

  let letters = $state(seed(shape));

  // The prop is the starting shape, not the shape: clicking takes over from it.
  $effect(() => { letters = seed(shape); });

  const view = $derived(letters
    ? openScene(letters)
    : { pieces: [], closed: false, offender: null });

  // Adding stops in three cases. A piece that cannot go down: nothing after it could
  // be built, so the only thing left to do is take it off again. A closed loop: it
  // is finished, and a piece added to it would only be one more collision. And the
  // limit.
  const done = $derived(Boolean(view.offender) || view.closed || letters.length >= LIMIT);

  let narrow = $state(false);
  onMount(() => {
    const query = window.matchMedia('(max-width: 600px)');
    const update = () => { narrow = query.matches; };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  });
  const shapeOfViewer = $derived(aspect ?? (narrow ? '1 / 1' : '16 / 10'));

  let expanded = $state(false);
  let handled = $state(false);
  // With no pieces there is nothing to turn about, so the viewer is a prompt only.
  const empty = $derived(!letters);

  // In the page the keys go to whichever builder is mostly on screen (`keys.js`);
  // full screen, the card hands them over itself.
  let builder = $state(null);
  onMount(() => claimKeys(builder, onKeydown));

  const add = letter => {
    if (!done) letters = added(letters, letter);
  };
  const removeLast = () => { letters = removed(letters); };

  /** The keyboard: a letter or an arrow adds a piece, Backspace takes one off. */
  function onKeydown(event) {
    const action = keyAction(event);
    if (!action) return;
    if (action.remove) removeLast();
    else add(action.add);
    event.preventDefault();
  }
</script>

<div bind:this={builder}>
  <ExpandingCard
    footer={keys}
    label="Track builder: type S L R I O X or use the arrow keys to add a piece, Backspace to remove one"
    onkeydown={onKeydown}
    bind:expanded
    bind:handled
  >
    {#snippet children(toggle)}
      {@render toggle()}
      <TrackViewer
        pieces={view.pieces}
        transition={{ kind: 'grow', pace, speed, from: BUILD_FLOOR }}
        alarm={view.offender?.id ?? null}
        train={view.closed ? {} : null}
        controls={handled && !empty ? attachControls : null}
        aspect={expanded ? 'auto' : shapeOfViewer}
        blueprint
        label={letters ? `The track ${letters}, as far as it has been built` : 'An empty stage'}
      />
      {#if empty}<BuildPrompt />{/if}
    {/snippet}
  </ExpandingCard>
</div>

{#snippet keys()}
  <PieceKeys disabled={done} canRemove={Boolean(letters)} onadd={add} onremove={removeLast} />
{/snippet}
