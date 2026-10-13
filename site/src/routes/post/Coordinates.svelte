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
	import PoseBuilder from "$lib/components/PoseBuilder.svelte";
	import TrainCoordinates from "$lib/components/TrainCoordinates.svelte";
	import { cellScene } from "$lib/scenes.js";
	import TrackSum from "$lib/components/TrackSum.svelte";
</script>

<Chapter id="coordinates">
	<h2>Coordinates</h2>

	<p>The Rail Cube box comes with these pieces:</p>

	<PieceCardGrid full={true} />
	<p>
		Each piece affects where the next piece needs to continue from. For example, <PieceTag
			letter="S"
		/> moves the track one place forwards, and <PieceTag letter="L" /> moves it one
		place forwards and two left, whilst turning left.
	</p>
	<PieceMoves />
	<p>
		These are relative moves, and our building blocks for how we'll keep track
		of the train's cell in the track.
	</p>
	<p>
		Imagine our track was in a box divided into cells the size of a single <PieceTag
			letter="S"
		/> cube. After the train has travelled a track piece, it's resides upon a single
		cell.
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
		Combining a train's position and an orientation gives us its "pose". This is
		all the information we need to know to know where a train is at any given
		point along the track. Below is the effect each track piece has on the
		train's pose for each possible orientation.
	</p>
	<PoseStep />

	<p>
		Let's include the orientation with the position for the same track as
		earlier.
	</p>
	<TrainCoordinates shape="SSSSLLIOOILL" readout="position-pose" />

	<p>
		If we can add a single track piece to a pose to obtain a new pose, we can do
		it with groups of track pieces. Try adding and changing the track pieces to
		see the effect on the final pose. Changing the initial orientation also
		affects the final pose.
	</p>

	<PoseBuilder />

	<p>
		Now we can do some Rail Cube maths<sup>TM</sup>: given one group of track
		pieces, we can add another group of track pieces to it to get a new pose.
	</p>
	<TrackSum a="IROSIRR" b="SIL" />

	<p>
		The act of making a complete track can be thought of as adding two groups of
		track pieces together such that it finishes where it started. We have a
		complete track if the groups add up to (0,0,1), facing (-z +y).
	</p>
	<TrackSum a="SILISL" b="IL" />

	<p>
		For this to apply to our situation appropriately, we need to handle the <PieceTag
			letter="X"
		/> piece appropriately: that is, the train needs to return to (0,0,1) but from
		the (-z +x) orientation so it can cross over.
	</p>
	<TrackSum a="XSR" b="RRS" />

	<p>
		If we can generate a track that returns to the crossroads from (-z +x)
		angle, we can also generate a track
	</p>
	<TrackSum a="XSL" b="LLS" />

	<p>Combining:</p>
	<TrackSum a="XSLLLSX" b="SRRRS" />

	<p>
		The model picks a group of pieces out of the box at random and makes a track
		segment, making note of what this does to the train's pose. It does this
		many times, and then enters into a match-making process, pairing up segments
		such that the combined segment returns to the <PieceTag letter="X" /> correctly
		and doesn't kill any passengers.
	</p>
	<p>
		In this example, the randomly generated segment ends at (x,y,z) facing
		(a,b). We then search through our other segments that result in an
		orientation of (x,y,z) facing (a,b) so that, when combined, we arrive at the <PieceTag
			letter="X"
		/>.
	</p>
	<!-- EXAMPLE HERE -->
	<p>
		Repeating this process, we have a collection of track segments that return
		to <PieceTag letter="X" /> correctly. To make it a complete track, we match-make
		again. This time, we pair two of these closed segments such that their combined
		inventory is exactly what's in the Rail Cube box.
	</p>
	<!-- EXAMPLE HERE -->
	<p>
		This approach is fairly brute force and exhaustive. It only generates a
		valid train track every ~50,0000 attempts.
	</p>
	<p>
		All of this so far has been very boring and diligent, but necessary. I
		forgive you for wondering when we're gonna make all those sick layouts we
		saw at the start. We now have everything we need to build a valid Rail Cube
		track that avoids most lawsuits, and can start optimising for aforementioned
		awesomeness.
	</p>
</Chapter>
