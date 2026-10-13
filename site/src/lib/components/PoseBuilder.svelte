<script>
  // What a group of pieces does to the train: `PoseStep` with a track in place of
  // one piece. The track is clicked together as in `TrackBuilder`, from whichever
  // orientation the stepper says, and only its two ends are read out — the pose the
  // train starts in and the pose the last piece leaves it in.
  //
  // The end is a ghost train riding the track as it grows: each piece added is
  // ridden once it is down, and one taken off is ridden back off. Its callout
  // follows it, and reads the pose it last came to rest in — a pose holds only
  // between pieces — with whatever that piece changed picked out.
  //
  // In the page it cannot be handled, so a drag over it scrolls the page: turning,
  // zooming and panning are full screen's, behind `ExpandingCard`'s button. The
  // buttons and the keys work either way.
  import { onMount } from 'svelte';
  import TrackViewer from './TrackViewer.svelte';
  import ExpandingCard from './ExpandingCard.svelte';
  import OrientationStepper from './OrientationStepper.svelte';
  import PieceKeys from './PieceKeys.svelte';
  import BuildPrompt from './BuildPrompt.svelte';
  import { attachControls } from '../render/controls.js';
  import { openScene, extentOf } from '$lib/scenes.js';
  import { describePose, poseAxes, readerFrame } from '$lib/catalogue.js';
  import { claimKeys } from '$lib/keys.js';
  import { LIMIT, seed, added, removed, keyAction } from '$lib/building.js';
  import { startCell } from '../../../../src/track.js';

  let { shape = 'SL', initial = 'DF', aspect = '3 / 2' } = $props();

  let pose = $state(initial);
  let letters = $state(seed(shape, initial));

  // The props are where it starts, not what it holds: clicking takes over from them.
  $effect(() => {
    pose = initial;
    letters = seed(shape, initial);
  });

  const start = $derived({ cell: startCell(pose), pose });
  const view = $derived(openScene(letters, pose));
  const end = $derived(view.head);

  // TrackBuilder's three reasons to stop adding: a piece that cannot go down, a
  // closed loop, and the limit. No pieces at all ends where it starts too, which
  // the model calls closed, but is not a loop.
  const closed = $derived(Boolean(letters) && view.closed);
  const done = $derived(Boolean(view.offender) || closed || letters.length >= LIMIT);

  // With no pieces it shows only a prompt: no lattice, ghost or callout, and no handling.
  const empty = $derived(!letters);

  const grid = $derived(extentOf([...view.pieces, { material: [], train: [start.cell, end.cell] }]));
  const ghosts = $derived([{ ...start, type: view.pieces[0]?.type ?? 'straight', tint: 'before', floor: false }]);

  // Where the riding train last came to rest, and where it was before that; each
  // arrival is a new `flash`, which picks out what changed.
  let reached = $state(null);
  let previous = $state(null);
  let flash = $state(0);
  const rider = {
    tint: 'after',
    onArrive: head => {
      previous = head && reached;
      reached = head;
      flash += 1;
    },
  };

  /** A callout's line: `label: (a, b, c)`, each value marked if it differs from `was`'s. */
  const line = (label, values, was, gap) => [
    { text: `${label}: (` },
    ...values.flatMap((text, i) => [
      ...(i ? [{ text: gap }] : []),
      { text, changed: Boolean(was) && was[i] !== text },
    ]),
    { text: ')' },
  ];
  const position = cell => readerFrame(cell).map(String);
  const readout = ({ cell, pose: p }, was = null) => [
    line('Position', position(cell), was && position(was.cell), ', '),
    line('Orientation', poseAxes(p), was && poseAxes(was.pose), ' '),
  ];
  // The start's callout stands to the left, clear of the axis arrows below. The
  // end's is on the train, and stays there even once the loop closes on the start.
  const notes = $derived([
    { key: 'before', cell: start.cell, side: 'left', lines: readout(start) },
    { key: 'after', rider: true, flash, lines: readout(reached ?? start, previous) },
  ]);

  let expanded = $state(false);
  let handled = $state(false);

  // In the page the keys go to whichever builder is mostly on screen (`keys.js`);
  // full screen, the card hands them over itself.
  let builder = $state(null);
  onMount(() => claimKeys(builder, onKeydown));

  const add = letter => {
    if (!done) letters = added(letters, letter, pose);
  };
  const removeLast = () => { letters = removed(letters, pose); };

  /** The keyboard: a letter or an arrow adds a piece, Backspace takes one off. */
  function onKeydown(event) {
    const action = keyAction(event);
    if (!action) return;
    if (action.remove) removeLast();
    else add(action.add);
    event.preventDefault();
  }

  /**
   * A new start orientation re-lays the track from it, kept only as far as the
   * model still accepts it.
   */
  const restart = next => {
    pose = next;
    letters = seed(letters, next);
  };
</script>

<div bind:this={builder}>
  <ExpandingCard
    footer={keys}
    label="Pose builder: type S L R I O X or use the arrow keys to add a piece, Backspace to remove one"
    onkeydown={onKeydown}
    bind:expanded
    bind:handled
  >
    {#snippet children(toggle)}
      {@render toggle()}
      <TrackViewer
        pieces={view.pieces}
        transition={{ kind: 'grow', arrival: 'fade', start: pose }}
        alarm={view.offender?.id ?? null}
        controls={handled && !empty ? attachControls : null}
        aspect={expanded ? 'auto' : aspect}
        blueprint
        grid={empty ? null : grid}
        origin={empty ? null : { ...grid, cell: false }}
        ghosts={empty ? [] : ghosts}
        notes={empty ? [] : notes}
        {rider}
        label="The track {letters || 'with no pieces'}, entered {describePose(start.pose)}, leaving the train {describePose(end.pose)}"
      />
      {#if empty}<BuildPrompt />{/if}
    {/snippet}
  </ExpandingCard>
</div>

{#snippet keys()}
  <OrientationStepper bind:pose={() => pose, restart} />
  <PieceKeys disabled={done} canRemove={Boolean(letters)} onadd={add} onremove={removeLast} />
{/snippet}
