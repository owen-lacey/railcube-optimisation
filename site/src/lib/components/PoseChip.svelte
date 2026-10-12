<script>
	// One pose as a chip: its two-letter code, ticked once the train has taken it,
	// with the pose in words as its tooltip. Needs a `Tooltip.Provider` above it,
	// which `PoseChips` is.
	//
	// The tooltip opens on hover and keyboard focus, as bits-ui's does, and on a tap,
	// which bits-ui's deliberately does not: a tap toggles it, and a tap anywhere
	// else, a scroll or Escape closes it.
	import { Tooltip } from "bits-ui";
	import Check from "@lucide/svelte/icons/check";
	import { describePose, poseLabel } from "$lib/catalogue.js";

	// `pose` is a code like `'DF'`; `taken` whether the train has taken it yet.
	let { pose, taken = false } = $props();

	const name = $derived(describePose(pose));

	let open = $state(false);
	// Read on the way down, because by the click it is too late to ask either: a
	// click does not always say it was a finger, and a tap focuses the chip between
	// the two, which opens the tooltip by itself.
	let tapped = false;
	let wasOpen = false;
</script>

<li class="item">
	<Tooltip.Root bind:open disableCloseOnTriggerClick>
		<Tooltip.Trigger
			class={taken ? "chip taken" : "chip"}
			onpointerdown={(event) => {
				tapped = event.pointerType === "touch";
				wasOpen = open;
			}}
			onclick={() => {
				if (tapped) open = !wasOpen;
			}}
		>
			<span aria-hidden="true">{poseLabel(pose)}</span>
			<span class="badge" aria-hidden="true"><Check strokeWidth={4} /></span>
			<span class="visually-hidden">{name}, {taken ? "taken" : "not yet"}</span>
		</Tooltip.Trigger>
		<!-- Not portalled: a full-screen card is a modal dialog, and anything put on
		     the body would be under it. Fixed, so the card's clipping cannot cut it. -->
		<Tooltip.Content class="tooltip" side="top" sideOffset={6} collisionPadding={8} strategy="fixed">
			{name}
		</Tooltip.Content>
	</Tooltip.Root>
</li>

<style>
	.item {
		display: grid;
	}

	.item :global(.chip) {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.125rem 0.375rem;
		border: 2px solid var(--card-border);
		border-radius: 999px;
		background: transparent;
		color: var(--card-border);
		font: inherit;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		cursor: default;
		transition:
			color 0.2s,
			border-color 0.2s,
			background-color 0.2s;
	}

	.item :global(.chip.taken) {
		border-color: currentColor;
		background: var(--page);
		color: inherit;
	}

	.item :global(.chip:focus-visible) {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}

	/* The tick is a badge over the chip's top-right corner, so it takes no room
	   and a chip never changes width. */
	.badge {
		position: absolute;
		top: 0;
		right: 0;
		display: grid;
		place-items: center;
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 999px;
		background: currentColor;
		translate: 40% -40%;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.badge :global(svg) {
		width: 0.625rem;
		height: 0.625rem;
		color: var(--page);
	}

	.item :global(.chip.taken .badge) {
		opacity: 1;
	}

	.item :global(.tooltip) {
		padding: 0.25rem 0.5rem;
		border: 2px solid var(--card-border);
		border-radius: 0.5rem;
		background: var(--page);
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
		z-index: 1;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.item :global(.chip),
		.badge {
			transition: none;
		}
	}
</style>
