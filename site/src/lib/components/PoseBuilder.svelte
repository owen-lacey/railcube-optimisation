<script>
  // What a group of pieces does to the train: `PoseStep` with a track in place of
  // one piece. The track is clicked together as in `TrackBuilder`, from whichever
  // orientation the stepper says, and only its two ends are read out — the pose the
  // train starts in and the pose the last piece leaves it in.
  import { onMount } from 'svelte';
  import TrackViewer from './TrackViewer.svelte';
  import LayoutCard from './LayoutCard.svelte';
  import OrientationStepper from './OrientationStepper.svelte';
  import PieceKeys from './PieceKeys.svelte';
  import { attachControls } from '../render/controls.js';
  import { openScene, extentOf, BUILD_FLOOR } from '$lib/scenes.js';
  import { describePose, poseLabel, readerFrame } from '$lib/catalogue.js';
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

  const grid = $derived(extentOf([...view.pieces, { material: [], train: [start.cell, end.cell] }]));
  const ghosts = $derived([
    { ...start, type: view.pieces[0]?.type ?? 'straight', tint: 'before', floor: false },
    { ...end, type: 'straight', tint: 'after', floor: false },
  ]);
  const note = (key, { cell, pose: p }) => ({
    key,
    cell,
    lines: [`Position: (${readerFrame(cell).join(', ')})`, `Orientation: (${poseLabel(p)})`],
  });
  // A closed loop, or no track at all, ends where it starts, so one callout says both.
  const notes = $derived(view.closed ? [note('before', start)] : [note('before', start), note('after', end)]);

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

<div
  class="pose-builder"
  role="group"
  aria-label="Pose builder: type S L R I O X or use the arrow keys to add a piece, Backspace to remove one"
  bind:this={builder}
>
  <LayoutCard footer={keys}>
    <TrackViewer
      pieces={view.pieces}
      transition={{ kind: 'grow', from: BUILD_FLOOR }}
      alarm={view.offender?.id ?? null}
      controls={attachControls}
      {grid}
      {ghosts}
      {notes}
      {aspect}
      label="The track {letters || 'with no pieces'}, entered {describePose(start.pose)}, leaving the train {describePose(end.pose)}"
    />
  </LayoutCard>
</div>

{#snippet keys()}
  <OrientationStepper bind:pose={() => pose, restart} />
  <PieceKeys disabled={done} canRemove={Boolean(letters)} onadd={add} onremove={removeLast} />
{/snippet}
