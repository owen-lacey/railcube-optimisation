<script>
	// Where the train is, and which way it faces: cells, orientations and poses.
	//
	// The prose began as a transcription of notes.md; cell, orientation and pose
	// were then applied throughout, at Owen's request.
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
		Each piece changes where the train is, and most of the time the way it
		faces. For example, <PieceTag letter="S" /> moves the train one place forwards,
		and
		<PieceTag letter="L" /> moves it one place forwards and two left, whilst turning
		left.
	</p>
	<PieceMoves />
	<p>
		These are relative moves, and our building blocks for how we'll keep track
		of the train's cell in the track.
	</p>
	<p>
		Imagine our track was in a box divided into cubes the size of a single <PieceTag
			letter="S"
		/>. After the train has travelled a track piece, it enters a single cell.
	</p>

	<TrainCoordinates shape="SSSSLLIOOILL" readout="position" />
	<p>
		The coordinates of the train are given by how many cubes away it is from the
		starting <Highlight colour="grid-color">highlighted cube</Highlight>,
		expressed in x, y and z. It's directional, so negative numbers means it's
		going in the other direction that the arrows show.
	</p>

	<p>
		Within the cell, the train can face in four different directions on any of
		the six faces. We call this the train's "orientation" and is expressed as (f
		d) where f is the face of the cube the train lies on, and d is the direction
		it's facing in, reusing our x y z coordinates:
	</p>

	<PoseCycle />

	<p>
		Combining a train's position and an orientation gives us its pose. This is
		all the information we need to know to know where a train is at any given
		point along the track. Below is the effect each track piece has on the
		train's pose for each possible orientation.
	</p>
	<PoseStep />

	<p>
		Given a starting pose, we can now do some Rail Cube maths<sup>TM</sup> and add
		up any numbers of track pieces. We have a complete track if we return to (0,0,0),
		facing (-z +y).
	</p>
</Chapter>
