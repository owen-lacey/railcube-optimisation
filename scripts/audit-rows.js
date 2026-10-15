// The audit a script runs on the sweeps.db rows it is about to write into a site
// data file: each re-derived through the model, recounted against its stored
// columns, kept on the floor, and its knot read again on a fresh rotation. One
// disagreement throws, so a file is never written from a row the geometry or
// topoly would not stand behind.

import { assertSpends, derive } from './sweep-data.js';
import { knotInput, knotReader } from './knot-curves.js';
import { knotOf } from '../site/src/lib/knots.js';

// A seed away from any row id, so the audit's rotations are not the scan's.
const AUDIT_SEED = 2 ** 33;
// The columns a row's values come from, re-derived in the audit.
const RECOUNTED = ['poses', 'close_calls', 'repeats', 'span_across', 'span_up', 'span_along'];

/** Re-derive every row, recount it, and read its knot afresh. `question` is what it must spend. */
export async function auditRows(rows, question) {
  const placed = rows.map(row => {
    const { placed: chained, columns } = derive(row.shape);
    assertSpends(chained, question, row.shape);
    const off = RECOUNTED.filter(c => columns[c] !== row[c]);
    if (off.length) throw new Error(`${row.shape} recounts ${off.map(c => `${c} ${columns[c]}`)}, stored ${off.map(c => row[c])}`);
    if (columns.underground) throw new Error(`${row.shape} goes below the floor`);
    return chained;
  });
  const reader = knotReader();
  const polys = await reader.read(rows.map((row, i) => ({
    id: row.id, seed: AUDIT_SEED + row.id, ...knotInput(placed[i]) })));
  await reader.close();
  rows.forEach((row, i) => {
    const knot = knotOf(polys[i].over, polys[i].under);
    const stored = knotOf(row.knot_over, row.knot_under);
    if (knot !== stored) throw new Error(`${row.shape} reads ${knot}, stored ${stored}`);
  });
}
