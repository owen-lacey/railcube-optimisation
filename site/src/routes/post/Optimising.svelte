<script>
	// What makes a layout good, and how a model is told so. A good set and a bad
	// set, and then the question of which is preferred.
	//
	// The prose is a straight transcription of notes.md — the wording is Owen's
	// first draft and is not to be edited here.
	import Chapter from "./Chapter.svelte";
	import PoseTracker from "$lib/components/PoseTracker.svelte";
	import RankedTracks from "$lib/components/RankedTracks.svelte";
	import ScoredRanking from "$lib/components/ScoredRanking.svelte";
	import ScoredTrack from "$lib/components/ScoredTrack.svelte";
	import TrackBuilder from "$lib/components/TrackBuilder.svelte";
	import TrackFigure from "$lib/components/TrackFigure.svelte";
	import { knotScene, lengthsScene, repeatsScene } from "$lib/scenes.js";
	import { SWEEP_CROSSED_RANKED } from "$lib/sweeps.js";
	import PieceTag from "$lib/components/PieceTag.svelte";
</script>

<Chapter id="optimising">
	<p>Enter subjectivity. Consider this set of layouts.</p>
	<RankedTracks end="best" />

	<p>Now these.</p>
	<RankedTracks end="worst" />

	<p>
		What do you prefer, the first set or the second? The first set, right? If
		you prefer the latter, I can't help you. From here on I'll assume you're a
		rationale person and prefer the former like me. Good? Good.
	</p>

	<p>
		Now, why do I love this one? I like that it's so compact; it's surely more
		difficult to fit these complete tracks in a smaller box. Jamming it in a
		smaller box also has a knock on effect where it's more likely for a train to
		have a close call by riding next to another piece of track and narrowly
		missing it.
	</p>
	<TrackFigure
		shape={SWEEP_CROSSED_RANKED.best[0].shape}
		scene={lengthsScene}
	/>
	<p>
		It would also be underwhelming if the train stayed largely face up. One of
		the selling points of the Rail Cube is that it can ride on walls and go
		upside down, we must please the creators and cover as many of the 24
		orientations as we can. You can only change orientation with curved pieces
		i.e <PieceTag letter="L" />, <PieceTag letter="R" />, <PieceTag
			letter="I"
		/>, or <PieceTag letter="O" />. Since our inventory only contains 20 of
		those pieces making 20 the maximum achievable orientation count. The below
		track does just that, omitting the entire +z face.
	</p>
	<PoseTracker shape="IRSISSRIIROXSSLSSOORISLISSILSSSOLXSI" />
	<p>
		Excessive repeats should also be avoided. They're a symptom of poor
		craftsmanship, bailing the engineer out of suboptimal design decisions.
		Two-in-a-row is OK for me because hairpin turns are cool.
	</p>
	<TrackFigure
		shape="LIIOILIOLOIIOIIXSSSSSSSRRSSSSSSRSXRL"
		scene={repeatsScene}
	/>
	<p>
		Saving my favourite for last: knots. How freaking cool is it when you're on
		a roller coaster and it goes inside one of its inversions, like <a
			href="https://www.altontowers.com/explore/theme-park/rides-attractions/the-smiler/"
			target="_blank">The Smiler</a
		> at Alton Towers. A layout that ties itself in knots gets bonus points in my
		book.
	</p>
	<TrackFigure
		shape="ILIOIXIRSISSRISSSOSRRSOXSLLISSLSSOSI"
		scene={knotScene}
	/>

	<p>
		All of the good layouts perform well on these five metics I mentioned:
		compactness, close calls, orientation count, repeats and knots.
	</p>
	<ScoredTrack end="best" />

	<p>
		On the other hand, we can put something objective against why the bad tracks
		offend us so:
	</p>

	<ScoredTrack end="worst" />

	<p>
		There might be some additional things you care about, perhaps time spent
		upside down is pleasing to you. The real magic happens when you combine
		different objectives into something combined you can optimise for. These
		metrics on their own are largely unimpressive.
	</p>

	<!-- TODO: cycle through single objectives: here is time spent upside down -->
	<TrackFigure shape="IILLSLOISSXOISRSIORSSRSSSSXSSIOSIILR" />

	<p>
		Our ability to express these opinions in a way the model can understand
		allows us to maximise what's important to us. The model can then give us its
		"best" track, rather than a working one.
	</p>

	<ul>
		<li>
			<b>Compactness:</b> The length of the largest side of the box the track can
			fit into. Smaller is better.
		</li>
		<li>
			<b>Close calls:</b> The number of times the train is adjacent to a different
			track piece. More is better.
		</li>
		<li>
			<b>Orientation count:</b> The number of distinct orientations the train assumes
			along the track. More is better.
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

	<ScoredRanking />

	<p>
		By making the weighting of each metric dynamic, you can change the formula
		yourself and see how that affects what layouts score the best. It might be
		you prefer a different recipe to me.
	</p>

	<!-- TODO: Weighted tracks -->
	<TrackFigure shape="IILLSLOISSXOISRSIORSSRSSSSXSSIOSIILR" />

	<p>
		Can you do better? Try build one yourself and see if you can beat my score
		of X.
	</p>
	<!-- TODO: keeps track of orientations. -->
	<TrackBuilder />

	<p></p>
</Chapter>
