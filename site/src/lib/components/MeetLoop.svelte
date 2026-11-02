<script>
	// The meet-in-the-middle's search for a loop's last segment, one attempt at a
	// time: a carousel of the candidates, decoys first and the real one last, not
	// wrapping. Each is tried as `TrackSum` adds two groups, at the press of a button:
	// drawn apart, turned to carry on from what is built, then joined to it, its end's
	// callout marked ✗ or ✓. A figure — see `$lib/figure.js`.
	import Frame from "./Frame.svelte";
	import Attempts from "./Attempts.svelte";
	import { loopTrials, viewerShape } from "$lib/meet.svelte.js";

	// `loop` is 'a', the first loop's second segment, or 'b', the second loop's last.
	// `camera` is how the attempts are shot: 'follow' frames each picture on its own
	// and pans between them, 'fixed' holds one shot over every candidate in every
	// picture. Square on a phone, 16/10 otherwise, unless `aspect` is given.
	let { loop, camera = "follow", aspect = undefined } = $props();
	const shape = viewerShape(() => aspect);

	const trials = $derived(loopTrials(loop, camera));

	// Each picture, and what the button says to leave it.
	const STEPS = [
		{ state: "apart", label: "Rotate" },
		{ state: "turned", label: "Join" },
		{ state: "joined", label: "Reset" }
	];

	let attempt = $state(0);
	let at = $state(0);
	const step = $derived(STEPS[at]);

	// Another attempt starts apart.
	const turn = (by) => {
		attempt += by;
		at = 0;
	};

	const view = $derived({
		shape: trials.routes[attempt],
		scene: trials.pictures[step.state],
		transition: { kind: "move", pan: 0.6 }
	});
</script>

<Frame {view} aspect={shape.value}>
	{#snippet footer()}
		<Attempts
			count={trials.candidates.length}
			{attempt}
			letters={trials.candidates[attempt]}
			onturn={turn}
		>
			<button type="button" class="step" onclick={() => (at = (at + 1) % STEPS.length)}>
				{step.label}
			</button>
		</Attempts>
	{/snippet}
</Frame>

<style>
	/* As TrackSum's. Wide enough for "Rotate", so it keeps one width on every label. */
	.step {
		min-width: 6rem;
		height: 44px;
		padding: 0 1rem;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
</style>
