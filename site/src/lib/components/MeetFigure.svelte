<script>
	// How `scripts/meet.py` makes a crossed layout, a step at a time, on one fixed
	// layout of the crossed sweep (`meet-figure.json`, by `scripts/meet-figure.js`).
	// Back and forwards in the footer; the cubes are carried between steps, so one
	// step's segment is the next one's. A figure — see `$lib/figure.js`.
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Frame from "./Frame.svelte";
	import GateButton from "./GateButton.svelte";
	import OrientationChip from "./OrientationChip.svelte";
	import PieceTag from "./PieceTag.svelte";
	import { joinedScene, trialScene } from "$lib/scenes.js";
	import { MOVE } from "$lib/render/move.js";
	import data from "$lib/data/meet-figure.json" with { type: "json" };

	// `camera` is how the trials are shot: 'follow' frames each picture on its own and
	// pans between them, 'fixed' holds one shot over every candidate in every picture.
	let { aspect = "16 / 10", camera = "follow" } = $props();

	const [first, second] = data.a.segments;

	// Loop A's second segment, searched for: each decoy, then the real one, joined to
	// the first segment in turn.
	const candidates = [...data.a.decoys, second];
	const routes = candidates.map((candidate) => first + candidate);
	const trial = (state, judged = false) =>
		trialScene(first.length, {
			state,
			judged,
			target: data.a.heading,
			routes: camera === "fixed" ? routes : null
		});
	const TRIALS = {
		alone: trial("alone"),
		apart: trial("apart"),
		turned: trial("turned"),
		joined: trial("joined"),
		judged: trial("joined", true)
	};

	// How long each beat of the trials is held, in seconds: a carry is `MOVE`, and the
	// rest is time to look.
	const LOOK = 0.8;
	const VERDICT = 1.4;

	// The trials, beat by beat, played on entering step 3. Each candidate flies in
	// beside the first segment, is turned to carry on from it, joined to it, and its
	// end's callout marked ✗ or ✓; a miss then fades away, back to the first segment
	// alone in the next candidate's shot, before it flies in. The last beat, the real segment's ✓, is held.
	const BEATS = routes.flatMap((shape, i) => {
		const match = i === routes.length - 1;
		return [
			{ shape, state: "apart", hold: MOVE + LOOK },
			{ shape, state: "turned", hold: MOVE + LOOK },
			{ shape, state: "joined", hold: MOVE + LOOK / 2 },
			{ shape, state: "judged", hold: VERDICT },
			...(match ? [] : [{ shape: routes[i + 1], state: "alone", hold: MOVE }])
		];
	});
	const LAST = BEATS.length - 1;

	// Each step: what is drawn, how it arrives and what the footer says. The first
	// segment is built once its pieces are picked, then its ends are shown; both
	// share one shot, so stepping between them does not pan, and stepping back
	// empties the viewer for the pieces to be picked again. The third plays the
	// trials, a view a beat.
	const STEPS = [
		{
			view: () => ({
				shape: first,
				scene: (letters) => {
					const scene = joinedScene(letters, { ends: false });
					return picked ? scene : { ...scene, pieces: [] };
				},
				transition: { kind: "build" }
			}),
			caption: pickCaption
		},
		{
			view: () => ({
				shape: first,
				scene: joinedScene,
				transition: { kind: "move", pan: 0.6 }
			}),
			caption: noteCaption
		},
		{
			view: () => {
				const { shape, state } = BEATS[beat];
				return { shape, scene: TRIALS[state], transition: { kind: "move", pan: 0.6 } };
			},
			caption: pairCaption
		}
	];

	let at = $state(0);
	// Whether the first step's pieces have been picked, which is what builds them.
	let picked = $state(false);
	// Which beat of the trials is up, on the third step.
	let beat = $state(0);
	const step = $derived(STEPS[at]);
	const view = $derived(step.view());
	// Whether this step has done what it shows, so the reader can go on.
	const ready = $derived(at === 0 ? picked : at === 2 ? beat === LAST : true);

	$effect(() => {
		if (at !== 2 || beat === LAST) return;
		const timer = setTimeout(() => (beat += 1), BEATS[beat].hold * 1000);
		return () => clearTimeout(timer);
	});

	function forwards() {
		at += 1;
		// Under reduced motion the trials are skipped, straight to the match.
		if (at === 2) {
			beat = matchMedia("(prefers-reduced-motion: reduce)").matches ? LAST : 0;
		}
	}

	function back() {
		at -= 1;
		picked = false;
	}
</script>

{#snippet pickCaption()}
	Pick a handful of pieces from the box at random and join together.
{/snippet}

{#snippet noteCaption()}
	Make a note of the finishing pose.
{/snippet}

{#snippet pairCaption()}
	Do this many times, and pair up segments that would finish when it meets the <PieceTag
		letter="X"
	/> for the first time at orientation <OrientationChip orientation={data.a.heading} />.
{/snippet}

{#snippet pick()}
	<GateButton onclick={() => (picked = true)}>Select pieces</GateButton>
{/snippet}

<Frame {view} centre={at === 0 && !picked ? pick : undefined} {aspect}>
	{#snippet footer()}
		<div class="steps">
			<button
				type="button"
				class="turn"
				aria-label="Back"
				title="Back"
				disabled={at === 0}
				onclick={back}
			>
				<ChevronLeft aria-hidden="true" />
			</button>
			<!-- Every caption in one cell, only the current one shown, so the footer is
           the longest one's height on every step and the card never resizes. -->
			<div class="captions">
				{#each STEPS as { caption }, i}
					<p class="caption" class:current={i === at} aria-hidden={i !== at}>
						{@render caption()}
					</p>
				{/each}
			</div>
			<button
				type="button"
				class="turn"
				aria-label="Forwards"
				title="Forwards"
				disabled={at === STEPS.length - 1 || !ready}
				onclick={forwards}
			>
				<ChevronRight aria-hidden="true" />
			</button>
		</div>
	{/snippet}
</Frame>

<style>
	.steps {
		display: flex;
		flex-basis: 100%;
		align-items: center;
		gap: 0.75rem;
	}

	.captions {
		display: grid;
		flex: 1;
	}

	.caption {
		grid-area: 1 / 1;
		margin: 0;
		text-align: center;
		visibility: hidden;
	}

	.caption.current {
		visibility: visible;
	}

	/* Outlined like KnownTracks' shuffle. */
	.turn {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.turn:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
