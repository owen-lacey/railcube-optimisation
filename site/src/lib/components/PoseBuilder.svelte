<script>
  // What a group of pieces does to the train: `PoseStep` with a track in place of
  // one piece. The track is clicked together as in `TrackBuilder`, from whichever
  // orientation the stepper says, and only its two ends are read out — the pose the
  // train starts in and the pose the last piece leaves it in.
  //
  // The two ends are outlined as `PieceMoves` outlines one piece's: the origin cube
  // where the train starts, and the cube the next piece would go in where the last
  // piece leaves it. Only the end has a callout, on its cube, picking out whatever
  // the last piece changed.
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
  import { describePose, poseReadout, trackCell } from '$lib/catalogue.js';
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

  // With no pieces it shows only a prompt: no lattice, outline or callout, and no handling.
  const empty = $derived(!letters);

  // The cubes and the two outlined ends, and no further: there is no train, so its
  // cells are not drawn round.
  const grid = $derived(extentOf([{ material: [...view.pieces.flatMap(p => p.material), trackCell(start), trackCell(end)] }]));
  const outlines = $derived([
    { cell: trackCell(start), tint: 'before' },
    { cell: trackCell(end), tint: 'after' },
  ]);

  // Only the end has a callout: the start is the stepper's orientation, read out
  // there. It reads what the last piece changed — the head it was entered at — and
  // flashes it on every new track or orientation.
  const notes = $derived([
    {
      key: 'after',
      cell: trackCell(end),
      flash: `${pose}${letters}`,
      lines: poseReadout(end, view.pieces.at(-1) ?? null),
    },
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
        outlines={empty ? [] : outlines}
        notes={empty ? [] : notes}
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
