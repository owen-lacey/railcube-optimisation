// A track's pieces against the box's, as the meet figure's last step judges them.

import InventorySlots from './InventorySlots.svelte';
import { usedOf } from '$lib/building.js';
import { INVENTORY } from '$lib/submission.js';
import data from '$lib/data/meet-figure.json' with { type: 'json' };

const loopA = data.a.segments.join('');

export default {
  title: 'Inventory slots',
  component: InventorySlots,
  argTypes: {
    mark: { control: 'inline-radio', options: [null, 'match', 'miss'] },
  },
};

/** The figure's layout, which spends the box exactly. */
export const Spent = { args: { used: usedOf(data.reading), inventory: INVENTORY, mark: 'match' } };

/** A decoy: it closes, but some slots are left empty and some pieces have none. */
export const Miscounted = {
  args: { used: usedOf(loopA + data.spend.decoys[0].loop), inventory: INVENTORY, mark: 'miss' },
};

/** Before it is judged. */
export const Unjudged = { args: { ...Miscounted.args, mark: null } };
