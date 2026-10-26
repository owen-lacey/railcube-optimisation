<script>
	// The 24 poses: one see-through cell with the train in it, stepped from one
	// pose to the next by hand, in the order the model lists them, wrapping both ways.
	// It starts on DF, the canonical orientation (−z +y): nothing in the post moves
	// until it is asked to.
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import TrackViewer from "./TrackViewer.svelte";
	import { POSES } from "../../../../src/track.js";
	import { describePose } from "$lib/catalogue.js";
	import { poseCycle, poseGhost } from "$lib/scenes.js";
	import { attachControls } from "$lib/render/controls.js";
	import ExpandingCard from "./ExpandingCard.svelte";

	let { aspect = "3 / 2" } = $props();

	const scene = poseCycle();
	let index = $state(POSES.indexOf("DF"));
	let expanded = $state(false);
	let handled = $state(false);
	const pose = $derived(POSES[index]);

	const turn = (by) => {
		index = (index + by + POSES.length) % POSES.length;
	};
</script>

<ExpandingCard footer={controls} label="The train inside one cube, full screen" bind:expanded bind:handled>
	{#snippet children(toggle, hand)}
		<TrackViewer
			pieces={scene.pieces}
			camera={scene.camera}
			grid={scene.grid}
			origin={scene.origin}
			ghosts={[poseGhost(pose)]}
			controls={handled ? attachControls : null}
			tools={toggle}
			cornerTools={hand}
			aspect={expanded ? "auto" : aspect}
			blueprint
			label="The train inside one cube, in each of its 24 orientations in turn"
		/>
	{/snippet}
</ExpandingCard>

{#snippet controls()}
	<div class="poses" role="group" aria-label="Orientation">
		<button class="turn" aria-label="Previous orientation" onclick={() => turn(-1)}><ChevronLeft /></button>
		<p class="caption">{describePose(pose)}</p>
		<button class="turn" aria-label="Next orientation" onclick={() => turn(1)}><ChevronRight /></button>
	</div>
{/snippet}

<style>
	.poses {
		display: flex;
		flex-basis: 100%;
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
</style>
