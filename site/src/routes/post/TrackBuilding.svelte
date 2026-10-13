<script>
	// The rules a track must keep. Three broken tracks, and then the rules they
	// break.
	//
	// The prose is a straight transcription of notes.md — the wording is Owen's
	// first draft and is not to be edited here.
	import Chapter from "./Chapter.svelte";
	import PieceTag from "$lib/components/PieceTag.svelte";
	import TrackFigure from "$lib/components/TrackFigure.svelte";
	import TrackSum from "$lib/components/TrackSum.svelte";
</script>

<Chapter id="track-building">
	<p>
		Now that we can now express a Rail Cube in terms of generic poses, we need
		to add some rules. Firstly, we need a complete track, so this would be
		invalid.
	</p>
	<TrackFigure shape="SLLSSLL" />

	<p>A track like this would also cause some fatalities.</p>
	<TrackFigure shape="SSLLLSS" />

	<p>And this.</p>
	<TrackFigure shape="SSISLILISS" />

	<p>
		Albeit intuitive, we need to express these rules in our coordinate system so
		that our generator creates valid tracks:
	</p>
	<ul>
		<li>
			<b>Completeness:</b> The final track piece should enter (0,0,0), facing (−z
			+y).
		</li>
		<li>
			<b>Track collisions:</b>
			No two track pieces can share share the same (x,y,z) cell.
		</li>
		<li>
			<b>Train collisions:</b> No track piece can occupy the same cell as the train
			would.
		</li>
	</ul>
	<p>
		The latter is the hardest to generalise because it depends on the floor of
		the orientation: if a track piece's floor is −z then we must protect
		(x,y,z+1), if it's +z then avoid (x,y,z−1), and so on. I said at the start
		that leaving pieces in the box is also a deal-breaker, but that's just
		because my parents raised me right.
	</p>

	<p>
		Building upon the Rail Cube maths<sup>TM</sup> from earlier, we do some harder
		maths by adding groups of track pieces together.
	</p>
	<TrackSum a="SS" b="SLR" />

	<p>
		This gets a bit more complicated when the first group changes the
		orientation.
	</p>
	<TrackSum a="SL" b="SLR" />

	<p>
		The act of making a complete track can be thought of as adding two groups of
		track pieces together such that it finishes where it started, so long as
		they don't violate any of our collision rules.
	</p>
	<TrackSum a="SIOSLL" b="SOISLL" />

	<p>
		For this to apply to our situation appropriately, we need to handle the <PieceTag
			letter="X"
		/> piece appropriately: that is, the train needs to return to (0,0,0) but from
		the (-z +x) orientation so it can cross over.
	</p>
	<TrackSum a="XSR" b="RRS" />

	<p>
		If we can generate a track that returns to the crossroads from the right
		angle, we can also use that track for the other half of the journey.
	</p>
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
