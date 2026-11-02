<script>
	// How the model makes a crossed layout, meet-in-the-middle: segments drawn at
	// random, paired into loops, and the loops into a track that spends the box.
	import Chapter from "./Chapter.svelte";
	import PieceTag from "$lib/components/PieceTag.svelte";
	import OrientationChip from "$lib/components/OrientationChip.svelte";
	import { joinedScene } from "$lib/scenes.js";
	import TrackFigure from "$lib/components/TrackFigure.svelte";
	import MeetLoop from "$lib/components/MeetLoop.svelte";
	import MeetSpend from "$lib/components/MeetSpend.svelte";
	import { data, FIRST } from "$lib/meet.svelte.js";
</script>

<Chapter id="generating">
	<h2>Generating layouts</h2>

	<p>We now know enough to describe how the model works:</p>
	<ol>
		<li>
			Pick a handful of pieces from the box at random and join them together,
			making note of the finishing pose. We put <PieceTag letter="X" /> in front of
			it because the next stage asserts the track makes its way back to it. In this
			example, the handful of pieces selected was
			<PieceTag letter="R" />
			<PieceTag letter="S" />
			<PieceTag letter="S" />
			<PieceTag letter="I" />
			<PieceTag letter="R" />
			<PieceTag letter="O" />:
			<TrackFigure shape={FIRST} scene={joinedScene} />
		</li>
		<li>
			Perform this random selection many times, and pair up segments that,
			rotated and joined, arrive back at the <PieceTag letter="X" /> for the first
			time in orientation
			<OrientationChip orientation={data.a.heading} />.
			<MeetLoop loop="a" />
		</li>
		<li>
			We then do this for the other half of the figure-of-eight by combining
			segments that add up to <OrientationChip orientation={data.b.heading} /> when
			exiting the <PieceTag letter="X" /> for the second time.
			<MeetLoop loop="b" />
		</li>
		<li>
			Finally, we need to check we're actually using the right number of
			real-life pieces, so pick the second half of the track such that we're
			using everything we have in the box.
			<MeetSpend />
		</li>
	</ol>
	<p>
		This approach is the definition of brute force. It only finds a valid train
		track for every ~500 segments it picks, so there's no way a rational human
		would take this approach themselves. Fortunately, my laptop doesn't have
		feelings and it happily chewed away at this, giving me the 27 million or so
		valid layouts I mentioned earlier.
	</p>
</Chapter>
