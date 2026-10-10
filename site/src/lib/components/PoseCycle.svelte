<script>
	// The 24 poses: one see-through cell with the train in it, snapping from one
	// pose to the next floor by floor, in the order the model lists them, once played.
	// It starts paused on the first: nothing in the post moves until it is asked to.
	import TrackViewer from "./TrackViewer.svelte";
	import { POSES } from "../../../../src/track.js";
	import { describePose } from "$lib/catalogue.js";
	import { poseCycle, poseGhost } from "$lib/scenes.js";
	import PlayPause from "./PlayPause.svelte";
	import LayoutCard from "./LayoutCard.svelte";

	let { interval = 1, aspect = "3 / 2" } = $props();

	const scene = poseCycle();
	let index = $state(0);
	let playing = $state(false);
	const pose = $derived(POSES[index]);

	$effect(() => {
		if (!playing) return;
		const timer = setInterval(() => {
			index = (index + 1) % POSES.length;
		}, interval * 1000);
		return () => clearInterval(timer);
	});
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
	<PlayPause bind:playing label="the poses" />
	<span class="readout">Pose {index + 1}/{POSES.length}</span>
	<span class="readout facing">{describePose(pose)}</span>
{/snippet}

<style>
	.readout {
		font-family: ui-monospace, monospace;
		font-weight: 600;
	}

	.facing {
		margin-left: auto;
	}
</style>
