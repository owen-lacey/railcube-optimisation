<script>
	// How `scripts/meet.py` makes a crossed layout, a step at a time, on one fixed
	// layout of the crossed sweep (`meet-figure.json`, by `scripts/meet-figure.js`).
	// Back and forwards in the footer; the cubes are carried between steps, so one
	// step's segment is the next one's. A figure — see `$lib/figure.js`.
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Frame from "./Frame.svelte";
	import GateButton from "./GateButton.svelte";
	import { joinedScene } from "$lib/scenes.js";
	import data from "$lib/data/meet-figure.json" with { type: "json" };

	let { aspect = "16 / 10" } = $props();

	const [first] = data.a.segments;

	// Each step: what is drawn, how it arrives and what the footer says. The first
	// segment is built once its pieces are picked, then its ends are shown; both
	// share one shot, so stepping between them does not pan, and stepping back
	// empties the viewer for the pieces to be picked again.
	const STEPS = [
		{
			shape: first,
			scene: (letters) => {
				const scene = joinedScene(letters, { ends: false });
				return picked ? scene : { ...scene, pieces: [] };
			},
			transition: { kind: "build" },
			caption:
				"Pick a handful of pieces from the box at random and join together."
		},
		{
			shape: first,
			scene: joinedScene,
			transition: { kind: "move", pan: 0.6 },
			caption: "Make a note of the finishing pose."
		}
	];

	let at = $state(0);
	// Whether the first step's pieces have been picked, which is what builds them.
	let picked = $state(false);
	const step = $derived(STEPS[at]);
</script>

{#snippet pick()}
	<GateButton onclick={() => (picked = true)}>Select pieces</GateButton>
{/snippet}

<Frame
	view={{ shape: step.shape, scene: step.scene, transition: step.transition }}
	centre={at === 0 && !picked ? pick : undefined}
	{aspect}
>
	{#snippet footer()}
		<div class="steps">
			<button
				type="button"
				class="turn"
				aria-label="Back"
				title="Back"
				disabled={at === 0}
				onclick={() => {
					at -= 1;
					picked = false;
				}}
			>
				<ChevronLeft aria-hidden="true" />
			</button>
			<!-- Every caption in one cell, only the current one shown, so the footer is
           the longest one's height on every step and the card never resizes. -->
			<div class="captions">
				{#each STEPS as { caption }, i}
					<p class="caption" class:current={i === at} aria-hidden={i !== at}>
						{caption}
					</p>
				{/each}
			</div>
			<button
				type="button"
				class="turn"
				aria-label="Forwards"
				title="Forwards"
				disabled={at === STEPS.length - 1 || !picked}
				onclick={() => (at += 1)}
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
