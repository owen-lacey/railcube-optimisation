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
  // In the page a drag over it scrolls the page until the hand is on: turning,
  // zooming and panning are the hand's and full screen's, behind `ExpandingCard`'s
  // buttons. The piece buttons and the keys work either way. A page that is the
  // builder alone passes `FillCard` as its `card`, which has neither button and is
  // always handled.
  //
  // The piece that closes the loop puts it on the leaderboard and shows the
  // verdict (`SubmitDialog`), and a closed track keeps a button in the footer to
  // show it again.
  import { onMount } from 'svelte';
  import TrackViewer from './TrackViewer.svelte';
  import ExpandingCard from './ExpandingCard.svelte';
  import PieceKeys from './PieceKeys.svelte';
  import ScoreMaths from './ScoreMaths.svelte';
  import InventoryCard from './InventoryCard.svelte';
  import BuildPrompt from './BuildPrompt.svelte';
  import SubmitDialog from './SubmitDialog.svelte';
  import { attachControls } from '../render/controls.js';
  import { base } from '$app/paths';
  import { openScene, BUILD_FLOOR } from '$lib/scenes.js';
  import { liveReadingsOf } from '$lib/score.js';
  import { scoreOf, WEIGHTS } from '$lib/weighting.js';
  import { claimKeys } from '$lib/keys.js';
  import { SWEEP_CROSSED_RANKED } from '$lib/sweeps.js';
  import { LIMIT, seed, added, removed, keyAction, usedOf, spentOut } from '$lib/building.js';

  // The crossed sweep's pieces, since its scores are the ones to beat.
  const INVENTORY = SWEEP_CROSSED_RANKED.question.inventory;

  let {
    shape = '',
    // Unset, it is wide on a wide screen and square on a phone, where 16/10 of a
    // narrow column leaves too little to handle.
    aspect = undefined,
    pace = 0.1,
    speed = 1.2,
    // Handed the letters whenever they change, as the front page's address keeps them.
    onchange = undefined,
    // What the builder sits in: `ExpandingCard`, or anything with its contract.
    card: Card = ExpandingCard,
    // Handed a submission's id when the reader asks for the full results. In the
    // post they open beside it, on the front page's leaderboard.
    onresults = id => window.open(`${base}/?tab=leaderboard&id=${id}`, '_blank'),
  } = $props();

  let letters = $state(seed(shape));

  // The prop is the starting shape, not the shape: clicking takes over from it.
  $effect(() => { letters = seed(shape); });
  $effect(() => { onchange?.(letters); });

  const view = $derived(letters
    ? openScene(letters)
    : { pieces: [], closed: false, offender: null });

  // Adding stops in three cases. A piece that cannot go down: nothing after it could
  // be built, so the only thing left to do is take it off again. A closed loop: it
  // is finished, and a piece added to it would only be one more collision. And the
  // limit.
  const done = $derived(Boolean(view.offender) || view.closed || letters.length >= LIMIT);

  // The readings of the track as built, scored at the post's weights: the rejected
  // piece, the last drawn, is not part of it.
  const readings = $derived(liveReadingsOf(view.offender ? view.pieces.slice(0, -1) : view.pieces, view.closed));

  // What is spent of the inventory, and the pieces with none left to add.
  const used = $derived(usedOf(letters));
  const spent = $derived(spentOut(letters, INVENTORY));

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
  let toolsWidth = $state(0);
  // With no pieces there is nothing to turn about, so the viewer is a prompt only.
  const empty = $derived(!letters);

  // In the page the keys go to whichever builder is mostly on screen (`keys.js`);
  // full screen, the card hands them over itself.
  let builder = $state(null);
  onMount(() => claimKeys(builder, onKeydown));

  let submission = $state(null);

  const add = letter => {
    if (done || spent.has(letter)) return;
    letters = added(letters, letter);
    if (view.closed) submission.offer();
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

<div class="builder" bind:this={builder}>
  <Card
    footer={keys}
    label="Track builder: type S L R I O X or use the arrow keys to add a piece, Backspace to remove one"
    onkeydown={onKeydown}
    bind:expanded
    bind:handled
  >
    {#snippet children(toggle, hand)}
      <TrackViewer
        pieces={view.pieces}
        transition={{ kind: 'grow', pace, speed, from: BUILD_FLOOR }}
        alarm={view.offender?.id ?? null}
        train={view.closed ? {} : null}
        controls={handled && !empty ? attachControls : null}
        tools={toggle}
        cornerTools={hand}
        bind:toolsWidth
        aspect={expanded ? 'auto' : shapeOfViewer}
        blueprint
        label={letters ? `The track ${letters}, as far as it has been built` : 'An empty stage'}
      />
      <div class="inventory" style:--tools-width="{toolsWidth}px"><InventoryCard {used} inventory={INVENTORY} /></div>
      {#if empty}<BuildPrompt />{/if}
    {/snippet}
  </Card>
</div>

{#snippet keys()}
  <ScoreMaths {readings} />
  <PieceKeys disabled={done} {spent} canRemove={Boolean(letters)} onadd={add} onremove={removeLast} />
  {#if view.closed}
    <div class="verdict">
      <button class="submit" onclick={() => submission.offer()}>See the verdict</button>
    </div>
  {/if}
{/snippet}

<SubmitDialog bind:this={submission} shape={letters} score={readings && scoreOf(readings, WEIGHTS)} {onresults} />

<style>
  /* Filling a page when its card does; in the post its height is its content's. */
  .builder {
    height: 100%;
  }

  /* A row of its own under the keys, so the keys stay centred as they were. */
  .verdict {
    display: flex;
    flex-basis: 100%;
    justify-content: center;
  }

  .submit {
    padding: 0.5rem 1rem;
    border: 2px solid var(--card-border);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  /* Over the viewer's top-left corner, as `LayoutViewer`'s overlay is, and never
     wide enough to reach the toolbar: on a narrow viewer its rows wrap. It never
     takes a drag from the viewer under it. */
  .inventory {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 1;
    max-width: calc(100% - var(--tools-width) - 1.5rem);
    pointer-events: none;
  }
</style>
