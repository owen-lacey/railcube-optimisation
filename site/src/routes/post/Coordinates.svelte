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
	import OrientationChip from "$lib/components/OrientationChip.svelte";
	import PoseCycle from "$lib/components/PoseCycle.svelte";
	import PoseStep from "$lib/components/PoseStep.svelte";
	import PoseBuilder from "$lib/components/PoseBuilder.svelte";
	import TrainCoordinates from "$lib/components/TrainCoordinates.svelte";
</script>

<Chapter id="coordinates">
	<!-- Focused from script once the opening gives way to the chapters. -->
	<h2 tabindex="-1">Coordinates</h2>

	<p>The Rail Cube box comes with these pieces:</p>

	<PieceCardGrid full={true} />
	<p>
		Each piece affects where the next piece will continue from. For example, <PieceTag
			letter="S"
		/> moves the track one place forwards, and <PieceTag letter="L" /> moves it one
		place forwards and two left, whilst turning left.
	</p>
	<PieceMoves />
	<p>
		These are relative movements, and our building blocks for how we'll keep
		track of the train's position.
	</p>
	<p>
		Imagine our track was in a box divided into cells the size of a single <PieceTag
			letter="S"
		/> cube. After the train has travelled a track piece, it sits in a single cell,
		on one of its faces.
	</p>

	<TrainCoordinates shape="SSSSLLIOOILL" readout="position" />
	<p>
		The position of the train is given by how many cubes away it is from the
		starting <Highlight colour="grid-color">highlighted cube</Highlight>,
		expressed in x, y and z. It's directional, so negative numbers mean the
		opposite direction to the arrows.
	</p>

	<p>
		Within the cell, the train can face in four different directions on any of
		the six faces. We call this the train's "orientation", which we write as (f
		d), where f is the face of the cube the train lies on, and d is the direction
		it's facing in, reusing our x y z coordinates, for example <OrientationChip
			orientation="DF"
		/>:
	</p>

	<PoseCycle />

	<p>
		Combining a train's position and an orientation gives us the "pose" the
		following piece needs to take. Below is the effect each track piece has on
		the train's pose for each possible orientation.
	</p>
	<PoseStep />

	<p>
		Let's include the orientation with the position using the same track as
		earlier, giving us its pose.
	</p>
	<TrainCoordinates shape="SSSSLLIOOILL" readout="position-pose" />

	<p>
		If we can add a single track piece to a pose to obtain a new pose, we can do
		it with groups of track pieces. Try adding and changing the track pieces to
		see the effect on the final pose, as well as what effect changing the
		initial orientation has.
	</p>

	<PoseBuilder />
</Chapter>
