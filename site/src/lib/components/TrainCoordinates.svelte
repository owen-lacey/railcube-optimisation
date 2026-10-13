<script>
	// Where the train is, as the post's coordinates: a layout in its cell lattice,
	// outlined as `PieceMoves` outlines one piece — the start cube where it begins,
	// and the cube of the piece the train is on where it has got to, with a callout
	// there — and a slider for which piece it is on. A figure — see `$lib/figure.js`.
	import Frame from "./Frame.svelte";
	import TrainScrubber from "./TrainScrubber.svelte";
	import { axesScene } from "$lib/scenes.js";
	import { cubeReadout } from "$lib/catalogue.js";

	let {
		shape,
		// What the callout reads out: 'position', the cube of the piece the train is
		// on, `(x, y, z)` from the start cube; or 'position-pose', that and the pose
		// it entered the piece in.
		readout = "position",
		// Letters → scene: `axesScene` draws the origin's axes beside the lattice,
		// `cellScene` the lattice alone. Both in scenes.js.
		scene: drawing = axesScene,
		aspect = undefined
	} = $props();

	// Which piece the train is on, in route order, and whether the slider has it. The
	// slider starts with it, so the train waits at the start until played.
	let at = $state(0);
	let held = $state(true);
	// The cube of the piece the train is on, the model's `[right, up, forwards]`
	// from the start cube (docs/coordinates.md), and the pose it entered that piece
	// in, `'DF'` say; each null while there is no train.
	let cube = $state(null);
	let pose = $state(null);

	// The start cube is outlined as a step's start, in place of the origin's own
	// outline; the stage outlines the train's piece as its end, and the callout
	// follows it there.
	const scene = $derived((letters) => {
		const drawn = drawing(letters);
		return {
			...drawn,
			origin: drawn.origin && { ...drawn.origin, cell: false },
			outlines: [{ cell: [0, 0, 0], tint: "before" }],
			notes: cube
				? [{ key: "train", cell: cube, lines: cubeReadout(cube, readout === "position-pose" ? pose : null) }]
				: []
		};
	});

	const train = {
		at: () => (held ? at : null),
		onAt: (i) => {
			if (!held) at = i;
		},
		onPiece: (c) => (cube = c),
		onPose: (p) => (pose = p)
	};
</script>

<Frame view={{ shape, scene, train }} {aspect}>
	{#snippet footer(drawn)}
		{#if drawn}
			<TrainScrubber pieces={drawn.pieces} bind:at bind:held />
		{/if}
	{/snippet}
</Frame>
