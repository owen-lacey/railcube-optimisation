<script>
	import KnownTracks from "$lib/components/KnownTracks.svelte";
	import LayoutViewer from "$lib/components/LayoutViewer.svelte";
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

<LayoutViewer shape="SIOLLOISLL" interactive={true} />

<p>
	It uses two straights, two inner loops, two outer, and four right turns. It
	leaves 25 Rail Cube pieces in the box, unused. Unacceptable.
</p>

<p>Consider this instead:</p>

<LayoutViewer
	shape="XSSLISISSOIILSRISSXSISSOSOIRRSROILSL"
	interactive={true}
/>

<p>Or this:</p>

<LayoutViewer
	shape="ILSSXOSSSSSIISLRSISOORSOIRRSXIILSLSI"
	interactive={true}
/>

<p>
	In fact, I've got a bunch of these ready to use anytime my three year old
	decrees that the existing structure is tiresome.
</p>

<KnownTracks drive={false} />

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
<PieceMoves />
<p>
	Imagine our track was in a box divided into cubes the size of a single <PieceTag
		letter="S"
	/>. After the train has travelled a track piece, it is in exactly one box.
</p>

<LayoutViewer
	shape="SSSSLLIOOILL"
	grid={true}
	trainCaption={true}
	origin={true}
	scrub={true}
/>
<p>
	The coordinates of the train are given by how many cubes along it is from the
	starting highlighted cube, expressed in x, y and z. It's directional, so
	negative numbers means it going in the other direction that the arrows show.
</p>

<p>
	Within the cube, the train can face in four different directions on any of the
	six faces - we call these "poses":
</p>

<PoseCycle />

<hr />

<h2>Defining the model</h2>

<p>Here's the plan of attack:</p>
<ol>
	<li>Create a coordinate system the track can exist on</li>
	<li>Define each track piece in that coordinate system</li>
	<li>Model how we add pieces together</li>
</ol>
<p>Once we have these, we can build our model</p>

<h3>1. The coordinate system</h3>
<p>
	As much as I would like it to go without saying, these tracks occupy 3D space.
	This means you can go up, down, left, right, forwards, or backwards. We call
	this type of movement <i>orthogonal</i>.
</p>

<Placeholder />

<p>
	After it has travelled each track piece, the train is in exactly one of these
	boxes. The train can then move to any box orthogonal to it depending on where
	the track is heading.
</p>
<Placeholder />

<p>
	A straight track represents a move forwards relative to its current position,
	a left turn is 1 step forward and two steps left, etc
</p>

<Placeholder />

<p>
	Similarly, the train could change orientation, it travel alongside a wall, or
	down vertically. It can assume any position on the 6-faced cube, facing in any
	of the 4 directions. That makes 24 possible directions for every box.
</p>

<Placeholder />

<p>
	Let's combine this with our positions to show how we represent adding a piece
	to the track
</p>

<Placeholder />

<p>
	Once we have our initial position, the position of the train after any track
	piece simply becomes the combination of all of the track pieces before it.
</p>

<p>
	Therefore, to enforce a closed loop, we need to tell the programme that the
	position of the last track piece equals the starting piece.
</p>

<Placeholder caption="Here's the animation" />

<h2>adding costs</h2>

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
