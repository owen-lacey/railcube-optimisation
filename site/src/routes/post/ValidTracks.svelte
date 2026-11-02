<script>
	// The rules a track must keep. Three broken tracks, and then the rules they
	// break.
	import Chapter from "./Chapter.svelte";
	import OrientationChip from "$lib/components/OrientationChip.svelte";
	import PositionChip from "$lib/components/PositionChip.svelte";
	import TrackFigure from "$lib/components/TrackFigure.svelte";
</script>

<Chapter id="valid-tracks">
	<h2>Valid tracks</h2>

	<p>
		"Valid, you say?" Yes. I'm afraid the above approach doesn't protect you
		against any potential lawsuits when the two halves of your figure-of-eight
		smash into each other, so let's talk about what makes a track valid.
	</p>

	<p>
		We just showed how our model already ensures we create a complete track, but
		we also need to protect against casualties like this:
	</p>
	<TrackFigure shape="SSLLLSS" />

	<p>And this:</p>
	<TrackFigure shape="SSISLILISS" />

	<p>
		Albeit intuitive, these rules need expressing in our coordinate system so
		that our generator creates valid tracks:
	</p>
	<ol>
		<li>
			<b>Completeness:</b> The final track piece should enter <PositionChip at={[0, 0, 0]} />, facing <OrientationChip
				orientation="DF"
			/>.
		</li>
		<li>
			<b>Track collisions:</b>
			No two track pieces can share the same <PositionChip relative={[0, 0, 0]} /> cell.
		</li>
		<li>
			<b>Train collisions:</b> No track piece can occupy the same cell as the train
			would.
		</li>
	</ol>
	<p>
		The last is the hardest to generalise because it depends on the floor of the
		orientation: if a track piece's floor is −z then we must protect <PositionChip relative={[0, 0, 1]} />,
		if it's +z then avoid <PositionChip relative={[0, 0, -1]} />, and so on. I said at the start that leaving
		pieces in the box is also a deal-breaker, but that's just because my parents
		raised me right.
	</p>
	<p>
		Each time the model generates a complete track, it checks for track and
		train collisions, keeping a record of only the ones that don't cause
		fatalities.
	</p>
	<p>
		All of this so far has been very boring and diligent, but necessary. I
		forgive you for wondering when we're gonna make all those sick layouts we
		saw at the start. We now have everything we need to build a valid Rail Cube
		track that avoids most lawsuits, and can start optimising for the
		aforementioned awesomeness.
	</p>
</Chapter>
