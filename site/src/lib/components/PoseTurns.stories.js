// The train inside one cube, turned by hand: each piece's button puts it in the
// pose it would leave that piece in.

import PoseTurns from './PoseTurns.svelte';
import { POSES } from '../../../../src/track.js';

export default {
  title: 'Pose turns',
  component: PoseTurns,
  argTypes: {
    initial: { control: 'select', options: POSES },
  },
};

export const Default = {};
