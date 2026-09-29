// Which builder gets the keyboard. The IntersectionObserver wiring needs a
// browser; the rule it feeds does not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mostInView } from '../site/src/lib/keys.js';

test('the keys go to whichever builder is most in view', () => {
  assert.equal(mostInView(new Map([['a', 0.6], ['b', 0.9], ['c', 0]])), 'b');
});

test('nobody has the keys unless one is mostly in view', () => {
  assert.equal(mostInView(new Map([['a', 0.5], ['b', 0.3]])), null, 'exactly half is not most of it');
  assert.equal(mostInView(new Map()), null);
});
