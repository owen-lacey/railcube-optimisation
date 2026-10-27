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
	import { cellScene } from "$lib/scenes.js";
	import TrackSum from "$lib/components/TrackSum.svelte";
	import TrackRotate from "$lib/components/TrackRotate.svelte";
	import TrackJoin from "$lib/components/TrackJoin.svelte";
</script>

<Chapter id="coordinates">
	<h2>Coordinates</h2>

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
		track of the train's cell in the track.
	</p>
	<p>
		Imagine our track was in a box divided into cells the size of a single <PieceTag
			letter="S"
		/> cube. After the train has travelled a track piece, it's resides upon a single
		cell.
	</p>

	<TrainCoordinates shape="SSSSLLIOOILL" readout="position" />
	<p>
		The position of the train is given by how many cubes away it is from the
		starting <Highlight colour="grid-color">highlighted cube</Highlight>,
		expressed in x, y and z. It's directional, so negative numbers means it's
		going in the other direction that the arrows show.
	</p>

	<p>
		Within the cell, the train can face in four different directions on any of
		the six faces. We call this the train's "orientation" and is expressed as (f
		d) where f is the face of the cube the train lies on, and d is the direction
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

	<p>
		Now we can do some Rail Cube maths<sup>TM</sup>: given one group of track
		pieces, we can add another group of track pieces to it to get a new pose.
		The first step is to rotate the second group so it matches the orientation
		of the pose the first group finishes at.
	</p>
	<TrackRotate a="IROSIRR" b="SIL" />
	<p>
		Here, the final position of each group is given relative to the origin cube.
		Now that the second group continues with the same orientation that the first
		finishes on, we can add up their positions to get the combined pose. To be
		explicit, adding a track that finishes at (2, -3, -2) to a track finishing
		at (-3, 4, 0) gives a combined track that finishes at (-1, 1, -2) so long as
		they share the same orientation at the join.
	</p>
	<TrackJoin a="IROSIRR" b="SIL" />

	<p>
		The act of making a complete track can be thought of as adding two groups of
		track pieces together such that it finishes where it started. Specifically,
		we have a complete track if the groups add up to (0, 0, 0), facing <OrientationChip
			orientation="DF"
		/>.
		First we rotate, then join.
	</p>
	<TrackSum a="SILISL" b="IL" />

	<p>
		For this to apply to our situation appropriately, we need to handle the <PieceTag
			letter="X"
		/> piece appropriately: that is, the train needs to return to (0, 0, 0) but from
		the <OrientationChip orientation="DL" /> orientation so it can cross over.
	</p>
	<TrackSum a="XSR" b="RRS" />

	<p>
		Similarly, the train then needs to travel the other half of the
		figure-of-eight to return in our required <OrientationChip orientation="DF" /> orientation to give us a
		complete track.
	</p>
	<TrackSum a="XSRRRSXSL" b="LLS" />

	<p>The model I made to generate these layouts does exactly this:</p>
	<ol>
		<li>Pick a handful of pieces from the box at random.</li>
		<li>
			Join them together to make a track segment, making note of their finishing
			pose.
		</li>
		<li>
			Do this many times, and pair up segments that would finish when it meets
			the <PieceTag letter="X" /> for the first time at orientation <OrientationChip
				orientation="DL"
			/>.
		</li>
		<li>
			Similarly, do this again with segments that add up to <OrientationChip
				orientation="DR"
			/>, giving the
			other half of the figure-of-eight.
		</li>
		<li>
			We then have a bunch of halves. Pair these up based on the inventory they
			use. When combined, they must use every piece in the box.
		</li>
	</ol>
	<p>
		This approach is fairly brute force and exhaustive. It only generates a
		valid train track every ~50,000 attempts. Fortunately, my laptop doesn't
		have feelings and it happily chewed away at this, making me over 20 million
		valid layouts.
	</p>
</Chapter>
