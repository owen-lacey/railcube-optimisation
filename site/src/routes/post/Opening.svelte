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
	import { SWEEP_CROSSED_RANKED } from "$lib/sweeps.js";

	let { section = $bindable(), onaboard } = $props();

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
		{ body: tiresome, figure: KnownTracks, props: { train: null } },
		{
			body: challenge,
			figure: TrackFigure,
			props: { shape: SWEEP_CROSSED_RANKED.best[0].shape }
		}
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
		I am showing you a sample of the ~27 million Rail Cube layouts I've
		generated. That may sound like loads, but I reckon there are over <a
			href="https://bsky.app/profile/owenlacey.dev/post/3mwlhlqenlc2r"
			target="_blank">28 billion ways</a
		> to build one using every piece.
	</p>
{/snippet}

{#snippet challenge()}
	<p>
		This one is my favourite so far, isn't it beautiful? I have formalised this
		affection in anticipation of someone improving on it. With 99.9% of layouts
		unseen, I'm pretty confident there's a better one out there. Can you find
		it?
	</p>
{/snippet}

<StepSection bind:this={section} {steps} {onaboard} />
