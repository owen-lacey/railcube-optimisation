<script>
  import TrackViewer from '$lib/components/TrackViewer.svelte';
  import { PIECES } from '$lib/catalogue.js';
  import { singlePiece, poseGallery, demo } from '$lib/scenes.js';
  import { loopRoute } from '../../../../src/routes.js';
  import { chainTrack } from '../../../../src/track.js';
  import { paint } from '$lib/scenes.js';

  // One straight, on its own, for the train to sit on: the loco is the thing
  // being shown, so it gets a piece of track rather than a plinth.
  const trainScene = { ...singlePiece('straight'), drive: true };
  const trainPieces = paint(chainTrack(loopRoute));

  let posesFor = $state(null);
</script>

<svelte:head>
  <title>The pieces — Rail Cube</title>
  <meta
    name="description"
    content="Every Rail Cube track piece rendered in 3D: straight, left and right curves, inside
      and outside curves, the cross, and the train."
  />
</svelte:head>

<section>
  <h1>The pieces</h1>
  <p class="lede">
    Six piece types and one train. Every model on this page is generated from the same
    geometry the layouts use — the rail is a channel recessed into the face, exactly as wide
    as the metal strip that forms its floor.
  </p>
  <p class="prose muted">
    Drag any view to turn it. The letter is how a layout is written down: a whole track is a
    string like <code class="mono">LIRIROSOLORLLSORII</code>.
  </p>
</section>

<section>
  <div class="grid">
    {#each PIECES as piece (piece.type)}
      {@const scene = singlePiece(piece.type)}
      <article class="panel card">
        <TrackViewer
          pieces={scene.pieces}
          camera={scene.camera}
          aspect="5 / 4"
          label="{piece.name} — a {piece.colour} piece"
        />
        <header>
          <span class="swatch" style:background={piece.hex} aria-hidden="true"></span>
          <h3>{piece.name}</h3>
          <span class="letter mono">{piece.letter}</span>
        </header>
        <p class="effect">{piece.effect}</p>
        <p class="muted detail">{piece.detail}</p>
        <ul class="tags">
          <li class="tag">{piece.colour}</li>
          <li class="tag">
            {piece.starter === 0 ? 'none in the starter set' : `${piece.starter} in the starter set`}
          </li>
        </ul>
        <button
          type="button"
          onclick={() => (posesFor = posesFor === piece.type ? null : piece.type)}
          aria-expanded={posesFor === piece.type}
        >
          {posesFor === piece.type ? 'Hide' : 'Show'} all 24 poses
        </button>
      </article>
    {/each}
  </div>

  {#if posesFor}
    {@const gallery = poseGallery(posesFor)}
    {@const piece = PIECES.find(p => p.type === posesFor)}
    <div class="panel gallery">
      <h3>{piece.name} — every valid pose</h3>
      <p class="muted prose">
        A pose is the face the rail sits on plus the direction of travel, and the heading can
        never be the face or its opposite — a rail lies flat along its own face. That leaves
        exactly four headings per face, so 24 poses in all. Which is exactly the number of ways
        a cube can be rotated, so the encoding is complete and has no duplicates. One row per
        face, one column per heading.
      </p>
      <TrackViewer
        pieces={gallery.pieces}
        camera={gallery.camera}
        aspect="16 / 9"
        label="The {piece.name} in all 24 valid poses"
      />
    </div>
  {/if}
</section>

<section>
  <h2>The train</h2>
  <div class="two">
    <div class="prose">
      <p>
        The train straddles the rail and is held on by magnets. Only its wheels drop into the
        channel; the body is wider than the groove and overhangs it, clearing the cube's
        surface.
      </p>
      <p>
        For the model, what matters is that the train needs <em>room</em>. Wherever it is, it
        counts as filling the whole cell on the rail's face side — never the cube's own cell.
        Rounding up to whole cells costs nothing and makes the rule cheap to state: no cell is
        ever both cube and train.
      </p>
      <p class="muted">
        It drives here at two cubes a second, following a path sampled from the very sweep maps
        the curved pieces' geometry is built from — so it cannot drift off the metal strip.
        Every piece's rail is checked at load time to run from the centre of its entry mouth to
        the centre of the next piece's, arriving at the face and heading the piece promises.
      </p>
    </div>
    <TrackViewer
      pieces={trainPieces}
      camera={trainScene.camera}
      drive
      aspect="1 / 1"
      label="The train running along a track"
    />
  </div>
</section>

<section>
  <h2>Poses, illustrated</h2>
  <p class="prose muted">{demo.blurb}</p>
  <TrackViewer
    pieces={demo.pieces}
    camera={demo.camera}
    aspect="16 / 10"
    label={demo.title}
  />
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .card header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }

  .card h3 {
    margin: 0;
    flex: 1;
  }

  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    flex: none;
  }

  .letter {
    font-size: 0.8rem;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 0.05rem 0.4rem;
  }

  .effect {
    margin: 0;
    font-size: 0.94rem;
  }

  .detail {
    margin: 0;
    font-size: 0.86rem;
  }

  .card button {
    margin-top: auto;
    align-self: flex-start;
    font-size: 0.85rem;
  }

  .gallery {
    margin-top: 1.1rem;
  }

  .gallery h3 {
    margin-top: 0;
  }

  .two {
    display: grid;
    gap: 2rem;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    align-items: start;
  }

  @media (max-width: 860px) {
    .two {
      grid-template-columns: minmax(0, 1fr);
      gap: 1.5rem;
    }
  }
</style>
