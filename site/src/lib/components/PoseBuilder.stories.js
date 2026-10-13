// What a group of pieces does to the train: a track clicked together from a start
// orientation, with only its two ends read out — the pose the train starts in and
// the pose the last piece leaves it in.

import PoseBuilder from './PoseBuilder.svelte';
import { POSES } from '../../../../src/track.js';

export default {
  title: 'Pose builder',
  component: PoseBuilder,
  argTypes: {
    shape: { control: 'text' },
    initial: { control: 'select', options: POSES },
    aspect: { control: 'text' },
  },
};

export const Default = {};

/** Started with the train standing on the left wall. */
export const OnAWall = { args: { initial: 'LF' } };

/** Four left curves close the loop, so the train comes to rest where it started and adding stops. */
export const Closed = { args: { shape: 'LLLL' } };
