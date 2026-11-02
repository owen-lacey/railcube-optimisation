<script>
	// What makes a layout good, and how a model is told so. A good set and a bad
	// set, and then the question of which is preferred.
	import Chapter from "./Chapter.svelte";
	import Challenge from "$lib/components/Challenge.svelte";
	import PoseTracker from "$lib/components/PoseTracker.svelte";
	import RankedTracks from "$lib/components/RankedTracks.svelte";
	import ScoredRanking from "$lib/components/ScoredRanking.svelte";
	import ScoredTrack from "$lib/components/ScoredTrack.svelte";
	import SingleMetrics from "$lib/components/SingleMetrics.svelte";
	import TrackFigure from "$lib/components/TrackFigure.svelte";
	import WeightedTracks from "$lib/components/WeightedTracks.svelte";
	import { knotScene, lengthsScene, repeatsScene } from "$lib/scenes.js";
	import { SWEEP_CROSSED_RANKED } from "$lib/sweeps.js";
	import PieceTag from "$lib/components/PieceTag.svelte";

	// Called once the challenge is over, with whether a track was submitted.
	let { onconclude } = $props();
</script>

<Chapter id="optimising">
	<h2>Optimising</h2>
	<p>
		Enter subjectivity. What makes one layout better than another? Consider
		these:
	</p>
	<RankedTracks end="best" />

	<p>Now these:</p>
	<RankedTracks end="worst" />

	<p>
		Which do you prefer, the first set or the second? The first set, right? If
		you prefer the latter, I can't help you. From here on I'll assume you're a
		rational person and prefer the former like me. Good? Good.
	</p>
	<p>
		Here's my favourite from earlier. It tops the first set too. Now, why do I
		love this one?
	</p>
	<TrackFigure
		shape={SWEEP_CROSSED_RANKED.best[0].shape}
		scene={lengthsScene}
	/>
	<p>
		I like that it's so compact; it's surely more difficult to create a track
		that fits in a box of this size. Jamming it in a smaller box also has a
		knock-on effect where it's more likely for a train to have a close call by
		riding next to another piece of track and narrowly missing it.
	</p>
	<p>
		It would also be underwhelming if the train stayed largely face up. One of
		the selling points of the Rail Cube is that it can ride on walls and go
		upside down. We must please the creators and cover as many of the 24
		orientations as we can. You can only change orientation with curved pieces,
		i.e. <PieceTag letter="L" />, <PieceTag letter="R" />, <PieceTag
			letter="I"
		/>, or <PieceTag letter="O" />. The maximum achievable orientation count is
		20, since our inventory only contains 20 of those pieces. The below track
		does just that, omitting the entire +z face.
	</p>
	<PoseTracker shape="IRSISSRIIROXSSLSSOORISLISSILSSSOLXSI" />
	<p>
		Excessive repeats should also be avoided. They're a symptom of poor
		craftsmanship, bailing the engineer out of suboptimal design decisions.
		Two-in-a-row is OK for me because hairpin turns are cool, meaning we only
		treat it as a repeat when it's in a repeated section of at least three.
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
		> at Alton Towers? A layout that ties itself in knots gets bonus points in my
		book.
	</p>
	<TrackFigure shape="ILIOIXIRSISSRISSSOSRRSOXSLLISSLSSOSI" scene={knotScene} />

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
			<b>Knot:</b> Whether the layout ties itself in a knot (or knot – ha). This is
			a true or false measure. Just one knot is enough to excite me.
		</li>
	</ul>
	<p>All of the layouts below perform well on these five metrics:</p>
	<ScoredTrack end="best" />

	<p>
		On the other hand, we can actually put something concrete against why the
		bad tracks offend us so:
	</p>

	<ScoredTrack end="worst" />

	<p>
		There might be some additional things you care about, perhaps time spent
		upside down is pleasing to you. The real magic happens when you combine
		different objectives into one you can optimise for. The
		metrics on their own don't always guarantee a banger:
	</p>

	<SingleMetrics />

	<p>
		To get the layouts that perform well on all fronts, we combine the metrics
		into one score, by putting our finger firmly in the air to create a formula
		based on how much we care about each metric. For simplicity, I'm going with
		a point for all metrics apart from knots, which get 10 because they're
		awesome. Here are the top 100 when using that scoring mechanism:
	</p>

	<ScoredRanking />

	<p>
		We can make this less simple by making the weighting of each metric
		configurable. Try changing the formula yourself and see how that affects
		what layouts score the best. It might be you prefer a different recipe to
		me.
	</p>

	<WeightedTracks />

	<p>
		We're nearing the end of this wonderful journey; our train is approaching
		the final boss, where this service terminates. At the beginning of the post
		I conjectured that someone out there would be able to beat my best scoring
		layout. Now's your time to apply the lessons so enthusiastically learned in
		this post and prove me right.
	</p>

	<Challenge {onconclude} />
</Chapter>
