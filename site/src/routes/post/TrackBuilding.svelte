<script>
	// The rules a track must keep. Three broken tracks, told over one viewer, and
	// then the rules they break, which push the viewer away.
	//
	// The prose is a straight transcription of notes.md — the wording is Owen's
	// first draft and is not to be edited here.
	import Chapter from "./Chapter.svelte";
	import PieceTag from "$lib/components/PieceTag.svelte";
	import ScrollySection from "$lib/components/ScrollySection.svelte";
	import TrackFigure from "$lib/components/TrackFigure.svelte";

	const steps = [
		{ body: incomplete, figure: TrackFigure, props: { shape: "SLLSSLL" } },
		{ body: fatalities, figure: TrackFigure, props: { shape: "SSLLLSS" } },
		{ body: andThis, figure: TrackFigure, props: { shape: "SSISLILISS" } }
	];
</script>

{#snippet incomplete()}
	<p>
		Now that we can now express a Rail Cube in terms of generic positions and
		poses, we need to add some rules. Firstly, we need a complete track, so this
		would be invalid:
	</p>
{/snippet}

{#snippet fatalities()}
	<p>A track like this would also cause some fatalities:</p>
{/snippet}

{#snippet andThis()}
	<p>And this:</p>
{/snippet}

<Chapter id="track-building">
	<ScrollySection {steps} />

	<p>
		Albeit intuitive, we need to express these rules in our coordinate system:
	</p>
	<ul>
		<li>
			<!-- TODO: show tracks again, annotated by this. -->
			<b>Completeness:</b>The final track piece should end at (x,y-1,z), facing
			DF.
		</li>
		<li>
			<b>Track collisions:</b>
			No two track pieces can share share the same (x,y,z) position.
		</li>
		<li>
			<b>Train collisions:</b> No track piece can occupy the same position as the
			train would.
		</li>
	</ul>
	<p>
		The latter is the hardest to generalise because it depends on the face of
		the pose: if a track piece is on the D face then we must protect (x,y,z+1),
		if it's on the U face then avoid (x,y,z-1), and so on. I said at the start
		that leaving pieces in the box is also a deal-breaker, but that's just my
		undiagnosed OCD / privileged upbringing.
	</p>

	<p>
		For <PieceTag letter="X" />, we do something clever, if I say so myself. We
		essentially treat them as two <PieceTag letter="S" />' and tell the model
		they must share the same cell at a 90 degree angle. These are logically
		equivalent, but worth mentioning as it violates our track collisions rule
		for this special piece.
	</p>

	<!-- TODO: needs viz, or separate section? -->

	<p>
		All of this so far has been very boring and diligent, but necessary. I
		forgive you for wondering when we're gonna make all those sick layouts we
		saw at the start. We now have everything we need to build a valid Rail Cube
		track that avoids most lawsuits, and can start optimising for aforementioned
		awesomeness.
	</p>
</Chapter>
