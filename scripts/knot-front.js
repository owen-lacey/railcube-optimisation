// Which layouts' knots have to be read for the weighted best and worst to be
// exact, read lazily from the front inwards.
//
// A weighting with every weight positive ranks a layout below any layout that
// is at least as good on every metric and better on one. So the best is always
// on the Pareto front, and knotted is one more metric on it: a layout a
// knotted layout dominates can never be best, whatever its own knot. Reading
// from the front inwards, a group of layouts tied on the other metrics needs
// its knots read only if no group already read dominates it with a knotted
// layout in it. The worst is the same with every direction flipped, and an
// unknotted layout doing the ruling out — which nearly every group has, so the
// worst end stops almost at once.
//
// Groups are visited in order of a score that every dominator beats (the sum of
// their directed, range-scaled values), so each group's dominators have all been
// visited first. A wave is read at once, so that several readers can share it,
// and is groups until it holds `wave` unread layouts. It may read a group that a
// knotted neighbour in the same wave would have ruled out; that costs reads, not
// exactness, which is why a wave is counted in layouts rather than groups.
//
// A zero weight lets dominated layouts tie the best, and this does not cover
// that: only reading everything does.

/** `[[metric, direction]]` → is `a` at least as good as `b` everywhere and better somewhere? */
const dominates = (metrics, a, b) => metrics.every(([m, d]) => d * (a[m] - b[m]) >= 0)
  && metrics.some(([m]) => a[m] !== b[m]);

/** The groups of `groups` merged on `metrics` alone, each with the ids under it. */
function regroup(groups, metrics) {
  const merged = new Map();
  for (const g of groups) {
    const key = metrics.map(([m]) => g.values[m]).join(',');
    if (!merged.has(key)) merged.set(key, { values: g.values, ids: [] });
    merged.get(key).ids.push(...g.ids);
  }
  return [...merged.values()];
}

/** Highest first: anything dominating a group scores strictly above it. */
function inOrder(groups, metrics) {
  const range = Object.fromEntries(metrics.map(([m]) => {
    const vs = groups.map(g => g.values[m]);
    return [m, Math.max(...vs) - Math.min(...vs) || 1];
  }));
  const score = g => metrics.reduce((s, [m, d]) => s + d * g.values[m] / range[m], 0);
  return groups.map(g => [score(g), g]).sort((a, b) => b[0] - a[0]).map(([, g]) => g);
}

/**
 * Visit one end: `metrics` with directions already flipped for the worst, and
 * `rules(knotted)` whether a read layout of that knot rules out what it dominates.
 * `read(ids)` resolves once every id in it has been read into `knots`.
 */
async function sweep({ groups, metrics, knots, rules, read, wave, say }) {
  const ruling = [];
  const order = inOrder(regroup(groups, metrics), metrics);
  let visited = 0;
  for (let i = 0; i < order.length;) {
    const batch = [], unread = [];
    for (; i < order.length && unread.length < wave; i++) {
      if (ruling.some(r => dominates(metrics, r.values, order[i].values))) continue;
      batch.push(order[i]);
      unread.push(...order[i].ids.filter(id => !knots.has(id)));
    }
    await read(unread);
    for (const g of batch) if (g.ids.some(id => rules(knots.get(id)))) ruling.push(g);
    visited += batch.length;
    if (unread.length) say(`  group ${i} of ${order.length}: ${visited} visited, ${ruling.length} ruling`);
  }
  say(`  ${visited} of ${order.length} groups visited, ${ruling.length} ruling`);
}

/**
 * Read every knot either end of every weighting needs, over each metric set in
 * `sets` (`{ metric: direction }`), knotted counting as better.
 */
export async function readFront({ groups, sets, knots, read, wave = 16, say = () => {} }) {
  for (const set of sets) {
    const metrics = Object.entries(set);
    say(`best of ${JSON.stringify(set)}`);
    await sweep({ groups, metrics, knots, rules: k => k, read, wave, say });
    say(`worst of ${JSON.stringify(set)}`);
    const flipped = metrics.map(([m, d]) => [m, -d]);
    await sweep({ groups, metrics: flipped, knots, rules: k => !k, read, wave, say });
  }
}
