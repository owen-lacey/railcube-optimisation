<script>
	// What a piece does to the train from any pose: the train standing the way the
	// pose control says, the piece it would ride next, and the pose it ends up in.
	// Each end is outlined and labelled on the track — the piece's own cube, which is
	// the origin, and the cube the next piece would go in — with the pose the train
	// has there. The train itself is not drawn.
	// A press picks a piece or a pose; it never carries the train on.
	import { Tabs } from "bits-ui";
	import TrackViewer from "./TrackViewer.svelte";
	import ExpandingCard from "./ExpandingCard.svelte";
	import OrientationStepper from "./OrientationStepper.svelte";
	import {
		PIECES,
		describePose,
		poseLabel,
		readerFrame,
		trackCell
	} from "$lib/catalogue.js";
	import { pieceMove } from "$lib/scenes.js";
	import { attachControls } from "$lib/render/controls.js";

	let {
		initial = "DF",
		initialPiece = "straight",
		aspect = "3 / 2"
	} = $props();

	// The camera is framed on what is drawn, backed off from `pieceMove`'s tight
	// frame by `ROOM` so there is a band above and below the drawing for the callouts.
	const ROOM = 0.6;

	let pose = $state(initial);
	let active = $state(initialPiece);
	let expanded = $state(false);
	let handled = $state(false);

	const piece = $derived(PIECES.find((p) => p.type === active));
	// Laid from the start, so the piece's cube is the origin whatever the pose.
	const scene = $derived(pieceMove(active, { pose }));
	const camera = $derived({ ...scene.camera, zoom: scene.camera.zoom * ROOM });
	const readout = (head) => [
		[{ text: `Position: (${readerFrame(trackCell(head)).join(", ")})` }],
		[{ text: `Orientation: (${poseLabel(head.pose)})` }]
	];
	const notes = $derived(
		[
			["before", { cell: scene.pieces[0].cell, pose }],
			["after", scene.after]
		].map(([key, head]) => ({
			key,
			cell: trackCell(head),
			lines: readout(head)
		}))
	);
</script>

<Tabs.Root bind:value={active} class="pose-step">
	<ExpandingCard footer={keys} label="The {piece.name.toLowerCase()} entered {describePose(pose)}, full screen" bind:expanded bind:handled>
		{#snippet children(toggle, hand)}
			<Tabs.Content value={active} class="panel">
				<TrackViewer
					pieces={scene.pieces}
					{camera}
					grid={scene.grid}
					outlines={scene.outlines}
					{notes}
					controls={handled ? attachControls : null}
					tools={toggle}
					cornerTools={hand}
					aspect={expanded ? "auto" : aspect}
					blueprint
					label="The {piece.name.toLowerCase()} entered {describePose(
						pose
					)}, leaving the train {describePose(scene.after.pose)}"
				/>
			</Tabs.Content>
		{/snippet}
	</ExpandingCard>
</Tabs.Root>

{#snippet keys()}
	<OrientationStepper bind:pose />
	<Tabs.List class="keys" aria-label="Track pieces">
		{#each PIECES as { type, name, letter, hex } (type)}
			<Tabs.Trigger
				value={type}
				class="key"
				style="--piece: {hex}"
				aria-label={name}
				title={name}
			>
				{letter}
			</Tabs.Trigger>
		{/each}
	</Tabs.List>
{/snippet}

<style>
	:global(.pose-step) {
		margin: 0 0 1.25rem;
	}

	/* Full screen, the panel passes the pane's height on to the viewer. */
	:global(.pose-step .panel) {
		height: 100%;
	}

	/* The builder's keys: a square per piece in its colour, filled when selected.
     Always one row of their own: the squares shrink before the row wraps. */
	:global(.pose-step .keys) {
		display: flex;
		flex-basis: 100%;
		justify-content: center;
		gap: 0.5rem;
		min-width: 0;
	}

	:global(.pose-step .key) {
		display: grid;
		place-items: center;
		width: 44px;
		min-width: 0;
		flex-shrink: 1;
		aspect-ratio: 1;
		padding: 0;
		border: 2px solid var(--piece);
		border-radius: 0.5rem;
		background: transparent;
		color: var(--piece);
		font-family: ui-monospace, monospace;
		font-size: 1.25rem;
		font-weight: 700;
		cursor: pointer;
	}

	:global(.pose-step .key[data-state="active"]) {
		background: var(--piece);
		color: var(--page);
	}
</style>
