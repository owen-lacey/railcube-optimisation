<script>
	// Adding groups of pieces together: rotate, then join, and a complete track as
	// two groups that add up to where they started, crosses included.
	import Chapter from "./Chapter.svelte";
	import PieceTag from "$lib/components/PieceTag.svelte";
	import OrientationChip from "$lib/components/OrientationChip.svelte";
	import TrackSum from "$lib/components/TrackSum.svelte";
	import TrackRotate from "$lib/components/TrackRotate.svelte";
	import TrackJoin from "$lib/components/TrackJoin.svelte";
</script>

<Chapter id="track-maths">
	<h2>Rail Cube maths</h2>

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
		/>. First we rotate, then join.
	</p>
	<TrackSum a="SILISL" b="IL" />

	<p>
		For this to apply to our situation, we need to handle the <PieceTag
			letter="X"
		/> piece appropriately: that is, the train needs to return to (0, 0, 0) but from
		the <OrientationChip orientation="DL" /> orientation so it can cross over.
	</p>
	<TrackSum a="XSR" b="RRS" />

	<p>
		Similarly, the train then needs to travel the other half of the
		figure-of-eight to return in our required <OrientationChip
			orientation="DF"
		/> orientation to give us a complete track.
	</p>
	<TrackSum a="XSRRRSXSL" b="LLS" />
</Chapter>
