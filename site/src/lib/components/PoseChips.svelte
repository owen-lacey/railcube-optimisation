<script>
	// The 24 poses as chips, a column per floor and its four headings down it, each
	// ticked once the train has taken it.
	import { Tooltip } from "bits-ui";
	import PoseChip from "./PoseChip.svelte";
	import { POSES } from "../../../../src/track.js";

	// The poses taken so far, a Set of codes like `'DF'`.
	let { reached } = $props();
</script>

<Tooltip.Provider delayDuration={200}>
	<ul class="chips" aria-label="The 24 poses, ticked once the train has taken them">
		{#each POSES as pose (pose)}
			<PoseChip {pose} taken={reached.has(pose)} />
		{/each}
	</ul>
</Tooltip.Provider>

<style>
	/* `POSES` runs floor by floor, four headings each, so filling down the columns
	   gives a column per floor. */
	.chips {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 3.5rem));
		grid-template-rows: repeat(4, auto);
		grid-auto-flow: column;
		justify-content: center;
		gap: 0.375rem;
		flex-basis: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
