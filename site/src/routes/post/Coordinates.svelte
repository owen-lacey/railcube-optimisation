<script>
	// Where the train is, and which way it faces: positions and poses.
	//
	// The prose is a straight transcription of notes.md — the wording is Owen's
	// first draft and is not to be edited here.
	import Chapter from "./Chapter.svelte";
	import Highlight from "$lib/components/Highlight.svelte";
	import PieceCardGrid from "$lib/components/PieceCardGrid.svelte";
	import PieceMoves from "$lib/components/PieceMoves.svelte";
	import PieceTag from "$lib/components/PieceTag.svelte";
	import PoseCycle from "$lib/components/PoseCycle.svelte";
	import PoseStep from "$lib/components/PoseStep.svelte";
	import TrainCoordinates from "$lib/components/TrainCoordinates.svelte";
	import { cellScene } from "$lib/scenes.js";
</script>

<Chapter id="coordinates">
	<h2>Coordinates</h2>

	<p>The Rail Cube box comes with these pieces:</p>

	<PieceCardGrid full={true} />
	<p>
		Each piece changes where the train is, and most of the time the way it faces.
		For example, <PieceTag letter="S" /> moves the train one place forwards, and
		<PieceTag letter="L" /> moves it one place forwards and two left, whilst turning
		left.
	</p>
	<PieceMoves />
	<p>
		These are relative positions, and our building blocks for how we'll keep track
		of the train's position in the track.
	</p>
	<p>
		Imagine our track was in a box divided into cubes the size of a single <PieceTag
			letter="S"
		/>. After the train has travelled a track piece, it assumes position in a
		single cube.
	</p>

	<TrainCoordinates shape="SSSSLLIOOILL" readout="position" />
	<p>
		The coordinates of the train are given by how many cubes away it is from the
		starting <Highlight colour="grid-color">highlighted cube</Highlight>,
		expressed in x, y and z. It's directional, so negative numbers means it's
		going in the other direction that the arrows show.
	</p>

	<p>
		Within the cube, the train can face in four different directions on any of the
		six faces - we call these "poses":
	</p>

	<PoseCycle />

	<p>
		We can now represent the position & pose of the train piece at any given time.
		Putting positions and poses together, here is a track in which the train
		travels along every face of the cube:
	</p>

	<TrainCoordinates
		shape="SIOOLSOOLISLIISL"
		readout="position-pose"
		scene={cellScene}
	/>

	<p>
		To make our own tracks, we need to know the effect of adding each track piece
		to any position or pose.
	</p>

	<p>
		To do this, we create a map from every pose to its new pose, plus a position
		delta.
	</p>
	<PoseStep />
</Chapter>
