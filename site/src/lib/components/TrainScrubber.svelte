<script>
  // A slider for which piece the train is on, split into one segment per piece in
  // route order and coloured as that piece, with a play/pause beside it. It snaps
  // to a piece's start, which puts the train where it enters that piece; the right
  // end is a whole lap on. `held` is whether the slider has the train: dragging it
  // or pausing takes it, playing gives it back.
  import PlayPause from './PlayPause.svelte';

  let { pieces, at = $bindable(0), held = $bindable(false) } = $props();

  // The slider's track: a segment per piece, each its piece's colour, those from
  // the thumb on faded. A boundary sits where the thumb's centre does at that
  // piece, and the thumb's centre stops half a thumb short of each end, so the
  // bar does too. Every segment gives up half a gap at each end, the end ones
  // included, so all of them are the same length.
  const segments = $derived.by(() => {
    const n = pieces.length;
    const edge = i => `calc(var(--thumb) / 2 + (100% - var(--thumb)) * ${i / n})`;
    const stops = pieces.map(({ color }, i) => {
      const paint = i < at ? color : `color-mix(in srgb, ${color} var(--fade), transparent)`;
      const from = `calc(${edge(i)} + var(--gap) / 2)`;
      const to = `calc(${edge(i + 1)} - var(--gap) / 2)`;
      return `transparent ${from}, ${paint} ${from} ${to}, transparent ${to}`;
    });
    return `linear-gradient(to right, ${stops.join(', ')})`;
  });
</script>

<div class="scrubber">
  <PlayPause bind:playing={() => !held, playing => (held = !playing)} label="the train" />
  <input
    class="scrub"
    type="range"
    min="0"
    max={pieces.length}
    step="1"
    bind:value={at}
    style:--segments={segments}
    oninput={() => (held = true)}
    aria-label="Where the train is round the lap"
  />
</div>

<style>
  /* The play/pause and the slider are one control, so they stay on one line: the
     slider gives up width before the pair wraps. */
  .scrubber {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .scrubber > :global(.play-pause) {
    flex: none;
  }

  /* The thumb takes the play/pause's outline colour, so the two read as one control.
     A fixed width, and narrower only where the footer is. */
  .scrub {
    --thumb: 1.25rem;
    --track: 0.75rem;
    --gap: 2px;
    --fade: 35%;
    width: 20rem;
    min-width: 0;
    height: var(--thumb);
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  .scrub::-webkit-slider-runnable-track {
    height: var(--track);
    background: var(--segments);
  }

  .scrub::-moz-range-track {
    height: var(--track);
    background: var(--segments);
  }

  .scrub::-webkit-slider-thumb {
    width: var(--thumb);
    height: var(--thumb);
    margin-top: calc((var(--track) - var(--thumb)) / 2);
    border: 2px solid var(--card-footer);
    border-radius: 50%;
    background: currentColor;
    appearance: none;
  }

  .scrub::-moz-range-thumb {
    width: var(--thumb);
    height: var(--thumb);
    box-sizing: border-box;
    border: 2px solid var(--card-footer);
    border-radius: 50%;
    background: currentColor;
  }

  .scrub:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 4px;
    border-radius: calc(var(--thumb) / 2);
  }
</style>
