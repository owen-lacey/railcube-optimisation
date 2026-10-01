<script>
  import { onMount } from 'svelte';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { createStage, together } from '../render/stage.js';
  import { readTheme } from '../render/renderer.js';
  import { trackPhase, buildPhase, growPhase } from '../render/build.js';
  import { gridLines } from '../render/grid.js';
  import { fixedFrame, growBox, frameTight, cubeIds } from '$lib/scenes.js';
  import { toWorld } from '../render/vec.js';

  // How far a callout stands off the outline of what is drawn, in CSS pixels.
  const CALLOUT_GAP = 12;

  let {
    pieces = [],
    camera = {},
    aspect = '4 / 3',
    label = '',
    // What a new layout looks like, `{ kind, ...that kind's settings }` — see
    // `CHANGES`. Its kind is read once, at mount; its settings when a layout is shown.
    //
    //   redraw  drawn finished, off an emptied stage.
    //   build   the stage is emptied and every piece comes in from off the edge of
    //           the frame, in route order. Framed on `camera`, as a static track is.
    //           `{ pace, speed }`.
    //   tumble  the layout that is there collapses and the new one is built out of
    //           the pieces that fall. Framed on a fixed box, not on `camera`.
    //           `{ pace, speed, handover, drop, reach }`.
    //   grow    the layout *extends* the one that is there: whatever the two have in
    //           common is left standing and only the rest arrives. The one kind whose
    //           camera moves — see `showGrown`. `{ pace, speed, from }`.
    //
    // `speed` is one tempo over the whole assembly (see `timingFor` in build.js).
    // `handover` is when the build starts, measured from the moment the track is let
    // go of: the two run *together*. `reach` is how far the fixed frame reaches, in
    // cells — unset, the JS solver's own box constraint (see `fixedFrame`). `from` is
    // the box a growing frame starts from — unset, the tight one a sketch starts in
    // (see `growBox`).
    transition = { kind: 'redraw' },
    // The train, as callbacks, or null for none. Read once, at mount.
    //   at()       who holds it: a piece index to hold it there, null to let it drive.
    //   onAt(i)    told the piece it has driven onto. Both redraw only — see `trackPhase`.
    //   onCell(c)  told the cell it is in, `[x, y, z]`, each time it enters a new one,
    //              and null when it goes.
    //   onPose(p)  told the pose of the piece it last entered, `'DF'` say, each time it
    //              changes, and null when it goes.
    train = null,
    // Handling: `(host, stage) => ({ destroy })`, attached at mount, or null for a
    // viewer that cannot be handled. `attachControls` in render/controls.js.
    controls = null,
    // A box of cells, `{ lo, hi }`, to draw the model's cell lattice around; null
    // draws none. See `render/grid.js`.
    grid = null,
    // Draw the viewer on a sheet of dots that follows the camera's zoom and pan, so
    // its edges are plain to see. See `render/blueprint.js`.
    blueprint = false,
    // Outline the origin cell and stand the axis arrows (x right, y forwards, z up)
    // at this box's corner, `{ lo, hi }`; null draws neither. See `render/axes.js`.
    origin = null,
    // Trains that stand still, `{ type, cell, pose, tint }` each, tinted by the stylesheet
    // below. See `setGhosts` in stage.js.
    ghosts = [],
    // Cells, `[x, y, z]` each, filled see-through in the train cell's paint whether
    // or not a train is driving. See `setFill` in stage.js.
    fill = [],
    // Hold everything where it is — see `setPaused` in stage.js.
    paused = false,
    // Callouts on cells, `{ key, lines, cell }` each: `lines` an array of strings, set
    // outside what is drawn with a leader line to the middle of `cell`, and kept
    // there as the camera moves. See `placeLabels`.
    notes = [],
    // The ID of a cube the model has rejected, `5L` say, or null. It is drawn where
    // it was asked to go and pulses there, whatever the transition — see `alarmFor`
    // in build.js. Read when a layout is shown.
    alarm = null,
  } = $props();

  // The settings a transition leaves out.
  const DEFAULTS = { pace: 0.04, speed: 1.2, handover: 0.5, drop: 2 };
  const settings = () => ({ ...DEFAULTS, ...transition });
  // What a phase is told of the rejected piece. Held still for a reader who has
  // asked for reduced motion: a pulsing element is the whole of what that is about.
  const flagged = () => alarm && { id: alarm, pulse: !reduced };

  // How long the collapse is simulated for at the outside.
  //
  // The tumbler's own limit is ten seconds, right when the collapse is the subject
  // and you are waiting for the pile to finish. Here it is only a backstop for
  // whatever the build does not pick up: it ends early anyway once every cube has
  // been lifted out, which in a same-inventory rearrangement is all of them.
  const SETTLE = 2.5;

  let host = $state(null);
  let canvas = $state(null);
  let stage = null;
  let ready = $state(false);
  // Whether someone has turned, zoomed or panned the camera — which is when there
  // is something for the reset button to undo.
  let touched = $state(false);
  let failed = $state('');
  let reduced = false;
  // Loaded on mount, and only for a tumble: `tumble.js` reaches cannon-es,
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
  let handle = null;
  // This viewer's entry in `CHANGES`, fixed at mount.
  let change = null;

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
   * Show the layout again from the start, which for a build is assembling it anew.
   */
  export function replay() {
    if (!ready || !shown) return;
    shownKey = null;
    show(shown);
  }

  /**
   * The four kinds of transition. Each says how it shows a layout, where it frames
   * (null for one that frames itself) and what it loads first. A reader who has asked
   * for reduced motion gets the redraw from the two that would otherwise assemble,
   * and a tumble with nothing standing has nothing to knock down.
   */
  const CHANGES = {
    redraw: { show: showStatic, frame: () => camera },
    build: {
      show: next => (reduced ? showStatic : showBuilt)(next),
      frame: () => camera,
    },
    tumble: {
      show: next => (shown && !reduced ? showSequenced : showStatic)(next),
      // `fixedFrame` is a box the layouts all fit inside rather than anything read
      // off them, so there is nothing for a shape change to reframe. See `scenes.js`.
      frame: () => {
        const { drop, reach } = settings();
        return fixedFrame({ drop: Number(drop), reach });
      },
      load: async () => ({ tumblePhase } = await import('../render/tumble.js')),
    },
    grow: { show: showGrown, frame: null },
  };

  /**
   * Show a layout, by this viewer's kind of transition.
   */
  function show(next) {
    const key = keyOf(next);
    if (key === shownKey) return;

    change.show(next);

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
   * typed. Every cube past that point is detached from the stage and slides back
   * out the way it came, and `growPhase` slides the new tail on.
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
    const ids = cubeIds(before);
    const leaving = [];
    for (let i = prefix; i < before.length; i++) {
      const cube = ids[i] && stage.detach(ids[i]);
      if (cube) leaving.push({ cube, piece: before[i] });
    }

    const { pace, speed, from } = settings();
    stage.run([growPhase(stage, next, {
      leaving,
      pace: Number(pace),
      speed: Number(speed),
      drive: Boolean(train),
      alarm: flagged(),
      instant: reduced,
    })]);

    // The one camera in the project that moves. It only ever *enlarges* — see
    // `growBox` — so it settles once the track stops reaching new ground, rather
    // than chasing every keystroke the way a per-layout frame would. A reader who
    // has asked for reduced motion gets the same box, arrived at instantly.
    box = growBox(next, box ?? from);
    const shot = frameTight(box);
    if (reduced) stage.frameTo(shot);
    else stage.panTo(shot);
  }

  /** Draw it finished and drive it, off an emptied stage. */
  function showStatic(next) {
    stage.clear();
    stage.run([trackPhase(stage, next, {
      drive: Boolean(train), trainAt: train?.at, onTrainAt: train?.onAt, alarm: flagged(),
    })]);
  }

  /** Empty the stage and click the whole layout together, every piece a mint. */
  function showBuilt(next) {
    stage.clear();
    const { pace, speed } = settings();
    stage.run([buildPhase(stage, next, {
      pace: Number(pace), speed: Number(speed), drive: Boolean(train), alarm: flagged(),
    })]);
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
    const { pace, speed, handover, drop } = settings();
    const collapse = tumblePhase(stage, shown, { drop: Number(drop), limit: SETTLE });
    stage.run([together(collapse, buildPhase(stage, next, {
      pace: Number(pace),
      speed: Number(speed),
      delay: Number(handover),
      onPickUp: collapse.release,
      drive: Boolean(train),
      alarm: flagged(),
    }))]);
  }

  // Every page here is prerendered, and WebGL is the browser's — so none of this
  // may run until the browser has the DOM.
  onMount(() => {
    let live = true;
    let stopObserving = () => {};

    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    (async () => {
      try {
        change = CHANGES[transition.kind];
        await change.load?.();
        if (!live) return;
        stage = createStage(canvas, {
          theme: readTheme(host),
          onTrainCell: cell => train?.onCell?.(cell),
          onTrainPose: pose => train?.onPose?.(pose),
          onCamera: () => {
            touched = stage?.touched() ?? false;
            if (origin || notes.length) scheduleLabels();
            if (blueprint) placeSheet();
          },
        });
        stage.setPaused(paused);
        handle = controls?.(host, stage) ?? null;
        ready = true;
        // A tumble is framed once, here, and never again. A grow is framed by
        // `showGrown`, from the first paint.
        if (change.frame) stage.frameTo(change.frame());
        show(pieces);

        // Animate only what is on screen. A page of viewers each running its own
        // rAF loop for ever is the one thing that would make this unusable on a
        // phone; a still viewer costs nothing. Every viewer is gated, not only one
        // that animates at mount, because any can come to: a static one is handed a
        // rejected piece, which pulses, as soon as its shape stops being legal.
        if (!reduced) {
          // Runs while both hold. Each signal re-checks the pair rather than only
          // stopping, because the observer does not fire again when the page comes
          // back: switching desktops leaves the viewer exactly as in view as it was.
          let onscreen = false;
          const gate = () => {
            if (onscreen && !document.hidden) stage?.start();
            else stage?.stop();
          };
          const io = new IntersectionObserver(([entry]) => {
            onscreen = entry.isIntersecting;
            gate();
          }, { rootMargin: '100px' });
          io.observe(host);

          document.addEventListener('visibilitychange', gate);
          stopObserving = () => {
            io.disconnect();
            document.removeEventListener('visibilitychange', gate);
          };
        }
      } catch (error) {
        failed = error.message;
      }
    })();

    // The canvas fills the wrapper's aspect-ratio box, and zoom is relative to the
    // viewer's size, so a resize reframes (and redraws).
    const ro = new ResizeObserver(() => stage?.applyCamera());
    ro.observe(host);

    return () => {
      live = false;
      stopObserving();
      ro.disconnect();
      handle?.destroy();
      handle = null;
      stage?.setGrid(null);
      stage?.setOrigin(null);
      cancelAnimationFrame(labelFrame);
      labelFrame = 0;
      stage?.setGhosts([]);
      stage?.setFill([]);
      stage?.clear();
      stage = null;
    };
  });

  $effect(() => {
    const next = pieces;
    if (!ready || !stage) return;
    show(next);
  });

  // Paused or played. Starting either way is right: paused, it draws one still
  // frame and stops; played, it carries on from there.
  $effect(() => {
    const hold = paused;
    if (!ready || !stage) return;
    stage.setPaused(hold);
    stage.start();
  });

  // The lattice. Keyed on the box's corners, not the object: an equal box handed
  // over new would otherwise remount a thousand polygons for nothing.
  let gridKey = null;
  $effect(() => {
    const key = grid ? `${grid.lo}|${grid.hi}` : null;
    if (!ready || !stage || key === gridKey) return;
    stage.setGrid(grid ? gridLines(grid) : null);
    gridKey = key;
  });

  // The blueprint's sheet: where the stage says its dots sit, re-read on every
  // camera write, and handed to the stylesheet below as custom properties.
  let sheet = $state(null);

  function placeSheet() {
    sheet = stage?.backdrop() ?? null;
  }

  $effect(() => {
    const on = blueprint;
    if (!ready || !stage) return;
    if (on) placeSheet();
    else sheet = null;
  });

  // The origin's axes and the notes. Both are HTML over the scene, found by asking
  // the stage where each one's speck landed — after the camera has moved, and at
  // most once a frame however many writes it took.
  //
  // A note is a callout. Text over a cell covers whatever is in it, and which way
  // is clear of the piece depends on the pose, so a note stands outside the
  // outline of everything drawn instead: the upper half of the cells (on screen)
  // get theirs above it and the rest below, each straight over or under its cell,
  // with a leader down or up to the cell's middle. So two notes never meet.
  //
  // Where there is not room outside the outline — a small viewer — a note is kept
  // inside the viewer instead, which needs its size: so it is measured once drawn,
  // and the first placement of a note is followed by a second.
  let axisLabels = $state([]);
  let noteSpots = $state([]);
  let labelFrame = 0;
  const noteEls = {};

  function calloutsFor(local, { width, height }) {
    const bounds = stage.outline();
    if (!bounds || !notes.length) return [];
    const within = (v, size, room) => Math.min(Math.max(v, size + CALLOUT_GAP), room - CALLOUT_GAP);
    const top = local({ x: bounds.left, y: bounds.top }).y;
    const bottom = local({ x: bounds.left, y: bounds.bottom }).y;
    const spots = stage.project(notes.map(({ cell }) => toWorld(cell))).map(local);
    const order = spots.map((_, i) => i).sort((a, b) => spots[a].y - spots[b].y);
    const above = new Set(order.slice(0, Math.ceil(notes.length / 2)));
    return notes.map(({ key, lines }, i) => {
      const side = above.has(i) ? 'above' : 'below';
      const w = noteEls[key]?.offsetWidth ?? 0;
      const h = noteEls[key]?.offsetHeight ?? 0;
      const x = within(spots[i].x + w / 2, w, width) - w / 2;
      const y = side === 'above'
        ? within(top - CALLOUT_GAP, h, height)
        : within(bottom + CALLOUT_GAP + h, h, height) - h;
      return { key, lines, side, x, y, to: spots[i], measured: Boolean(noteEls[key]) };
    });
  }

  function placeLabels() {
    labelFrame = 0;
    if (!stage || !host) {
      axisLabels = [];
      noteSpots = [];
      return;
    }
    const box = host.getBoundingClientRect();
    const local = ({ x, y }) => ({ x: x - box.left, y: y - box.top });
    axisLabels = origin ? stage.originTips().map(({ name, ...spot }) => ({ name, ...local(spot) })) : [];
    noteSpots = calloutsFor(local, box);
    if (noteSpots.some(spot => !spot.measured)) scheduleLabels();
  }

  function scheduleLabels() {
    if (!labelFrame) labelFrame = requestAnimationFrame(placeLabels);
  }

  let originKey = null;
  $effect(() => {
    const key = origin ? `${origin.lo}|${origin.hi}` : null;
    if (!ready || !stage || key === originKey) return;
    stage.setOrigin(origin);
    originKey = key;
    scheduleLabels();
  });

  // The notes, keyed on what they say and where, for the same reason as the lattice.
  let notesKey = null;
  $effect(() => {
    const key = notes.map(n => `${n.key}${n.cell}${n.lines}`).join('|');
    if (!ready || !stage || key === notesKey) return;
    notesKey = key;
    scheduleLabels();
  });

  // The ghost trains, keyed on what they are for the same reason as the lattice.
  let ghostKey = null;
  $effect(() => {
    const key = ghosts.map(g => `${g.type}${g.cell}${g.pose}${g.tint}`).join('|');
    if (!ready || !stage || key === ghostKey) return;
    stage.setGhosts(ghosts);
    ghostKey = key;
  });

  // The filled cells, keyed the same way.
  let fillKey = null;
  $effect(() => {
    const key = fill.join('|');
    if (!ready || !stage || key === fillKey) return;
    stage.setFill(fill);
    fillKey = key;
  });

  // Framing. A tumble's frame deliberately does *not* read `pieces` or `camera`:
  // it is the fixed box, so a new shape has nothing to reframe and this never fires
  // on one. Only `drop` or `reach` moves it, which is someone changing the shot on
  // purpose rather than the shot chasing the content.
  //
  // A grow has no frame here at all: the frame is `showGrown`'s, and two things
  // writing the camera would have it snapping back mid-pan.
  $effect(() => {
    if (!ready || !stage || !change.frame) return;
    stage.frameTo(change.frame());
  });
