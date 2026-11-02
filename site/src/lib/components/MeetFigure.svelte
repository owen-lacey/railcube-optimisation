<script>
	// How `scripts/meet.py` makes a crossed layout, a step at a time, on one fixed
	// layout of the crossed sweep (`meet-figure.json`, by `scripts/meet-figure.js`).
	// Back and forwards in the footer; the cubes are carried between steps, so one
	// step's segment is the next one's. A figure — see `$lib/figure.js`.
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import { onMount } from "svelte";
	import Frame from "./Frame.svelte";
	import GateButton from "./GateButton.svelte";
	import InventorySlots from "./InventorySlots.svelte";
	import OrientationChip from "./OrientationChip.svelte";
	import PieceTag from "./PieceTag.svelte";
	import { joinedScene, trialScene } from "$lib/scenes.js";
	import { MOVE } from "$lib/render/move.js";
	import { usedOf } from "$lib/building.js";
	import { INVENTORY } from "$lib/submission.js";
	import data from "$lib/data/meet-figure.json" with { type: "json" };

	// `camera` is how the trials are shot: 'follow' frames each picture on its own and
	// pans between them, 'fixed' holds one shot over every candidate in every picture.
	// Square on a phone, 16/10 otherwise, unless `aspect` is given: the last step's
	// inventory would otherwise cover a phone's whole viewer.
	let { aspect = undefined, camera = "follow" } = $props();

	let narrow = $state(false);
	onMount(() => {
		const query = window.matchMedia("(max-width: 600px)");
		const update = () => {
			narrow = query.matches;
		};
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	});
	const shapeOfViewer = $derived(aspect ?? (narrow ? "1 / 1" : "16 / 10"));

	const [first, second] = data.a.segments;
	const [third, last] = data.b.segments;

	// How long each beat of the trials is held, in seconds: a carry is `MOVE`, and the
	// rest is time to look.
	const LOOK = 0.8;
	const VERDICT = 1.4;

	// A loop's last segment, searched for: each decoy, then the real one, joined in
	// turn to everything `before` it, beat by beat. Each candidate flies in beside
	// what is built, is turned to carry on from it, joined to it, and its end's
	// callout marked ✗ or ✓ against `target`; a miss then fades away, back to what is
	// built alone in the next candidate's shot, before it flies in. The last beat, the
	// real segment's ✓, is held. `opening` beats go first.
	function trials(before, { decoys, segment, target }, opening = []) {
		const routes = [...decoys, segment].map((candidate) => before + candidate);
		const trial = (state, judged = false) =>
			trialScene(before.length, {
				state,
				judged,
				target,
				routes: camera === "fixed" ? routes : null
			});
		const pictures = {
			alone: trial("alone"),
			apart: trial("apart"),
			turned: trial("turned"),
			joined: trial("joined"),
			judged: trial("joined", true)
		};
		const beats = routes.flatMap((shape, i) => {
			const match = i === routes.length - 1;
			return [
				{ shape, state: "apart", hold: MOVE + LOOK },
				{ shape, state: "turned", hold: MOVE + LOOK },
				{ shape, state: "joined", hold: MOVE + LOOK / 2 },
				{ shape, state: "judged", hold: VERDICT },
				...(match ? [] : [{ shape: routes[i + 1], state: "alone", hold: MOVE }])
			];
		});
		return [...opening, ...beats].map((entry) => ({ ...entry, scene: pictures[entry.state] }));
	}

	// Loop A's second segment, on from its first.
	const LOOP_A = trials(first, { decoys: data.a.decoys, segment: second, target: data.a.heading });
	// Loop B's last segment, on from the rest of the track. It opens on loop B's first
	// segment flying straight on to the end of loop A, in the first candidate's shot.
	const before = first + second + third;
	const LOOP_B = trials(
		before,
		{ decoys: data.b.decoys, segment: last, target: data.b.heading },
		[{ shape: before + data.b.decoys[0], state: "alone", hold: MOVE + LOOK }]
	);

	// Whole tracks, loop A with each loop B in turn: other layouts' loop Bs, which
	// close the track but miscount the box, then the real one, which spends it. Each
	// flies in, carrying loop B's cubes from the last, and is judged on the inventory.
	const loopA = first + second;
	const tracks = [...data.spend.decoys.map(({ loop }) => loopA + loop), data.reading];
	const whole = (letters) => ({
		...joinedScene(letters, { ends: false, routes: camera === "fixed" ? tracks : null }),
		closed: false
	});
	const SPEND = tracks.flatMap((shape) => [
		{ shape, state: "shown", hold: MOVE + LOOK, scene: whole },
		{ shape, state: "judged", hold: VERDICT, scene: whole }
	]);

	// Each step: what is drawn, how it arrives and what the footer says. The first
	// segment is built once its pieces are picked, then its ends are shown; both
	// share one shot, so stepping between them does not pan, and stepping back
	// empties the viewer for the pieces to be picked again. The rest play
	// their `beats`, a view a beat.
	const trialStep = (beats, caption) => ({
		beats,
		view: () => {
			const { shape, scene } = beats[beat];
			return { shape, scene, transition: { kind: "move", pan: 0.6 } };
		},
		caption
	});
	const STEPS = [
		{
			view: () => ({
				shape: first,
				scene: (letters) => {
					const scene = joinedScene(letters, { ends: false });
					return picked ? scene : { ...scene, pieces: [] };
				},
				transition: { kind: "build" }
			}),
			caption: pickCaption
		},
		{
			view: () => ({
				shape: first,
				scene: joinedScene,
				transition: { kind: "move", pan: 0.6 }
			}),
			caption: noteCaption
		},
		trialStep(LOOP_A, pairCaption),
		trialStep(LOOP_B, againCaption),
		trialStep(SPEND, spendCaption)
	];

	let at = $state(0);
	// Whether the first step's pieces have been picked, which is what builds them.
	let picked = $state(false);
	// Which beat of the trials is up, on a step that has them.
	let beat = $state(0);
	const step = $derived(STEPS[at]);
	const view = $derived(step.view());
	// The step's last beat, if it has beats.
	const end = $derived(step.beats ? step.beats.length - 1 : null);
	// The pieces the matching step's track uses, and its verdict once judged.
	const used = $derived(step.beats === SPEND ? usedOf(SPEND[beat].shape) : null);
	const spent = $derived(
		used && Object.keys(INVENTORY).every((type) => (used[type] ?? 0) === INVENTORY[type])
	);
	const mark = $derived(
		step.beats === SPEND && SPEND[beat].state === "judged" ? (spent ? "match" : "miss") : null
	);
	// Whether this step has done what it shows, so the reader can go on.
	const ready = $derived(at === 0 ? picked : end === null || beat === end);

	$effect(() => {
		if (end === null || beat === end) return;
		const timer = setTimeout(() => (beat += 1), step.beats[beat].hold * 1000);
		return () => clearTimeout(timer);
	});

	function forwards() {
		at += 1;
		// The trials play from the start; under reduced motion they are skipped,
		// straight to the match.
		const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
		beat = reduced && STEPS[at].beats ? STEPS[at].beats.length - 1 : 0;
	}

	function back() {
		at -= 1;
		picked = false;
		// Back into trials lands on their match, without playing them again.
		beat = STEPS[at].beats ? STEPS[at].beats.length - 1 : 0;
	}
