<script>
  import { onMount } from 'svelte';
  import { createStage, together } from '../render/stage.js';
  import { LIGHT } from '../render/dimensions.js';
  import { trackPhase, buildPhase } from '../render/build.js';
  import { fixedFrame } from '$lib/scenes.js';
  import { identify } from '../../../../src/layouts.js';

  let {
    pieces = [],
    camera = {},
    drive = false,
    aspect = '4 / 3',
    interactive = true,
    label = '',
    // A new layout collapses the one that is there and is built out of the pieces
    // that fall — see `show`. Off by default: a catalogue card showing one piece
    // has nothing to rearrange.
    sequence = false,
    pace = 0.04,
    // One tempo over the whole assembly — see `timingFor` in build.js.
    speed = 1.2,
    // When the build starts, measured from the moment the track is let go of. The
    // two run *together*, so this is genuinely "start picking pieces up now" and not
    // "wait for the pile to finish" — see `show`.
    handover = 0.5,
    drop = 2,
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
  const keyOf = ps => ps.map(p => `${p.type}${p.pose}${p.cell}`).join('|');

  /**
   * Show a layout.
   *
   * In sequencing mode, and only once there is something to knock down, that means
   * collapsing what is there and building the new layout out of the pieces that
   * fall: the same cubes, rearranged.
   *
   * Otherwise it is drawn finished and driven, off an emptied stage. That is the
   * first paint, every paint of a catalogue view, and what a reader who has asked
   * for reduced motion gets instead of an animation.
   */
  function show(next) {
    const key = keyOf(next);
    if (key === shownKey) return;

    if (sequence && shown && tumblePhase && !reduced) {
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
    } else {
      stage.clear();
      stage.run([trackPhase(stage, next, { drive })]);
    }
    shown = next;
    shownKey = key;
    stage.start();
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
        // there is nothing for a shape change to reframe. See `scenes.js`.
        stage.frameTo(sequence ? fixedFrame({ drop: Number(drop) }) : camera);
        show(pieces);

        // Animate only what is on screen. A page of viewers each running its own
        // rAF loop for ever is the one thing that would make this unusable on a
        // phone; a still viewer costs nothing. A sequencing viewer needs frames
        // even with no train on it, since the rearrangement is the animation.
        if ((drive || sequence) && !reduced) {
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
  $effect(() => {
    if (!ready || !stage) return;
    stage.frameTo(sequence ? fixedFrame({ drop: Number(drop) }) : camera);
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
