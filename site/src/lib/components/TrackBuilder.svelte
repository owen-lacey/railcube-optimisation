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
  // The keyboard works too, with no click needed: the six letters, the arrows as a
  // d-pad (forwards is a straight, left and right the two flat curves), and
  // Backspace. They go to whichever builder is mostly on screen — see `keys.js`.
  import { onMount } from 'svelte';
  import TrackViewer from './TrackViewer.svelte';
  import PieceKeys from './PieceKeys.svelte';
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

<div
  class="builder"
  role="group"
  aria-label="Track builder: type S L R I O X or use the arrow keys to add a piece, Backspace to remove one"
  bind:this={builder}
>
  <TrackViewer
    pieces={view.pieces}
    transition={{ kind: 'grow', pace, speed, from: BUILD_FLOOR }}
    alarm={view.offender?.id ?? null}
    train={view.closed ? {} : null}
    controls={attachControls}
    aspect={shapeOfViewer}
    label={letters ? `The track ${letters}, as far as it has been built` : 'An empty stage'}
  />

  <div class="below">
    <PieceKeys disabled={done} canRemove={Boolean(letters)} onadd={add} onremove={removeLast} />
  </div>
</div>

<style>
  .below {
    margin-top: 0.75rem;
  }
</style>
