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
	import TrackBuilder from "$lib/components/TrackBuilder.svelte";
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
	/>. After the train has travelled a track piece, it assumes position in a
	single cube.
</p>

<TrainCoordinates shape="SSSSLLIOOILL" readout="position" />
<p>
	The coordinates of the train are given by how many cubes away it is from the
	starting <Highlight colour="grid-color">highlighted cube</Highlight>,
	expressed in x, y and z. It's directional, so negative numbers means it's
	going in the other direction that the arrows show.
</p>

<p>
	Within the cube, the train can face in four different directions on any of the
	six faces - we call these "poses":
</p>

<PoseCycle />

<p>
	We can now represent the position & pose of the train piece at any given time.
	Putting positions and poses together, here is a track in which the train
	travels along every face of the cube:
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
	For <PieceTag letter="X" />, we do something clever, if I say so myself. We
	essentially treat them as two <PieceTag letter="S" />' and tell the model they
	must share the same cell at a 90 degree angle. These are logically equivalent,
	but worth mentioning as it violates our track collisions rule for this special
	piece.
</p>

<!-- TODO: needs viz, or separate section? -->

<p>
	All of this so far has been very boring and diligent, but necessary. I forgive
	you for wondering when we're gonna make all those sick layouts we saw at the
	start. We now have everything we need to build a valid Rail Cube track that
	avoids most lawsuits, and can start optimising for aforementioned awesomeness.
</p>

<h2>Optimising</h2>

<p></p>

<p>Enter subjectivity. Consider this set of layouts:</p>

<!-- TODO cycle through good ones -->
<TrackFigure shape="SISSXOLSLSLSSOSOIRRSISROSIIRXSISILSI" />

<p>Now these:</p>

<!-- TODO cycle through bad ones -->
<TrackFigure shape="IRSSSSSIIRLLRXOISSSSIILRIOLOOSSSSXSI" />

<p>
	What do you prefer, the first set or the second? The first set, right? If you
	prefer the latter, I can't help you. From here on I'll assume you're a
	rationale person and prefer the former like me. Good? Good.
</p>

<!-- TODO: anim the box sizes with cube. -->
<p>
	Now, why do I love this one? I like that it's so compact; it's surely more
	difficult to fit these complete tracks in a smaller box. Jamming it in a
	smaller box also has a knock on effect where it's more likely for a train to
	have a close call by riding next to another piece of track and narrowly
	missing it.
</p>
<!-- TODO: anim the pose count. -->
<p>
	It would also be underwhelming if the train stayed largely face up. One of the
	selling points of the Rail Cube is that it can ride on walls and go upside
	down, we must please the creators and cover as many of the 24 poses as we can.
</p>
<!-- TODO: anim the repeated section. -->
<p>
	Excessive repeats should also be avoided. They're a symptom of poor
	craftsmanship, bailing the engineer out of suboptimal design decisions.
	Two-in-a-row is OK for me because hairpin turns are cool.
</p>
<p>
	Saving my favourite for last: knots. How freaking cool is it when you're on a
	roller coaster and it goes inside one of its inversions, like <a
		href="https://www.altontowers.com/explore/theme-park/rides-attractions/the-smiler/"
		target="_blank">The Smiler</a
	> at Alton Towers. A layout that ties itself in knots gets bonus points in my book.
</p>
<!-- TODO: Fix on this one. -->
<TrackFigure shape="SISSXOLSLSLSSOSOIRRSISROSIIRXSISILSI" />

<p>
	All of the good layouts perform well on these five metics I mentioned:
	compactness, close calls, pose count, repeats and knots.
</p>
<!-- TODO: Annotate track with metric count. -->
<TrackFigure shape="SISSXOLSLSLSSOSOIRRSISROSIIRXSISILSI" />

<p>
	On the other hand, we can put something objective against why the bad tracks
	offend us so:
</p>

<!-- TODO cycle through bad ones again with metric count  -->
<TrackFigure shape="IRSSSSSIIRLLRXOISSSSIILRIOLOOSSSSXSI" />

<p>
	There might be some additional things you care about, perhaps time spent
	upside down is pleasing to you. The real magic happens when you combine
	different objectives into something combined you can optimise for. These
	metrics on their own are largely unimpressive.
</p>

<!-- TODO: cycle through single objectives: here is time spent upside down -->
<TrackFigure shape="IILLSLOISSXOISRSIORSSRSSSSXSSIOSIILR" />

<p>
	Our ability to express these opinions in a way the model can understand allows
	us to maximise what's important to us. The model can then give us its "best"
	track, rather than a working one.
</p>

<ul>
	<li>
		<b>Compactness:</b> The length of the largest side of the box the track can fit
		into. Smaller is better.
	</li>
	<li>
		<b>Close calls:</b> The number of times the train is adjacent to a different track
		piece. More is better.
	</li>
	<li>
		<b>Pose count:</b> The number of distinct poses the train assumes along the track.
		More is better.
	</li>
	<li>
		<b>Repeats:</b> The number of times the train repeats a track piece more than
		twice. Fewer is better.
	</li>
	<li>
		<b>Knot:</b> Whether the layout ties itself in a knot (or knot - ha). This is
		a true or false measure. Just one knot is enough to excite me.
	</li>
</ul>

<p>
	We then put our finger firmly in the air and create a formula for scoring a
	layout, and pick the one with the best score:
</p>

<!-- TODO: combined score where user can pick their favourite. Show top 100 tracks and how their score is calculated. -->
<TrackFigure shape="IILLSLOISSXOISRSIORSSRSSSSXSSIOSIILR" />

<p>
	By making the weighting of each metric dynamic, you can change the formula
	yourself and see how that affects what layouts score the best. It might be you
	prefer a different recipe to me.
</p>

<!-- TODO: Weighted tracks -->
<TrackFigure shape="IILLSLOISSXOISRSIORSSRSSSSXSSIOSIILR" />

<p>
	Can you do better? Try build one yourself and see if you can beat my score of
	X.
</p>
<!-- TODO: keeps track of poses. -->
<TrackBuilder />

<p></p>

<hr />

<h2>Author notes</h2>
<p>
	I estimate that there are over <a
		href="https://bsky.app/profile/owenlacey.dev/post/3mwlhlqenlc2r"
		target="_blank">28 billion different ways</a
	> to build a valid Rail Cube track, using every piece. My program generated around
	10 million - about 0.04% of the total. As such, I'm fairly confident that there
	are layouts that score higher than the ones you've seen.
</p>

<ul>
	<li>
		Prove that it's infeasible to enumerate all solutions, which is where CP
		comes in
	</li>
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