</script>

{#snippet pickCaption()}
	Pick a handful of pieces from the box at random and join together.
{/snippet}

{#snippet noteCaption()}
	Make a note of the finishing pose.
{/snippet}

{#snippet pairCaption()}
	Do this many times, and pair up segments that would finish when it meets the <PieceTag
		letter="X"
	/> for the first time at orientation <OrientationChip orientation={data.a.heading} />.
{/snippet}

{#snippet againCaption()}
	Similarly, do this again with segments that add up to <OrientationChip
		orientation={data.b.heading}
	/>, giving the other half of the figure-of-eight.
{/snippet}

{#snippet spendCaption()}
	We then have a bunch of halves. Pair these up based on the inventory they use. When
	combined, they must use every piece in the box.
{/snippet}

{#snippet inventory()}
	<InventorySlots {used} inventory={INVENTORY} {mark} />
{/snippet}

{#snippet pick()}
	<GateButton onclick={() => (picked = true)}>Select pieces</GateButton>
{/snippet}

<Frame
	{view}
	centre={at === 0 && !picked ? pick : undefined}
	overlay={used ? inventory : undefined}
	aspect={shapeOfViewer}
>
	{#snippet footer()}
		<div class="steps">
			<button
				type="button"
				class="turn"
				aria-label="Back"
				title="Back"
				disabled={at === 0}
				onclick={back}
			>
				<ChevronLeft aria-hidden="true" />
			</button>
			<!-- Every caption in one cell, only the current one shown, so the footer is
           the longest one's height on every step and the card never resizes. -->
			<div class="captions">
				{#each STEPS as { caption }, i}
					<p class="caption" class:current={i === at} aria-hidden={i !== at}>
						{@render caption()}
					</p>
				{/each}
			</div>
			<button
				type="button"
				class="turn"
				aria-label="Forwards"
				title="Forwards"
				disabled={at === STEPS.length - 1 || !ready}
				onclick={forwards}
			>
				<ChevronRight aria-hidden="true" />
			</button>
		</div>
	{/snippet}
</Frame>

<style>
	.steps {
		display: flex;
		flex-basis: 100%;
		align-items: center;
		gap: 0.75rem;
	}

	.captions {
		display: grid;
		flex: 1;
	}

	.caption {
		grid-area: 1 / 1;
		margin: 0;
		text-align: center;
		visibility: hidden;
	}

	.caption.current {
		visibility: visible;
	}

	/* Outlined like KnownTracks' shuffle. */
	.turn {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.turn:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
