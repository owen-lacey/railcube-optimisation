<script>
  import { onMount } from 'svelte';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { createStage, together, deferred } from '../render/stage.js';
  import { readTheme } from '../render/renderer.js';
  import { trackPhase, buildPhase, growPhase } from '../render/build.js';
  import { movePhase, turnPhase, TURN } from '../render/move.js';
  import { fadeInPhase, fadeOutPhase, overlayFadePhase, changingFadePhase } from '../render/fade.js';
  import { gridLines } from '../render/grid.js';
  import { edgeLengths } from '../render/lengths.js';
  import { fixedFrame, sketchBox, withAxes, frameTight, cubeIds } from '$lib/scenes.js';
  import { identify } from '../../../../src/layouts.js';
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
    //   redraw  drawn finished, off an emptied stage. `{ pan }`: seconds the camera
    //           takes to ease to a new frame; unset, it cuts.
    //   build   the stage is emptied and every piece comes in from off the edge of
    //           the frame, in route order. Framed on `camera`, as a static track is.
    //           `{ pace, speed }`.
    //   tumble  the layout that is there collapses and the new one is built out of
    //           the pieces that fall. Framed on a fixed box, not on `camera`.
    //           `{ pace, speed, handover, drop, reach }`.
    //   grow    the layout *extends* the one that is there: whatever the two have in
    //           common is left standing and only the rest arrives. The one kind whose
    //           camera moves — see `showGrown`. `{ pace, speed, from, arrival, start }`,
    //           `arrival` a name in build.js's `ARRIVALS`, `start` the orientation
    //           the track starts in: a new one is the same track turned about the
    //           origin cube, and is shown as that — see `showTurned`.
    //   move    every cube the two layouts share is carried over to its new slot, a
    //           cube with no slot fades out where it stands, and one with no cube
    //           comes in from beyond the edge of the picture. An outline or callout
    //           the new layout lacks fades out as they go, and one it brings fades
    //           in once they land. Framed on `camera`, as a static track is.
    //           `{ speed, pan }`.
    //   steps   a layout for a new `step` is a fresh picture: the one there fades out
    //           where it stands, the camera cuts, and the new one fades in a group at
    //           a time (`piece.group`, see `render/fade.js`). A layout for the same
    //           step is a move. `{ step, speed, pan }`, `pan` for the move.
    //
    // `speed` is one tempo over the whole assembly (see `timingFor` in build.js).
    // `handover` is when the build starts, measured from the moment the track is let
    // go of: the two run *together*. `reach` is how far the fixed frame reaches, in
    // cells — unset, the JS solver's own box constraint (see `fixedFrame`). `from` is
    // the smallest box a growing frame takes — unset, the tight one a sketch starts in
    // (see `sketchBox`).
    transition = { kind: 'redraw' },
    // The train, as callbacks, or null for none. Read when a layout is shown, and a
    // new one shows the layout again.
    //   at()       who holds it: a piece index to hold it there, null to let it drive.
    //   onAt(i)    told the piece it has driven onto. Both redraw only — see `trackPhase`.
    //   onPiece(c) told the cube of the piece it is on, `[x, y, z]`, each time it
    //              moves onto a new one, and null when it goes. A held train only.
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
    // at this box's corner, `{ lo, hi }`; null draws neither. `cell: false` leaves out
    // the outline, `size` scales the arrows and `gap` sets how far outside the box they start. See `render/axes.js`.
    origin = null,
    // A box of cells, `{ lo, hi }`, whose three side lengths are written beside its
    // edges; null writes none. See `render/lengths.js`.
    lengths = null,
    // Trains that stand still, `{ type, cell, pose }` each. See `setGhosts` in stage.js.
    ghosts = [],
    // Cells, `[x, y, z]` each, filled see-through in the train cell's paint whether
    // or not a train is driving. See `setFill` in stage.js.
    fill = [],
    // Cells, `{ cell, tint? }` each, outlined the way `origin` outlines the origin
    // cell, without its arrows — or, tinted 'before' or 'after', as a step's start or
    // end. See `setOutlines` in stage.js.
    outlines = [],
    // Hold everything where it is — see `setPaused` in stage.js.
    paused = false,
    // Callouts on cells, `{ key, lines, cell, side, flash }` each: set outside what
    // is drawn with a leader line to the middle of `cell`, and kept there as the
    // camera moves. A line is an array of parts, `{ text, changed }`, and
    // a changed part is picked out each time `flash` changes. `side` pins it 'left',
    // 'above' or 'below'; unset, it is chosen. See `calloutsFor`.
    notes = [],
    // The ID of a cube the model has rejected, `5L` say, or null. It is drawn where
    // it was asked to go and pulses there, whatever the transition — see `pulseFor`
    // in build.js. Read when a layout is shown.
    alarm = null,
    // The IDs of cubes picked out — a repeat, say. Each keeps its own colour and
    // pulses to a pale tint of it, on the alarm's period. Read when a layout is shown.
    highlight = [],
  } = $props();

  // The settings a transition leaves out.
  const DEFAULTS = { pace: 0.04, speed: 1.2, handover: 0.5, drop: 2 };
  const settings = () => ({ ...DEFAULTS, ...transition });
  // What a phase is told of the rejected piece. Held still for a reader who has
  // asked for reduced motion: a pulsing element is the whole of what that is about.
  const flagged = () => alarm && { id: alarm, pulse: !reduced };
  // And of the picked-out pieces. Held pale for that reader.
  const picked = () => (highlight.length ? { ids: highlight, pulse: !reduced } : null);

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
  // How strongly the overlays are drawn, which the HTML over the scene follows; and
  // the changing ones a move drops or brings, on top of that.
  let overlayShare = $state(1);
  let changingShare = $state(1);
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
  let shownTrain = null;
  // The `step` of a steps transition last shown, which is what makes the next one
  // an entrance or a move. Not `$state`, for the same reason as `shown`.
  let shownStep = undefined;
  // The `start` of a grow last shown, and whether a turn to a new one has yet to
  // put the overlays it is holding back up. Not `$state`, for the same reason.
  let shownStart = undefined;
  let turning = false;
  // Whether a move has yet to land, and so to put up the overlays it brings; and
  // whether those are being put up, to fade in. Not `$state`, for the same reason
  // as `shown`.
  let moving = false;
  let bringing = false;
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
   * The picture as a PNG blob: the canvas's last draw, at its own pixel size —
   * the viewer's CSS size times the renderer's pixel ratio.
   */
  export function snapshot() {
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  /**
   * The five kinds of transition. Each says how it shows a layout, where it frames
   * (null for one that frames itself) and what it loads first. A reader who has asked
   * for reduced motion gets the redraw from those that would otherwise assemble,
   * and a tumble or a move with nothing standing has nothing to rearrange.
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
    move: {
      show: next => (shown && !reduced ? showMoved : showStatic)(next),
      frame: () => camera,
    },
    // Framed by `showStepped`: a cut has to wait for the old layout to go.
    steps: { show: showStepped, frame: null },
  };

  /**
   * Show a layout, by this viewer's kind of transition.
   *
   * A new `train` shows it again even when the pieces are the same: its callbacks
   * are handed to the phase here, so a viewer whose figure changes under it (a
   * scrolly section's next step) would otherwise keep driving the old one's.
   */
  function show(next) {
    const key = keyOf(next);
    if (key === shownKey && train === shownTrain) return;

    change.show(next);

    shown = next;
    shownKey = key;
    shownTrain = train;
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
   * The frame grows and shrinks with it: see `sketchBox`.
   */
  function showGrown(next) {
    const { start } = settings();
    const turned = start !== shownStart;
    shownStart = start;
    if (turned && shown?.length && next.length && !reduced) return showTurned(next);

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

    // A change while a turn was still under way puts back what the turn was holding.
    const unveil = turning || stage.overlayOpacity() < 1;
    if (turning) showOverlays();
    stage.run([together(
      growPhase(stage, next, { ...grown(), leaving, instant: reduced }),
      unveil && overlayFadePhase(stage, { to: 1, speed: Number(settings().speed) }),
    )]);

    // The track's bounds, never smaller than `from` — see `sketchBox` — so a piece
    // inside the box moves nothing, and one taken off shrinks the frame back. A
    // reader who has asked for reduced motion gets the same box, arrived at instantly.
    if (reduced) stage.frameTo(grownShot(next));
    else stage.panTo(grownShot(next));
  }

  /** What `growPhase` is told, bar what is leaving and whether it is instant. */
  const grown = () => {
    const { pace, speed, arrival } = settings();
    return {
      arrival, pace: Number(pace), speed: Number(speed), drive: Boolean(train), alarm: flagged(), highlight: picked(),
    };
  };

  /** A grow's frame: the track's bounds, never smaller than `from` — see `sketchBox`. */
  const grownShot = next => {
    const box = sketchBox(next, settings().from);
    return frameTight(origin ? withAxes(box, origin) : box);
  };

  /**
   * The same track from a new start: turned about the origin cube, with only the
   * track to be seen while it turns. Every overlay — the lattice, the axes, the
   * outlines, the ghosts and the callouts — fades out where it stands, the cubes turn
   * as the camera pans to the new frame, and the overlays fade back in where they
   * now belong.
   *
   * The overlays' own effects stand aside from the moment the start changes until
   * the old ones are out of sight, and then this puts up the new ones.
   */
  function showTurned(next) {
    turning = true;
    const speed = Number(settings().speed);
    stage.run([
      overlayFadePhase(stage, { to: 0, speed }),
      deferred(() => {
        showOverlays();
        stage.panTo(grownShot(next), TURN / speed);
        return turnPhase(stage, next, { speed });
      }),
      deferred(() => together(
        overlayFadePhase(stage, { to: 1, speed }),
        // Every cube is home, so this touches none: it keeps a rejected piece pulsing.
        growPhase(stage, next, { ...grown(), instant: true }),
      )),
    ]);
  }

  /** Put up the overlays a turn held back: the ones asked for now. */
  function showOverlays() {
    turning = false;
    showGrid();
    showOrigin();
    showOutlines();
    showGhosts();
    showNotes();
    scheduleLabels();
  }

  /**
   * Is a turn holding the overlays back? From the moment a new start is asked for
   * — which the overlays' effects may see before `show` does — until `showTurned`
   * puts them back up.
   */
  const held = () => turning
    || (change === CHANGES.grow && Boolean(shown?.length) && !reduced && settings().start !== shownStart);

  /** Draw it finished and drive it, off an emptied stage. */
  function showStatic(next) {
    stage.clear();
    stage.run([finished(next)]);
  }

  /** The layout drawn finished and driven, over whatever cubes are on the stage. */
  const finished = next => trackPhase(stage, next, {
    drive: Boolean(train), trainAt: train?.at, onTrainAt: train?.onAt, alarm: flagged(), highlight: picked(),
  });

  /**
   * Carry the cubes that are there over to the new layout's slots, and drive it
   * once they have all landed. A cube whose ID the new layout lacks is taken off
   * the stage first, so its ID is free, and fades out where it stands.
   */
  function showMoved(next) {
    const keep = new Set(identify(next));
    const leaving = [...stage.cubes.keys()].filter(id => !keep.has(id)).map(id => stage.detach(id));
    const speed = Number(settings().speed);
    moving = true;
    stage.run([
      together(
        movePhase(stage, next, { leaving, frame: camera, speed }),
        changingFadePhase(stage, { to: 0, speed }),
      ),
      deferred(() => {
        landed();
        return together(finished(next), changingFadePhase(stage, { to: 1, speed }));
      }),
    ]);
  }

  /**
   * Is a move holding new overlays back? From the moment new pieces are asked for
   * — which the overlays' effects may see before `show` does — until every cube has
   * landed. Meanwhile the overlays both layouts have stay up, an outline or callout
   * the new layout lacks fades out (a ghost goes at once), and one it brings waits
   * for its cubes, so nothing is drawn where they have yet to arrive.
   */
  const landing = () => moving
    || (change === CHANGES.move && Boolean(shown) && !reduced && keyOf(pieces) !== shownKey);

  /**
   * Of `next`, what to put up, matched with what is `up` by `key`. While a move is
   * landing: the ones already up, and — if they `fade` — the ones it drops, marked
   * `changing: 'out'`. As it lands: all of them, the ones it brings marked
   * `changing: 'in'` if they `fade`. Otherwise: all of them, unmarked. A mark counts
   * towards whether the list has changed (`markedKey`), so a list the same but for
   * its marks is put up again.
   */
  function arriving(up, next, key, { fade = false } = {}) {
    const kept = new Set(up.filter(item => item.changing !== 'out').map(key));
    if (landing()) {
      const wanted = new Set(next.map(key));
      const going = fade ? up.filter(item => !wanted.has(key(item))).map(item => ({ ...item, changing: 'out' })) : [];
      return [...next.filter(item => kept.has(key(item))), ...going];
    }
    if (bringing && fade) return next.map(item => (kept.has(key(item)) ? item : { ...item, changing: 'in' }));
    return next;
  }

  /** `key`, and whether the item is changing, which way. */
  const markedKey = key => item => `${key(item)}${item.changing ?? ''}`;

  /** Put up the overlays a move held back: the ones asked for now. */
  function landed() {
    moving = false;
    bringing = true;
    showOutlines();
    showGhosts();
    showNotes();
    bringing = false;
  }

  /**
   * A new step's layout faded in once the last has faded out, with the camera cut
   * to it in between, when the stage is empty; the same step's carried over.
   */
  function showStepped(next) {
    const { step, speed, pan } = settings();
    const entering = step !== shownStep;
    shownStep = step;
    const shot = camera;
    if (reduced) {
      stage.frameTo(shot);
      showStatic(next);
    } else if (entering) {
      const leaving = [...stage.cubes.keys()].map(id => stage.detach(id));
      stage.run([
        fadeOutPhase(leaving, { speed: Number(speed) }),
        deferred(() => {
          stage.frameTo(shot);
          return fadeInPhase(stage, next, { speed: Number(speed) });
        }),
        deferred(() => finished(next)),
      ]);
    } else {
      if (pan) stage.panTo(shot, Number(pan));
      else stage.frameTo(shot);
      showMoved(next);
    }
  }

  /** Empty the stage and click the whole layout together, every piece a mint. */
  function showBuilt(next) {
    stage.clear();
    const { pace, speed } = settings();
    stage.run([buildPhase(stage, next, {
      pace: Number(pace), speed: Number(speed), drive: Boolean(train), alarm: flagged(), highlight: picked(),
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
      alarm: flagged(), highlight: picked(),
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
          onTrainPiece: cube => train?.onPiece?.(cube),
          onTrainPose: pose => train?.onPose?.(pose),
          onCamera: () => {
            touched = stage?.touched() ?? false;
            if (origin || lengths || notes.length) scheduleLabels();
            if (blueprint) placeSheet();
          },
          onOverlay: share => { overlayShare = share; },
          onChanging: share => { changingShare = share; },
        });
        stage.setPaused(paused);
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
    void train;
    if (!ready || !stage) return;
    show(next);
  });

  // Handling comes and goes: a figure is handled only while it is full screen. Let
  // go of, the view eases home, so the page gets back the shot it was showing.
  $effect(() => {
    const attach = controls;
    if (!ready || !stage || !attach) return;
    const current = stage;
    handle = attach(host, current);
    return () => {
      handle?.destroy();
      handle = null;
      // Not on a stage already torn down by the mount's own cleanup.
      if (stage === current) current.reset({ instant: reduced });
    };
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
  function showGrid() {
    const key = grid ? `${grid.lo}|${grid.hi}` : null;
    if (key === gridKey) return;
    stage.setGrid(grid ? gridLines(grid) : null);
    gridKey = key;
  }
  $effect(() => {
    void grid;
    if (!ready || !stage || held()) return;
    showGrid();
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
  // with a leader down or up to the cell's middle. So two notes never meet. A note
  // given a `side` takes it instead and is left out of that split; a left note
  // stands beside the outline, level with its cell.
  //
  // Where there is not room outside the outline — a small viewer — a note is kept
  // inside the viewer instead, which needs its size: so it is measured once drawn,
  // and the first placement of a note is followed by a second.
  let axisLabels = $state([]);
  let lengthLabels = $state([]);
  let noteSpots = $state([]);
  let labelFrame = 0;
  const noteEls = {};

  function calloutsFor(local, { width, height }) {
    const bounds = stage.outline();
    const shown = notesUp;
    if (!bounds || !shown.length) return [];
    const within = (v, size, room) => Math.min(Math.max(v, size + CALLOUT_GAP), room - CALLOUT_GAP);
    const { x: left, y: top } = local({ x: bounds.left, y: bounds.top });
    const bottom = local({ x: bounds.left, y: bounds.bottom }).y;
    const spots = stage.project(shown.map(n => toWorld(n.cell))).map(local);
    const order = shown.map((_, i) => i).filter(i => !shown[i].side).sort((a, b) => spots[a].y - spots[b].y);
    const above = new Set(order.slice(0, Math.ceil(order.length / 2)));
    // Where each side puts a note `w` by `h` for the cell at `to`: the point on its
    // edge nearest the drawing, which is the leader's end.
    const PLACE = {
      left: (w, h, to) => ({ x: within(left - CALLOUT_GAP, w, width), y: within(to.y + h / 2, h, height) - h / 2 }),
      above: (w, h, to) => ({ x: within(to.x + w / 2, w, width) - w / 2, y: within(top - CALLOUT_GAP, h, height) }),
      below: (w, h, to) => ({ x: within(to.x + w / 2, w, width) - w / 2, y: within(bottom + CALLOUT_GAP + h, h, height) - h }),
    };
    return shown.map(({ key, lines, flash, changing, side: pinned }, i) => {
      const side = pinned ?? (above.has(i) ? 'above' : 'below');
      const w = noteEls[key]?.offsetWidth ?? 0;
      const h = noteEls[key]?.offsetHeight ?? 0;
      const { x, y } = PLACE[side](w, h, spots[i]);
      return { key, lines, flash, changing, side, x, y, to: spots[i], measured: Boolean(noteEls[key]) };
    });
  }

  function placeLabels() {
    labelFrame = 0;
    if (!stage || !host) {
      axisLabels = [];
      lengthLabels = [];
      noteSpots = [];
      return;
    }
    const box = host.getBoundingClientRect();
    const local = ({ x, y }) => ({ x: x - box.left, y: y - box.top });
    axisLabels = origin ? stage.originTips().map(({ name, ...spot }) => ({ name, ...local(spot) })) : [];
    lengthLabels = lengths ? edgeLengths(lengths, stage.project).map(({ axis, text, ...spot }) => ({ axis, text, ...local(spot) })) : [];
    noteSpots = calloutsFor(local, box);
    if (noteSpots.some(spot => !spot.measured)) scheduleLabels();
  }

  function scheduleLabels() {
    if (!labelFrame) labelFrame = requestAnimationFrame(placeLabels);
  }

  let originKey = null;
  function showOrigin() {
    const key = origin ? `${origin.lo}|${origin.hi}|${origin.cell}|${origin.size}|${origin.gap}` : null;
    if (key === originKey) return;
    stage.setOrigin(origin);
    originKey = key;
    scheduleLabels();
  }
  $effect(() => {
    void origin;
    if (!ready || !stage || held()) return;
    showOrigin();
  });

  // The side lengths, keyed on the box's corners for the same reason as the lattice.
  let lengthsKey = null;
  $effect(() => {
    const key = lengths ? `${lengths.lo}|${lengths.hi}` : null;
    if (!ready || !stage || key === lengthsKey) return;
    lengthsKey = key;
    scheduleLabels();
  });

  // The notes, keyed on what they say and where, for the same reason as the lattice.
  // `notesUp` is the ones placed, which a landing move may hold some of back.
  let notesKey = null;
  let notesUp = [];
  const noteKey = n => `${n.key}${n.cell}${n.flash}${JSON.stringify(n.lines)}`;
  function showNotes() {
    const next = arriving(notesUp, notes, noteKey, { fade: true });
    const key = next.map(markedKey(noteKey)).join('|');
    if (key === notesKey) return;
    notesUp = next;
    notesKey = key;
    scheduleLabels();
  }
  $effect(() => {
    void notes;
    if (!ready || !stage || held()) return;
    showNotes();
  });

  // The ghost trains, keyed on what they are for the same reason as the lattice.
  let ghostKey = null;
  let ghostsUp = [];
  const ghostKeyOf = g => `${g.type}${g.cell}${g.pose}`;
  function showGhosts() {
    const next = arriving(ghostsUp, ghosts, ghostKeyOf);
    const key = next.map(ghostKeyOf).join('|');
    if (key === ghostKey) return;
    stage.setGhosts(next);
    ghostKey = key;
    ghostsUp = next;
  }
  $effect(() => {
    void ghosts;
    if (!ready || !stage || held()) return;
    showGhosts();
  });

  // The filled cells, keyed the same way.
  let fillKey = null;
  $effect(() => {
    const key = fill.join('|');
    if (!ready || !stage || key === fillKey) return;
    stage.setFill(fill);
    fillKey = key;
  });

  // The outlined cells, keyed the same way.
  const outlineKey = ({ cell, tint }) => `${cell}:${tint}`;
  let outlinesKey = null;
  let outlinesUp = [];
  function showOutlines() {
    const next = arriving(outlinesUp, outlines, outlineKey, { fade: true });
    const key = next.map(markedKey(outlineKey)).join('|');
    if (key === outlinesKey) return;
    stage.setOutlines(next);
    outlinesKey = key;
    outlinesUp = next;
  }
  $effect(() => {
    void outlines;
    if (!ready || !stage || held()) return;
    showOutlines();
  });

  // Framing. A tumble's frame deliberately does *not* read `pieces` or `camera`:
  // it is the fixed box, so a new shape has nothing to reframe and this never fires
  // on one. Only `drop` or `reach` moves it, which is someone changing the shot on
  // purpose rather than the shot chasing the content.
  //
  // A grow has no frame here at all: the frame is `showGrown`'s, and two things
  // writing the camera would have it snapping back mid-pan.
  //
  // A pan is picked up from wherever the camera has got to, so a new frame asked
  // for mid-pan turns towards it rather than finishing the old one first.
  $effect(() => {
    if (!ready || !stage || !change.frame) return;
    const { pan } = settings();
    if (pan && !reduced) {
      stage.panTo(change.frame(), Number(pan));
      stage.start();
    } else stage.frameTo(change.frame());
  });
</script>

<div
  class="viewer"
  class:interactive={Boolean(controls)}
  class:blueprint
  style:--dot-s={sheet && `${sheet.spacing}px`}
  style:--dot-x={sheet && `${sheet.x}px`}
  style:--dot-y={sheet && `${sheet.y}px`}
  style:--overlay={overlayShare}
  style:--changing={changingShare}
  bind:this={host}
  style:aspect-ratio={aspect}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
>
  <canvas bind:this={canvas}></canvas>
  {#each axisLabels as { name, x, y } (name)}
    <span class="axis-label" style:left="{x}px" style:top="{y}px" aria-hidden="true">{name}</span>
  {/each}
  {#each lengthLabels as { axis, text, x, y } (axis)}
    <span class="axis-label" style:left="{x}px" style:top="{y}px" aria-hidden="true">{text}</span>
  {/each}
  {#if noteSpots.length}
    <svg class="leaders" aria-hidden="true">
      {#each noteSpots as { key, x, y, to, changing } (key)}
        <g class:changing>
          <line x1={x} y1={y} x2={to.x} y2={to.y} />
          <circle cx={to.x} cy={to.y} r="3" />
        </g>
      {/each}
    </svg>
  {/if}
  {#each noteSpots as { key, lines, flash, changing, side, x, y } (key)}
    <span class="note {side}" class:changing style:left="{x}px" style:top="{y}px" aria-hidden="true" bind:this={noteEls[key]}>
      <!-- Remade on each flash, so a changed part's animation starts again. -->
      {#key flash}
        {#each lines as line, i (i)}
          <span>{#each line as { text, changed }, j (j)}<span class:changed>{text}</span>{/each}</span>
        {/each}
      {/key}
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
  /* A colour rather than any string, so that it can be transitioned. */
  @property --blueprint-dot {
    syntax: '<color>';
    inherits: true;
    initial-value: transparent;
  }

  .viewer {
    --grid-opacity: 0.22;
    --train-cell-opacity: 0.4;
    position: relative;
    width: 100%;
    overflow: hidden;
    display: grid;
    place-items: center;
    background-color: var(--viewer-background);
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
  /* The HTML over the scene fades with the overlays it labels. */
  .axis-label, .leaders, .note {
    opacity: var(--overlay, 1);
  }

  /* A callout a move drops or brings fades with the outlines it does. */
  .note.changing {
    opacity: calc(var(--overlay, 1) * var(--changing, 1));
  }

  .leaders .changing {
    opacity: var(--changing, 1);
  }

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

  /* A part of a callout that has just changed: lit in the lattice's colour, then
     faded back. Held lit for a reader who has asked for reduced motion. */
  .changed {
    border-radius: 0.2em;
    animation: changed 1.6s ease-out;
  }

  @keyframes changed {
    from, 25% {
      background: var(--grid-color);
      color: var(--card-footer);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .changed {
      animation: none;
      background: var(--grid-color);
      color: var(--card-footer);
    }
  }

  .note.left {
    transform: translate(-100%, -50%);
    align-items: flex-end;
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
    border: 2px solid var(--card-border);
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
