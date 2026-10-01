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
</script>

<h1>Optimal Rail Cube</h1>

<p>This is a Rail Cube track:</p>

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

<p>The Rail Cube box comes with these pieces:</p>

<PieceCardGrid full={true} />
<p>
	Each piece changes where the train is, and most of the time the way it faces.
	For example, <PieceTag letter="S" /> moves the train one place forwards, and
	<PieceTag letter="L" /> moves it one place forwards and two left, whilst turning
	left.
</p>
<p>
	These are relative positions, and our building blocks for how we'll keep track
	of the train's position in the track.
</p>
<!-- Editorial note: I think we should pivot the terminology to say "the cube after the train has travelled a track piece," as opposed to "at any given time." The intermediary points on the track could cause confusion, and really, we only care about the position that the train has ended up in after it's moved.  -->
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

<hr />

<h1>scratch</h1>
<h2>adding costs</h2>

<p>can't have this</p>

<TrackFigure shape="SSLLLSS" />

<p>or this</p>

<TrackFigure shape="SSISLILISS" />

<p>Two approaches here:</p>

<ul>
	<li>under no circumstances should we drop a piece</li>
	<li>try not to drop a piece</li>
</ul>

<p>
	Pick either based on what you want the output to be. One is a suggestion, one
	is a command.
</p>

<p>I opted for the former</p>

<p>Many ways we can optimise this:</p>

<ul>
	<li>score "cool" parts at cool inversions</li>
	<li>score % of time not flat</li>
	<li>penalise consecutive pieces of the same type</li>
</ul>

<Placeholder caption="Show examples of a track being build and their score" />

<Placeholder caption="Show final optimal route (maybe irl as well)" />

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