</script>

<div
  class="viewer"
  class:interactive={Boolean(controls)}
  class:blueprint
  style:--dot-s={sheet && `${sheet.spacing}px`}
  style:--dot-x={sheet && `${sheet.x}px`}
  style:--dot-y={sheet && `${sheet.y}px`}
  bind:this={host}
  style:aspect-ratio={aspect}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
>
  <canvas bind:this={canvas}></canvas>
  {#each axisLabels as { name, x, y } (name)}
    <span class="axis-label" style:left="{x}px" style:top="{y}px" aria-hidden="true">{name}</span>
  {/each}
  {#if noteSpots.length}
    <svg class="leaders" aria-hidden="true">
      {#each noteSpots as { key, x, y, to } (key)}
        <line x1={x} y1={y} x2={to.x} y2={to.y} />
        <circle cx={to.x} cy={to.y} r="3" />
      {/each}
    </svg>
  {/if}
  {#each noteSpots as { key, lines, side, x, y } (key)}
    <span class="note {side}" style:left="{x}px" style:top="{y}px" aria-hidden="true" bind:this={noteEls[key]}>
      {#each lines as line, i (i)}<span>{line}</span>{/each}
    </span>
  {/each}

  {#if controls && touched}
    <!-- Its pointer-down stops here, so a click is not also a drag on the viewer. -->
    <button
      type="button"
      class="reset"
      onpointerdown={event => event.stopPropagation()}
      onclick={() => stage?.reset({ instant: reduced })}
      aria-label="Reset the view"
      title="Reset the view"
    >
      <RotateCcw aria-hidden="true" />
    </button>
  {/if}

  {#if failed}
    <p class="failed">Could not start the 3D view: {failed}</p>
  {/if}
</div>

<style>
  .viewer {
    --grid-opacity: 0.22;
    --train-cell-opacity: 0.4;
    position: relative;
    width: 100%;
    overflow: hidden;
    display: grid;
    place-items: center;
  }

  /* The blueprint: an isometric sheet of dots, pinned where the stage says. The
     rows are √3/2 of a spacing apart and every other one is shifted half a dot, so
     each dot has six neighbours; that is two layers of the same dot, one per row. */
  .viewer.blueprint {
    --blueprint-dot: color-mix(in srgb, var(--grid-color) 50%, transparent);
    --dot-r: 1px;
    --dot-h: calc(var(--dot-s) * 0.866);
    --dot: radial-gradient(circle, var(--blueprint-dot) var(--dot-r), transparent calc(var(--dot-r) + 0.75px));
    background-image: var(--dot), var(--dot);
    background-size: var(--dot-s) calc(2 * var(--dot-h));
    background-position:
      calc(var(--dot-x) - var(--dot-s) / 2) calc(var(--dot-y) - var(--dot-h)),
      var(--dot-x) var(--dot-y);
  }

  /* Orbiting and page-scrolling fight over the same drag on a touch screen.
     Only the viewers that are meant to be handled claim the gesture; the small
     cards stay scrollable. */
  .viewer.interactive {
    touch-action: none;
    cursor: grab;
  }

  .viewer.interactive:active {
    cursor: grabbing;
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* The axis letters are text, so they never turn with the camera or read backwards. */
  .axis-label {
    position: absolute;
    transform: translate(-50%, -50%);
    font-family: ui-monospace, monospace;
    font-weight: 600;
    color: var(--grid-color);
    pointer-events: none;
    user-select: none;
  }

  /* A callout's leaders, drawn over the scene in the lattice's colour. */
  .leaders {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
    stroke: var(--grid-color);
    stroke-width: 1.5;
    fill: var(--grid-color);
  }

  /* A callout's text, centred over (or under) its cell, a line per entry. Its edge
     nearest the drawing is on the leader's end. */
  .note {
    position: absolute;
    transform: translate(-50%, -100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    background: color-mix(in srgb, var(--card-footer) 85%, transparent);
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    line-height: 1.25;
    white-space: nowrap;
    color: var(--grid-color);
    pointer-events: none;
    user-select: none;
  }

  .note.below {
    transform: translate(-50%, 0);
  }

  /* Outlined like PlayPause, over a footer-coloured fill so it reads over the dots. */
  .reset {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 2px solid currentColor;
    border-radius: 0.5rem;
    background: var(--card-footer);
    color: inherit;
    cursor: pointer;
  }

  .failed {
    position: absolute;
    inset: auto 0 0 0;
    margin: 0;
  }
</style>
