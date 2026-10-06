<script>
	// A review page for the post's opening as a scrollytelling section, away from the
	// post and linked from nowhere.
	import ScrollySection from "$lib/components/ScrollySection.svelte";
	import TrackFigure from "$lib/components/TrackFigure.svelte";
	import KnownTracks from "$lib/components/KnownTracks.svelte";
	import PieceCardGrid from "$lib/components/PieceCardGrid.svelte";

	const steps = [
		{ body: intro, figure: TrackFigure, props: { shape: "SIOLLOISLL" } },
		{ body: unused, figure: TrackFigure, props: { shape: "SIOLLOISLL" } },
		{
			body: instead,
			figure: TrackFigure,
			props: { shape: "XSSLISISSOIILSRISSXSISSOSOIRRSROILSL" }
		},
		{
			body: orThis,
			figure: TrackFigure,
			props: { shape: "ILSSXOSSSSSIISLRSISOORSOIRRSXIILSLSI" }
		},
		{ body: tiresome, figure: KnownTracks }
	];
</script>

{#snippet intro()}
	<p>This is a Rail Cube track. It's as if model trains and LEGO had a baby:</p>
{/snippet}

{#snippet unused()}
	<p>
		It uses two straights, two inner loops, two outer, and four right turns. It
		leaves 25 Rail Cube pieces in the box, unused. Unacceptable.
	</p>
{/snippet}

{#snippet instead()}
	<p>Consider this instead:</p>
{/snippet}

{#snippet orThis()}
	<p>Or this:</p>
{/snippet}

{#snippet tiresome()}
	<p>
		In fact, I've got a bunch of these ready to use anytime my three year old
		decrees that the existing structure is tiresome.
	</p>
{/snippet}

<ScrollySection {steps} />

<p>
	Hopefully the sheer number of tracks convinces you I couldn't have possibly
	figured all of these out by myself. I'm going to show you how I made something
	to generate these, and how we can optimise for different things.
</p>

<h2>Coordinates</h2>

<p>The Rail Cube box comes with these pieces:</p>

<PieceCardGrid full={true} />
