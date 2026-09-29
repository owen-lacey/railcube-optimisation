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
  import Delete from '@lucide/svelte/icons/delete';
  import TrackViewer from './TrackViewer.svelte';
  import { openScene, BUILD_FLOOR } from '$lib/scenes.js';
  import { PIECES } from '$lib/catalogue.js';
  import { claimKeys } from '$lib/keys.js';
  import { chainOpen } from '../../../../src/track.js';
  import { routeOf } from '../../../../src/layouts.js';

  let {
    shape = '',
    // Unset, it is wide on a wide screen and square on a phone, where 16/10 of a
    // narrow column leaves too little to handle.
    aspect = undefined,
    pace = 0.1,
    speed = 1.2,
  } = $props();

  // Sketch's limit, for the same reason: past anything the toy can build.
  const LIMIT = 40;
  const LETTERS = PIECES.map(p => p.letter).join('');
  // The d-pad: forwards, left and right as the train sees them, since that is the
  // way the curves turn.
  const ARROWS = { ArrowUp: 'S', ArrowLeft: 'L', ArrowRight: 'R' };

  /**
   * A starting shape as the builder will hold it: only the six letters, and
   * stopped at the first piece the model rejects — which is kept, because it is
   * the one being complained about. Nothing after it could be built either.
   */
  function seed(text) {
    const letters = [...String(text).toUpperCase()]
      .filter(l => LETTERS.includes(l))
      .slice(0, LIMIT)
      .join('');
    const fault = letters && openScene(letters).offender;
    return fault ? letters.slice(0, fault.index + 1) : letters;
  }

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

  /**
   * Does the head sit on a cross already laid, so that a cross now is the train
   * coming back over it? That pass places nothing, and there is only one piece it
   * could be, so the builder puts it down rather than asking for it.
   */
  const meetsCross = text => {
    const { placed, faults } = chainOpen(routeOf(text + 'X'));
    return faults.length === 0 && placed.at(-1).revisit;
  };

  const add = letter => {
    if (done) return;
    letters += letter;
    if (letters.length < LIMIT && meetsCross(letters)) letters += 'X';
  };
  // A cross that was put down for you goes with the piece that led into it,
  // otherwise Backspace would leave the head stranded on a cross with no way on.
  const removeLast = () => {
    const last = view.pieces.length && chainOpen(routeOf(letters)).placed.at(-1).revisit;
    letters = letters.slice(0, last && letters.length > 1 ? -2 : -1);
  };

  /** The keyboard: a letter or an arrow adds a piece, Backspace takes one off. */
  function onKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const letter = ARROWS[event.key] ?? event.key.toUpperCase();
    if (event.key === 'Backspace') removeLast();
    else if (letter.length === 1 && LETTERS.includes(letter)) add(letter);
    else return;
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
    closed={view.closed}
    offender={view.offender}
    grow
    drive
    interactive
    from={BUILD_FLOOR}
    {pace}
    {speed}
    aspect={shapeOfViewer}
    label={letters ? `The track ${letters}, as far as it has been built` : 'An empty stage'}
  />

  <div class="keys">
    {#each PIECES as piece (piece.type)}
      <button
        type="button"
        class="piece"
        style:--piece={piece.hex}
        disabled={done}
        onclick={() => add(piece.letter)}
        aria-label={`Add piece: ${piece.name}`}
        title={piece.name}
      >{piece.letter}</button>
    {/each}
    <button
      type="button"
      class="remove"
      disabled={!letters}
      onclick={removeLast}
      aria-label="Remove the last piece"
      title="Remove the last piece"
    ><Delete fill="currentColor" aria-hidden="true" /></button>
  </div>
</div>

<style>
  .keys {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  button {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 0.5rem;
    font: inherit;
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .piece {
    border: none;
    background: var(--piece);
    color: white;
    font-family: ui-monospace, monospace;
    font-size: 1.25rem;
    font-weight: 700;
  }

  /* Set apart from the pieces: outlined rather than filled, and a little further
     off, so it reads as an action on the track rather than one more piece. */
  .remove {
    width: 56px;
    margin-left: 0.5rem;
    border: 2px solid currentColor;
    background: transparent;
    color: inherit;
  }

  /* The icon's body is filled, so the × inside it has to be cut out in the page
     colour or it vanishes into the fill. The body is the icon's first path. */
  .remove :global(svg path:not(:first-of-type)) {
    stroke: var(--wash, #fff);
  }
</style>
