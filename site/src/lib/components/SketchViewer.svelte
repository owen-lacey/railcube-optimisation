<script>
  import TrackViewer from './TrackViewer.svelte';
  import { openScene, cubesIn } from '$lib/scenes.js';
  import { scoreOf } from '../../../../src/track.js';
  import { ALARM } from '../render/dimensions.js';
  import { ordinal, describeTrack } from '$lib/catalogue.js';
  import { LIMIT, seed } from '$lib/building.js';
  import { LETTERS } from '../../../../src/layouts.js';

  let {
    shape = '',
    aspect = '16 / 10',
    // Handling, or null — see `controls` in TrackViewer.
    controls = null,
    pace = 0.1,
    speed = 1.2,
  } = $props();

  // What the box will hold, given what was typed into it, is a builder's `seed`.
  // Two rules, and the second is the whole of "you cannot type past a piece that
  // will not go down":
  //
  //   - anything that is not one of the six letters is not a piece, and is dropped
  //     as it is typed;
  //   - the string stops at the first piece the model rejects. That piece is kept,
  //     because it is the one drawn in red and the thing being complained about;
  //     everything after it could not be built either.
  //
  // Truncating rather than refusing is what makes a keystroke and a paste the same
  // operation. A letter added to a stuck track truncates straight back to the stuck
  // track, so the key does nothing — but pasting a *different* shape over it still
  // works, which a flat refusal would have blocked too. `LIMIT` is there because a
  // held-down key would otherwise grow the frame for ever.
  let typed = $state(seed(shape));

  // The prop is the starting shape, not the shape: it seeds the box and re-seeds it
  // if a story changes it, and typing takes over from there.
  $effect(() => { typed = seed(shape); });

  const view = $derived(typed
    ? openScene(typed)
    : { pieces: [], closed: false, offender: null });

  const blocked = $derived(Boolean(view.offender));

  function onInput(event) {
    typed = seed(event.currentTarget.value);
    // Svelte only writes `value` back when it changes, so a keystroke that `seed`
    // threw away has to be undone by hand or the field keeps the letter the track
    // does not have.
    event.currentTarget.value = typed;
  }

  const status = $derived.by(() => {
    if (!typed) return 'Nothing yet — type a track.';
    const counts = `${cubesIn(view.pieces)} cubes · ${scoreOf(view.pieces)} pts`;
    if (view.offender) {
      const nth = view.offender.index + 1;
      return `the ${ordinal(nth)} piece has nowhere to go — ${view.offender.message}`;
    }
    return view.closed ? `it closes — ${counts}` : `open — ${counts}`;
  });

  // The shape as typed, split at the piece that will not go down.
  const echo = $derived(view.offender
    ? { laid: typed.slice(0, view.offender.index), stuck: typed[view.offender.index] }
    : { laid: typed, stuck: '' });
</script>

<TrackViewer
  pieces={view.pieces}
  transition={{ kind: 'grow', pace, speed }}
  alarm={view.offender?.id ?? null}
  train={view.closed ? {} : null}
  {aspect}
  {controls}
  label={typed ? `${describeTrack(typed)}, as far as it has been built` : 'An empty stage'}
/>

<p class="controls">
  <label>
    <span class="muted">Type a track</span>
    <input
      type="text"
      value={typed}
      oninput={onInput}
      spellcheck="false"
      autocapitalize="characters"
      autocomplete="off"
      maxlength={LIMIT}
      aria-invalid={blocked}
      aria-describedby="sketch-status"
      placeholder={LETTERS}
    />
  </label>
</p>

<p id="sketch-status" class="caption" aria-live="polite" style:--alarm={ALARM}>
  {#if typed}
    <span class="shape">{echo.laid}{#if echo.stuck}<mark>{echo.stuck}</mark>{/if}</span>
  {/if}
  <span class="muted">{status}</span>
</p>

<style>
  .controls {
    display: flex;
    justify-content: center;
  }

  .controls label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .controls label span {
    white-space: nowrap;
  }

  /* Wide enough for the 18-cube set without scrolling, and it gives way on a
     narrow screen rather than pushing the label off the side. A 36-cube shape does
     scroll, which is the deal — the caption echoes the whole string underneath. */
  input {
    font: inherit;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    width: min(26ch, 100%);
  }

  .caption {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    text-align: center;
  }

  /* The same red the rejected piece is flashing in the scene, passed through from
     `dimensions.js` so there is one definition of it and not two. */
  mark {
    background: none;
    color: var(--alarm);
    font-weight: 700;
  }
</style>
