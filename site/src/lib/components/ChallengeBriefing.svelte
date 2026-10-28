<script>
	// The challenge, before the builder: what scores, who judges, and how the board
	// stands. The post opens it from "Bring it on", and the front page on a first
	// visit and from its header.
	//
	// Each metric is said again, with what it is worth at the post's weights, fixed,
	// since a reader may have moved the sliders above it. The board's numbers are asked for as soon as
	// this mounts, not when it opens, and their line appears only once they are back:
	// a board that cannot be reached leaves the score to beat standing alone.
	import { onMount } from "svelte";
	import Modal from "./Modal.svelte";
	import { standings } from "$lib/leaderboard.js";
	import { SWEEP_CROSSED_RANKED } from "$lib/sweeps.js";
	import { DIRECTIONS, WEIGHTS } from "$lib/weighting.js";

	// `onconfirm` is called once the reader takes the challenge on, and `ondecline`,
	// if given, once they turn it down: without it there is no button to.
	let { onconfirm, ondecline = undefined } = $props();

	const TO_BEAT = SWEEP_CROSSED_RANKED.best[0].score;

	// The metrics in the Scorecard's order, each with what a unit of it is.
	const METRICS = [
		[
			"longestSide",
			"Longest side",
			"The length of the largest side of the box the track can fit into.",
			"a cube"
		],
		[
			"closeCalls",
			"Close calls",
			"The number of times the train is adjacent to a different track piece.",
			"each"
		],
		[
			"poses",
			"Orientation count",
			"The number of distinct orientations the train assumes along the track.",
			"each"
		],
		[
			"repeats",
			"Repeats",
			"The number of times the train repeats a track piece more than twice.",
			"each"
		],
		["knotted", "Knotted", "Whether the layout ties itself in a knot.", ""]
	];

	// Signed with a real minus, as `ScoreMaths` signs them.
	function worth(name, unit) {
		const points = WEIGHTS[name] * DIRECTIONS[name];
		const size = Math.abs(points);
		return `${points < 0 ? "−" : "+"}${size} point${size === 1 ? "" : "s"}${unit ? ` ${unit}` : ""}`;
	}

	let dialog = $state(null);
	let board = $state(null);

	onMount(() => {
		standings(null, 1)
			.then((answer) => (board = answer))
			.catch(() => {});
	});

	// The board's mean score, from its histogram.
	const average = $derived(
		board?.total &&
			board.histogram.reduce((sum, [score, count]) => sum + score * count, 0) /
				board.total
	);

	/** Shows the briefing. */
	export function open() {
		dialog.showModal();
	}

	function confirm() {
		dialog.close();
		onconfirm();
	}

	function decline() {
		dialog.close();
		ondecline();
	}
</script>

<Modal bind:dialog aria-labelledby="briefing-title">
	<!-- Placeholder wording throughout: Owen's to replace. -->
	<h2 id="briefing-title">Build your own</h2>
	<p>Build a complete Rail Cube track, optimising for the below:</p>
	<ol>
		{#each METRICS as [name, label, meaning, unit] (name)}
			<li><b>{label}:</b> {meaning} ({worth(name, unit)})</li>
		{/each}
	</ol>
	<p>
		Submit your layouts to the RCAP (Rail Cube Adjudication Panel, AKA my
		three-year-old). If you like, leave your internet handle as your name and
		I'll give you a shout-out.
	</p>
	<p class="cta">
		{#if board?.total}
			So far, {board.total} tracks have been built by you, with an average score of
			{average.toFixed(1)}.
		{/if}
		The score to beat is <strong>{TO_BEAT}</strong>.
	</p>
	<div class="actions">
		{#if ondecline}
			<button type="button" onclick={decline}>No thanks</button>
		{/if}
		<button type="button" class="primary" onclick={confirm}>Let's go</button>
	</div>
</Modal>

<style>
	p {
		margin: 0.75rem 0;
	}

	ol {
		margin: 0.75rem 0;
		padding-left: 1.25rem;
	}

	li {
		margin-bottom: 0.375rem;
	}

	/* Set apart from the briefing, in the lattice's blue, with the score to beat
	   standing out of it. */
	.cta {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		border: 2px solid var(--grid-color);
		border-radius: 0.5rem;
		background: var(--page);
	}

	.cta strong {
		color: var(--grid-color);
		font-size: 1.5rem;
		line-height: 1;
	}
</style>
