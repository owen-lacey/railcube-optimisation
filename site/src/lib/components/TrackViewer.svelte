<script>
  import { onMount } from 'svelte';
  import { createStage, together } from '../render/stage.js';
  import { LIGHT } from '../render/dimensions.js';
  import { trackPhase, buildPhase, growPhase } from '../render/build.js';
  import { fixedFrame, growBox, frameTight, cubeIds } from '$lib/scenes.js';
  import { identify } from '../../../../src/layouts.js';

  let {
    pieces = [],
    camera = {},
    drive = false,
    aspect = '4 / 3',
    interactive = false,
    label = '',
    // A new layout collapses the one that is there and is built out of the pieces
    // that fall — see `show`. Off by default: a catalogue card showing one piece
    // has nothing to rearrange.
    sequence = false,
    // A new layout *extends* the one that is there: whatever the two have in common
    // is left standing and only the rest arrives. This is what a track being typed
    // needs, and it is the one mode whose camera moves — see `showGrown`.
    grow = false,
    // Grow mode only. A track is not a loop until it closes, so there is nothing
    // for a train to run on before then; and a piece the model rejects is named
    // here so the renderer can flash it.
    closed = false,
    offender = null,
    pace = 0.04,
    // One tempo over the whole assembly — see `timingFor` in build.js.
    speed = 1.2,
    // When the build starts, measured from the moment the track is let go of. The
    // two run *together*, so this is genuinely "start picking pieces up now" and not
    // "wait for the pile to finish" — see `show`.
    handover = 0.5,
    drop = 2,
    // Sequence mode only: how far the fixed frame reaches, in cells. Left unset it
    // is the JS solver's own box constraint (see `fixedFrame`); a viewer showing a
    // sweep solved in a bigger box passes that sweep's `question.box` instead.
    reach = undefined,
  } = $props();

  // How long the collapse is simulated for at the outside.
  //
  // The tumbler's own limit is ten seconds, right when the collapse is the subject
  // and you are waiting for the pile to finish. Here it is only a backstop for
  // whatever the build does not pick up: it ends early anyway once every cube has
  // been lifted out, which in a same-inventory rearrangement is all of them.
  const SETTLE = 2.5;

  let host = $state(null);
  let cameraEl = $state(null);
  let sceneEl = $state(null);
  let stage = null;
  let ready = $state(false);
  let failed = $state('');
  let reduced = false;
  // Loaded on mount, and only in sequencing mode: `tumble.js` reaches cannon-es,
  // which is a chunk worth keeping off a page whose viewers are static piece cards.
  // It is awaited before the first `show`, so nothing downstream is async.
  let tumblePhase = null;
  // The pieces currently standing, which is what a change has to knock down.
  // Deliberately not `$state`: `show` writes it, and an effect that re-ran on its
  // own write would tumble the track it had only just built.
  let shown = null;
  let shownKey = null;
  // Grow mode's frame, which only ever enlarges. Not `$state` for the same reason
  // as `shown`: `showGrown` owns it, and the framing effect below must not read it.
  let box = undefined;

  /**
   * What makes two `pieces` arrays the same layout drawn the same way.
   *
   * Needed because "has the layout changed" cannot be answered by identity. The
   * effect below re-runs on a new array whatever produced it — the mount draws once
   * and the effect then fires with the very same pieces, and a `$derived` upstream
   * is free to rebuild an equal array — and in sequencing mode a false positive is
   * not a wasted redraw, it is the track knocking itself down for no reason. Which
   * is what it did.
   */
  const pieceKey = p => `${p.type}${p.pose}${p.cell}`;
  const keyOf = ps => ps.map(pieceKey).join('|');

  /**
   * Show a layout, by whichever of the three routes this viewer is set to.
   */
  function show(next) {
    const key = keyOf(next);
    if (key === shownKey) return;

    if (grow) showGrown(next);
    else if (sequence && shown && tumblePhase && !reduced) showSequenced(next);
    else showStatic(next);

    shown = next;
    shownKey = key;
    stage.start();
  }

  /**
   * Extend what is standing.
   *
   * The two layouts are compared piece by piece from the start, and everything they
   * have in common is simply left alone — not re-baked, not re-transformed, not
   * touched at all, which is what stops a track twitching when the next letter is
   * typed. Every cube past that point comes off the stage, and `growPhase` slides
   * the new tail on.
   *
   * The frame grows with it, and only grows: see `growBox`.
   */
  function showGrown(next) {
    const before = shown ?? [];
    let prefix = 0;
    while (prefix < before.length && prefix < next.length
      && pieceKey(before[prefix]) === pieceKey(next[prefix])) prefix += 1;

    // A revisit has no cube of its own, so it has no ID and there is nothing to
    // take off — the cross it is a second pass over may well be in the prefix.
    for (const id of cubeIds(before).slice(prefix)) if (id) stage.drop(id);

    stage.run([growPhase(stage, next, {
      pace: Number(pace),
      speed: Number(speed),
      drive: drive && closed,
      alarm: offender?.id ?? null,
      instant: reduced,
    })]);

    // The one camera in the project that moves. It only ever *enlarges* — see
    // `growBox` — so it settles once the track stops reaching new ground, rather
    // than chasing every keystroke the way a per-layout frame would. A reader who
    // has asked for reduced motion gets the same box, arrived at instantly.
    box = growBox(next, box);
    const shot = frameTight(box);
    if (reduced) stage.frameTo(shot);
    else stage.panTo(shot);
  }

  /** Draw it finished and drive it, off an emptied stage. */
  function showStatic(next) {
    stage.clear();
    stage.run([trackPhase(stage, next, { drive })]);
  }

  /**
   * Collapse what is there and build the new layout out of the pieces that fall:
   * the same cubes, rearranged.
   */
  function showSequenced(next) {
    // The two overlap. The collapse runs from zero and the build joins in at
    // `handover`, plucking pieces out of a pile that is still falling — which is
    // what lets the build start while there is something to watch instead of after
    // the pile has finished fidgeting. Ending the collapse first and *then*
    // building would freeze every piece the build had not reached yet.
    const collapse = tumblePhase(stage, shown, {
      drop: Number(drop),
      limit: SETTLE,
      // A cube the build picks up is re-lit when it does; the collapse must not
      // also re-light it on the way out. Leftovers are not in the set, and are.
      keep: new Set(identify(next)),
    });
    stage.run([together(collapse, buildPhase(stage, next, {
      pace: Number(pace),
      speed: Number(speed),
      delay: Number(handover),
      onPickUp: collapse.release,
      drive,
    }))]);
  }

  // PolyCSS is custom elements and touches `window`, and every page here is
  // prerendered — so none of this may run until the browser has the DOM.
  onMount(() => {
    let live = true;
    let stopObserving = () => {};

    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    (async () => {
      try {
        await import('@layoutit/polycss/elements');
        await customElements.whenDefined('poly-scene');
        if (sequence) ({ tumblePhase } = await import('../render/tumble.js'));
        if (!live) return;
        stage = createStage(cameraEl, sceneEl);
        ready = true;
        // Framed once, here, and never again in sequencing mode: `fixedFrame` is a
        // box the layouts all fit inside rather than anything read off them, so
        // there is nothing for a shape change to reframe. See `scenes.js`. Grow
        // mode is the exception — its frame is `showGrown`'s, from the first paint.
        if (!grow) stage.frameTo(sequence ? fixedFrame({ drop: Number(drop), reach }) : camera);
        show(pieces);

        // Animate only what is on screen. A page of viewers each running its own
        // rAF loop for ever is the one thing that would make this unusable on a
        // phone; a still viewer costs nothing. A sequencing or growing viewer needs
        // frames with no train on it, since the assembly is the animation.
        if ((drive || sequence || grow) && !reduced) {
          const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !document.hidden) stage?.start();
            else stage?.stop();
          }, { rootMargin: '100px' });
          io.observe(host);

          const onVisibility = () => {
            if (document.hidden) stage?.stop();
          };
          document.addEventListener('visibilitychange', onVisibility);
          stopObserving = () => {
            io.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
          };
        }
      } catch (error) {
        failed = error.message;
      }
    })();

    // PolyCSS needs real pixel dimensions on the camera element — the wrapper's
    // aspect-ratio box does the layout, this copies its size across.
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!cameraEl || !width) return;
      cameraEl.style.width = `${Math.round(width)}px`;
      cameraEl.style.height = `${Math.round(height)}px`;
      // Zoom is relative to the viewer's width, so a resize reframes.
      stage?.applyCamera();
    });
    ro.observe(host);

    return () => {
      live = false;
      stopObserving();
      ro.disconnect();
      stage?.clear();
      stage = null;
    };
  });

  $effect(() => {
    const next = pieces;
    if (!ready || !stage) return;
    show(next);
  });

  // Framing. In sequencing mode this deliberately does *not* read `pieces` or
  // `camera`: the frame is the fixed box, so a new shape has nothing to reframe and
  // this never fires on one. Only `drop` moves it, which is someone changing the
  // shot on purpose rather than the shot chasing the content.
  //
  // In grow mode it does not run at all: the frame is `showGrown`'s, and two things
  // writing the camera would have it snapping back mid-pan.
  $effect(() => {
    if (!ready || !stage || grow) return;
    stage.frameTo(sequence ? fixedFrame({ drop: Number(drop), reach }) : camera);
  });
