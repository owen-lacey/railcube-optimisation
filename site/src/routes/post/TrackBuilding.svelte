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
</Chapter>
