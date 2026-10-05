<script>
	import Highlight from "$lib/components/Highlight.svelte";
	import KnownTracks from "$lib/components/KnownTracks.svelte";
	import TrackFigure from "$lib/components/TrackFigure.svelte";
	import TrainCoordinates from "$lib/components/TrainCoordinates.svelte";
	import { cellScene } from "$lib/scenes.js";
	import PieceCardGrid from "$lib/components/PieceCardGrid.svelte";
	import PieceMoves from "$lib/components/PieceMoves.svelte";
	import PieceTag from "$lib/components/PieceTag.svelte";
	import PoseCycle from "$lib/components/PoseCycle.svelte";
	// The prose is a straight transcription of notes.md — the wording is Owen's
	// first draft and is not to be edited here. Every visualisation the draft
	// calls for is an empty Placeholder until it is built.
	import Placeholder from "$lib/components/Placeholder.svelte";
	import Layout from "../+layout.svelte";
	import PoseStep from "$lib/components/PoseStep.svelte";
</script>

<h1>Optimising the Rail Cube</h1>

<p>This is a Rail Cube track. It's as if model trains and LEGO had a baby:</p>

<TrackFigure shape="SIOLLOISLL" />

<p>
	It uses two straights, two inner loops, two outer, and four right turns. It
	leaves 25 Rail Cube pieces in the box, unused. Unacceptable.
</p>

<p>Consider this instead:</p>

<TrackFigure shape="XSSLISISSOIILSRISSXSISSOSOIRRSROILSL" />

<p>Or this:</p>

<TrackFigure shape="ILSSXOSSSSSIISLRSISOORSOIRRSXIILSLSI" />

<p>
	In fact, I've got a bunch of these ready to use anytime my three year old
	decrees that the existing structure is tiresome.
</p>

<KnownTracks train={null} />

<p>
	Hopefully the sheer number of tracks convinces you I couldn't have possibly
	figured all of these out by myself. I'm going to show you how I made something
	to generate these, and how we can optimise for different things.
</p>

<h2>Coordinates</h2>

<p>The Rail Cube box comes with these pieces:</p>

<PieceCardGrid full={true} />
<p>
	Each piece changes where the train is, and most of the time the way it faces.
	For example, <PieceTag letter="S" /> moves the train one place forwards, and
	<PieceTag letter="L" /> moves it one place forwards and two left, whilst turning
	left.
</p>
<PieceMoves />
<p>
	These are relative positions, and our building blocks for how we'll keep track
	of the train's position in the track.
</p>
<p>
	Imagine our track was in a box divided into cubes the size of a single <PieceTag
		letter="S"
	/>. After the train has travelled a track piece, it enters into a single new
	cube.
</p>

<TrainCoordinates shape="SSSSLLIOOILL" readout="position" />
<p>
	The coordinates of the train are given by how many cubes along it is from the
	starting <Highlight colour="grid-color">highlighted cube</Highlight>,
	expressed in x, y and z. It's directional, so negative numbers means it going
	in the other direction that the arrows show.
</p>

<p>
	Within the cube, the train can face in four different directions on any of the
	six faces - we call these "poses":
</p>

<PoseCycle />

<p>
	We can now represent the position & pose of the train piece at any given time.
	A complete track is one that returns to the origin cube facing DF. Putting
	positions and poses together, here is a track in which the train travels along
	every face of the cube:
</p>

<TrainCoordinates
	shape="SIOOLSOOLISLIISL"
	readout="position-pose"
	scene={cellScene}
/>

<p>
	To make our own tracks, we need to know the effect of adding each track piece
	to any position or pose.
</p>

<p>
	To do this, we create a map from every pose to its new pose, plus a position
	delta.
</p>
<PoseStep />

<h2>Track building</h2>

<p>
	Now that we can now express a Rail Cube in terms of generic positions and
	poses, we need to add some rules. Firstly, we need a complete track, so this
	would be invalid:
</p>

<TrackFigure shape="SLLSSLL" />

<p>A track like this would also cause some fatalities:</p>
<TrackFigure shape="SSLLLSS" />

<p>And this:</p>
<TrackFigure shape="SSISLILISS" />

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
		<b>Train collisions:</b> No track piece can occupy the same position as the train
		would.
	</li>
</ul>
<p>
	The latter is the hardest to generalise because it depends on the face of the
	pose: if a track piece is on the D face then we must protect (x,y,z+1), if
	it's on the U face then avoid (x,y,z-1), and so on. I said at the start that
	leaving pieces in the box is also a deal-breaker, but that's just my
	undiagnosed OCD / privileged upbringing.
</p>
<p>
	All of this so far has been very boring and diligent, but necessary. I forgive
	you for wondering when we're gonna make all those sick layouts we saw at the
	start. We now have everything we need to build a valid Rail Cube track that
	avoids most lawsuits, and can start optimising for aforementioned awesomeness.
</p>

<h2>Optimising</h2>

<p></p>

<p>Enter subjectivity. Look at this beauty:</p>

<TrackFigure shape="LSISSXLOSIISSISSLSOROOIRSIRRSXSISLSI" />

<p>On the other hand, this upsets me:</p>

<TrackFigure shape="IORRIIOISIOIILROISRSSSSXSSSSLLSSSLSX" />
<p>
	Why? It sprawls about. Loads of boring straight segments, doesn't invert
	nearly as much as it can.
</p>

<p>
	In the previous section we spoke about what invalidates a track. These
	opinions are different: the track is feasible, it's just we don't like it.
</p>
<p>
	Our ability to express these opinions in a way the model can understand allows
	us to maximise what's important to us. The model can then give us the "best"
	track, rather than a working one.
</p>

<p></p>

<hr />

<ul>
	<li>
		How we score a track. Go back to the solves from previously with a score
		explainer.
	</li>
	<li>
		Prove that it's infeasible to enumerate all solutions, which is where CP
		comes in
	</li>
	<li>
		Interactive track builder, with stats on how good the track you built is.
	</li>
	<li>Cross cube</li>
</ul>

<style>
	h1 {
		font-size: 2.25rem;
		line-height: 1.15;
		letter-spacing: -0.02em;
		margin: 0 0 2.5rem;
	}

	h2 {
		font-size: 1.4rem;
		line-height: 1.2;
		margin: 3.5rem 0 1.25rem;
	}

	p {
		font-size: 1.0625rem;
		line-height: 1.65;
		margin: 0 0 1.25rem;
	}

	ul {
		font-size: 1.0625rem;
		line-height: 1.65;
		margin: 0 0 1.25rem;
		padding-left: 1.25rem;
	}

	li {
		margin-bottom: 0.375rem;
	}
</style>