</script>

<div
  class="viewer"
  class:interactive
  bind:this={host}
  style:aspect-ratio={aspect}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
>
  <poly-camera
    bind:this={cameraEl}
    rot-x="65"
    rot-y="45"
    zoom="4"
    target="0,0,0"
  >
    <poly-scene
      bind:this={sceneEl}
      directional-direction={LIGHT.direction}
      directional-intensity={LIGHT.directional}
      ambient-intensity={LIGHT.ambient}
    >
      {#if interactive}
        <poly-orbit-controls drag wheel></poly-orbit-controls>
      {/if}
    </poly-scene>
  </poly-camera>

  {#if failed}
    <p class="failed">Could not start the 3D view: {failed}</p>
  {/if}
</div>

<style>
  .viewer {
    position: relative;
    width: 100%;
    overflow: hidden;
    display: grid;
    place-items: center;
  }

  /* Orbiting and page-scrolling fight over the same drag on a touch screen.
     Only the viewers that are meant to be handled claim the gesture; the small
     cards stay scrollable. */
  .viewer.interactive :global(poly-camera) {
    touch-action: none;
  }

  .viewer :global(poly-camera) {
    display: block;
  }

  .failed {
    position: absolute;
    inset: auto 0 0 0;
    margin: 0;
  }
</style>
