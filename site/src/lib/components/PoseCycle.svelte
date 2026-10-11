<script>
	// The 24 poses: one see-through cell with the train in it, stepped from one
	// pose to the next by hand, in the order the model lists them, wrapping both ways.
	// It starts on the first: nothing in the post moves until it is asked to.
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import TrackViewer from "./TrackViewer.svelte";
	import { POSES } from "../../../../src/track.js";
	import { describePose } from "$lib/catalogue.js";
	import { poseCycle, poseGhost } from "$lib/scenes.js";
	import LayoutCard from "./LayoutCard.svelte";

	let { aspect = "3 / 2" } = $props();

	const scene = poseCycle();
	let index = $state(0);
	const pose = $derived(POSES[index]);

	const turn = (by) => {
		index = (index + by + POSES.length) % POSES.length;
	};
</script>

<LayoutCard footer={controls}>
	<TrackViewer
		pieces={scene.pieces}
		camera={scene.camera}
		grid={scene.grid}
		ghosts={[poseGhost(pose)]}
		{aspect}
		label="The train inside one cube, in each of its 24 poses in turn"
	/>
</LayoutCard>

{#snippet controls()}
	<div class="poses" role="group" aria-label="Pose">
		<button class="turn" aria-label="Previous pose" onclick={() => turn(-1)}><ChevronLeft /></button>
		<p class="caption">{describePose(pose)}</p>
		<button class="turn" aria-label="Next pose" onclick={() => turn(1)}><ChevronRight /></button>
	</div>
	<span class="readout">Pose {index + 1}/{POSES.length}</span>
{/snippet}

<style>
	.poses {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.poses .caption {
		min-width: 16ch;
		margin: 0;
		text-align: center;
	}

	.turn {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.readout {
		margin-left: auto;
		font-family: ui-monospace, monospace;
		font-weight: 600;
	}
</style>
