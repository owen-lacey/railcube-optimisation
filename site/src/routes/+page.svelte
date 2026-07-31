<script>
  import { base } from '$app/paths';
  import TrackViewer from '$lib/components/TrackViewer.svelte';
  import { loop, inversion } from '$lib/scenes.js';
</script>

<svelte:head>
  <title>Rail Cube — optimising track layouts</title>
  <meta
    name="description"
    content="A constraint model for Rail Cube, a children's magnetic monorail toy: what a legal
      track is, what the solver proved, and a CP-SAT search you can watch run in the browser."
  />
</svelte:head>

<section class="hero">
  <div>
    <h1>What is the best track you can build?</h1>
    <p class="lede">
      Rail Cube is a children's toy: magnetic cubes that click together into 3D tracks, with a
      little train that runs along them — up walls, across ceilings, upside down. Each cube
      carries a moulded rail, so the shape of the structure is what steers the train.
    </p>
    <p class="prose">
      This is a constraint model of that toy, and a showcase of what it has found so far.
      Everything below is generated in your browser from the same code the solver uses: the
      layouts are real answers, re-derived and re-checked as the page draws them.
    </p>
    <p class="prose">
      <a href="{base}/pieces">Start with the pieces</a>, look at
      <a href="{base}/layouts">what the solver found</a>, or
      <a href="{base}/solve">watch it search</a>.
    </p>
  </div>
  <TrackViewer
    pieces={loop.pieces}
    camera={loop.camera}
    drive
    aspect="1 / 1"
    label="A fourteen-piece closed loop with a train running round it"
  />
</section>

<section>
  <h2>The rules, in full</h2>
  <div class="two">
    <div class="prose">
      <p>There are only two hard constraints, and both are about physical reality.</p>
      <p>
        <strong>The track has to end where it begins</strong> — the same cell, and the same
        pose. Coming back to the start cube facing the wrong way does not close the loop,
        because the last piece has to click into the first one exactly.
      </p>
      <p>
        <strong>Nothing may collide.</strong> At most one piece per cell, and no cell is ever
        both cube and train. The train's cells may overlap each other freely — there is only
        one train — and that asymmetry is the whole reason a crossing piece is legal at all.
      </p>
      <p>
        Clearance is not a detail. Ignore the room the train needs and the shortest loop that
        touches all six faces of a cube looks like twelve pieces. Once the train has to fit,
        every one of those twelve-piece loops is illegal, and the honest answer is fourteen.
      </p>
    </div>
    <TrackViewer
      pieces={inversion.pieces}
      camera={inversion.camera}
      drive
      aspect="1 / 1"
      label="A fourteen-piece loop reaching all six faces of a cube"
    />
  </div>
</section>

<section>
  <h2>What the search has settled</h2>
  <div class="grid">
    <article class="panel">
      <h3>Every cube, nothing left over</h3>
      <p class="muted">
        Handed all 36 cubes of Owen's own set, a six-cell box and the ground, CP-SAT proves an
        optimum of zero dropped: every cube goes into one closed loop. That also settles the box
        question for free — no larger box can beat spending everything.
      </p>
    </article>
    <article class="panel">
      <h3>No loop has an odd number of pieces</h3>
      <p class="muted">
        Both the CP-SAT model and the brute-force search agree, at every length tried. Nobody
        set out to prove it; it fell out of the shape of the results.
      </p>
    </article>
    <article class="panel">
      <h3>A crossing is a tie-breaker, not a prize</h3>
      <p class="muted">
        Driving over a cross spends a step but no extra cube, so maximising cubes has no reason
        to want one. Given a set that closes comfortably, the optimum places its crosses and
        drives straight over them — but when crossing is the only way to spend every cube, the
        solver finds it unprompted.
      </p>
    </article>
    <article class="panel">
      <h3>Space binds, not pieces</h3>
      <p class="muted">
        Shrinking the box from six cells to four costs a third of the set. Three is the floor:
        below that no loop fits at all, because the smallest ring spans four cells and the start
        cube is nailed to the origin.
      </p>
    </article>
    <article class="panel">
      <h3>Two solvers, two answers, one value</h3>
      <p class="muted">
        The 18-cube optimum was reproduced independently on native OR-Tools from a separately
        written model. It found a different layout with the same cubes and the same score — which
        is evidence the model is right rather than merely self-consistent.
      </p>
    </article>
    <article class="panel">
      <h3>The scoring table is inert at full inventory</h3>
      <p class="muted">
        When the optimum spends everything, the score is a constant — independent of the
        arrangement and of the weights. Every full-inventory loop ties. You can
        <a href="{base}/solve">watch that happen</a>.
      </p>
    </article>
  </div>
</section>

<style>
  .hero,
  .two {
    display: grid;
    gap: 2rem;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    align-items: start;
  }

  .hero {
    margin-bottom: 3.5rem;
  }

  @media (max-width: 860px) {
    .hero,
    .two {
      grid-template-columns: minmax(0, 1fr);
      gap: 1.5rem;
    }
  }
</style>
