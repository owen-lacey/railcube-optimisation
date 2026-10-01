// What a piece does to the train from any pose: a pose stepper, a button per
// piece, and the start and end cells labelled with position and pose.

import PoseStep from './PoseStep.svelte';
import { PIECES } from '$lib/catalogue.js';
import { POSES } from '../../../../src/track.js';

export default {
  title: 'Pose step',
  component: PoseStep,
  argTypes: {
    initial: { control: 'select', options: POSES },
    initialPiece: { control: 'select', options: PIECES.map(p => p.type) },
  },
};

export const Default = {};

/** Opened on a left curve, the train standing on the left wall. */
export const OnAWall = { args: { initial: 'LF', initialPiece: 'leftCurve' } };
