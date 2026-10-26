<script>
	// The post's opening, told over one viewer. Its first track is the title's O,
	// which the page zooms into, so the section is the page's to hold and land.
	//
	// The prose is a straight transcription of notes.md — the wording is Owen's
	// first draft and is not to be edited here.
	import Highlight from "$lib/components/Highlight.svelte";
	import KnownTracks from "$lib/components/KnownTracks.svelte";
	import StepSection from "$lib/components/StepSection.svelte";
	import TrackFigure from "$lib/components/TrackFigure.svelte";

	let { section = $bindable(), locked, onaboard } = $props();

	const steps = [
		{
			body: intro,
			figure: TrackFigure,
			props: { shape: "SIOSLLSOISLL" }
		},
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
		{ body: tiresome, figure: KnownTracks, props: { train: null } }
	];
</script>

{#snippet intro()}
	<p>This is a Rail Cube track. It's as if model trains and LEGO had a baby.</p>

	<p>
		It uses four <Highlight colour="straight">straights</Highlight>, two <Highlight
			colour="insideCurve">inner loops</Highlight
		>, two <Highlight colour="outsideCurve">outer loops</Highlight>, and four <Highlight
			colour="leftCurve">left turns</Highlight
		>. It leaves 23 Rail Cube pieces in the box, unused. Unacceptable.
	</p>
{/snippet}

{#snippet instead()}
	<p>Consider this instead.</p>
{/snippet}

{#snippet orThis()}
	<p>Or this.</p>
{/snippet}

{#snippet tiresome()}
	<p>
		In fact, I've got a bunch of these ready to use anytime my three year old
		decrees that the existing structure is tiresome.
	</p>
	<p>
		I am showing you a sample of the millions of Rail Cube layouts I've
		generated. I'm going to show you how I did this, and how we might optimise
		for different things.
	</p>
{/snippet}

<StepSection bind:this={section} {steps} {locked} {onaboard} />
