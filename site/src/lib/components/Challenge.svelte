<script>
	// The post's final boss: take it on, or don't. "Bring it on" opens the briefing,
	// whose confirm opens the builder full screen, and a submitted track ends the
	// challenge from the verdict; turning the briefing down ends it at once. Either
	// way the button goes and `onconclude(submitted)` is called.
	//
	// Once in the builder, the way out without a submitted track is to give up:
	// its close button, or Escape, ends the challenge there and then.
	// "Bring it on" has the right arrow while it is mostly in view; nothing behind
	// the builder or the briefing does.
	import { onMount, tick } from "svelte";
	import X from "@lucide/svelte/icons/x";
	import GateButton from "./GateButton.svelte";
	import ChallengeBriefing from "./ChallengeBriefing.svelte";
	import TrackBuilder from "./TrackBuilder.svelte";
	import FillCard from "./FillCard.svelte";
	import { claimKeys } from "$lib/keys.js";

	let { onconclude } = $props();

	let briefing = $state(null);
	let bring = $state(null);
	let arena = $state(null);
	let fighting = $state(false);
	let over = $state(false);

	onMount(() =>
		claimKeys(bring, (event) => {
			if (event.key !== "ArrowRight") return;
			event.preventDefault();
			briefing.open();
		})
	);

	async function fight() {
		fighting = true;
		await tick();
		arena.showModal();
	}

	// Escape closes the builder as the close button does: by giving up.
	function giveUp(event) {
		event.preventDefault();
		conclude(false);
	}

	function conclude(submitted) {
		arena?.close();
		over = true;
		onconclude(submitted);
	}
</script>

{#if !over}
	<div class="buttons">
		<GateButton bind:element={bring} onclick={() => briefing.open()}>Bring it on</GateButton>
	</div>

	<ChallengeBriefing bind:this={briefing} onconfirm={fight} ondecline={() => conclude(false)} />

	<dialog
		bind:this={arena}
		class="arena"
		aria-label="The challenge's track builder"
		oncancel={giveUp}
	>
		{#if fighting}
			<div class="bar">
				<button type="button" class="close" aria-label="Give up" onclick={giveUp}>
					<X aria-hidden="true" />
				</button>
			</div>
			<div class="builder">
				<TrackBuilder card={FillCard} onresults={() => conclude(true)} resultsLabel="Continue" />
			</div>
		{/if}
	</dialog>
{/if}

<style>
	.buttons {
		display: flex;
		justify-content: center;
		margin: 2rem 0;
	}

	/* The whole screen, as `ExpandingCard`'s full screen is. */
	.arena {
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0.75rem;
		box-sizing: border-box;
		border: 0;
		background: var(--page);
		color: var(--ink);
		opacity: 0;
		transition:
			opacity 0.3s ease-out,
			overlay 0.3s allow-discrete,
			display 0.3s allow-discrete;
	}

	.arena[open] {
		display: flex;
		flex-direction: column;
		opacity: 1;
	}

	@starting-style {
		.arena[open] {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.arena {
			transition: none;
		}
	}

	.bar {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.5rem;
	}

	/* The viewer's tool buttons' size, corners and fill. */
	.close {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: var(--card-footer);
		color: var(--ink);
		cursor: pointer;
	}

	.builder {
		flex: 1;
		min-height: 0;
	}
</style>
