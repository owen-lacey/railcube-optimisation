// The verdict a builder opens when its loop closes: how the track scores against the
// crossed sweep and against the board, then a name and notes. Here it opens on its own,
// over a stand-in Worker, so each answer the Worker can give is a story; `Live` asks
// the real one (`npm run worker`).

import { fn } from 'storybook/test';
import SubmitDialogHarness from './SubmitDialogHarness.svelte';
import { SWEEP_CROSSED_RANKED } from '$lib/sweeps.js';

export default {
  title: 'Submit dialog',
  component: SubmitDialogHarness,
  argTypes: { shape: { control: 'text' } },
  args: { shape: SWEEP_CROSSED_RANKED.best[0].shape, onresults: fn() },
};

/** A track new to a board too small for its histogram: the name and notes are asked for. */
export const NewTrack = { args: { others: [[12, 2], [20, 3]] } };

/** A track new to a board big enough to draw. */
export const OnABoard = {
  args: { others: [[8, 1], [12, 2], [16, 4], [20, 6], [24, 5], [28, 3], [33, 2], [38, 1]] },
};

/** A track someone has already submitted: no name to give. */
export const AlreadyOnTheBoard = {
  args: { duplicate: true, others: [[12, 2], [20, 3]] },
};

/** Waiting on the Worker. */
export const Judging = { args: { worker: 'judging' } };

/** The Worker cannot be reached: an error and a "Try again". */
export const Unreachable = { args: { worker: 'unreachable' } };

/** The real Worker at PUBLIC_LEADERBOARD_URL: run `npm run worker` first. Submits for real. */
export const Live = { args: { worker: 'live' } };
