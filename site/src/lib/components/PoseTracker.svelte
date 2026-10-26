<script>
	// The poses a layout takes, ticked off as the train drives it: a slider for which
	// piece it is on, and the 24 poses as chips underneath. A figure — see
	// `$lib/figure.js`. Standalone only: its footer is taller than a stepped
	// section's.
	import Frame from "./Frame.svelte";
	import PoseChips from "./PoseChips.svelte";
	import TrainScrubber from "./TrainScrubber.svelte";
	import { POSES } from "../../../../src/track.js";
	import { posesIn } from "../../../../src/metrics.js";

	// `scene` is letters → scene, from scenes.js; unset, `layoutScene`.
	let { shape, scene = undefined, aspect = undefined } = $props();

	// Which piece the train is on, in route order, and whether the slider has it —
	// as in TrainCoordinates.
	let at = $state(0);
	let held = $state(true);

	const train = {
		at: () => (held ? at : null),
		onAt: (i) => {
			if (!held) at = i;
		}
	};

	// The train on piece `at` has entered it, so its pose is taken too. One past the
	// last is a whole lap, back on the first, with every pose already taken.
	const reachedBy = (pieces) =>
		posesIn(pieces.slice(0, Math.min(at, pieces.length - 1) + 1));
</script>

<Frame view={{ shape, scene, train }} {aspect}>
	{#snippet footer(drawn)}
		{#if drawn}
			{@const reached = reachedBy(drawn.pieces)}
			<TrainScrubber pieces={drawn.pieces} bind:at bind:held />
			<PoseChips {reached} />
		{/if}
	{/snippet}
</Frame>
