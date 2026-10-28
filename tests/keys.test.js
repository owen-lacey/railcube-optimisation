// Which builder gets the keyboard. The IntersectionObserver wiring needs a
// browser; the rule it feeds does not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mostInView, inFront } from '../site/src/lib/keys.js';

test('the keys go to whichever builder is most in view', () => {
  assert.equal(mostInView(new Map([['a', 0.6], ['b', 0.9], ['c', 0]])), 'b');
});

test('nobody has the keys unless one is mostly in view', () => {
  assert.equal(mostInView(new Map([['a', 0.5], ['b', 0.3]])), null, 'exactly half is not most of it');
  assert.equal(mostInView(new Map()), null);
});

test('nothing behind an open modal has the keys', () => {
  const ratios = new Map([['page', 1], ['builder', 0.9]]);
  const dialog = { contains: candidate => candidate === 'builder' };
  assert.equal(mostInView(inFront(ratios, [dialog])), 'builder');
  assert.equal(mostInView(inFront(ratios, [dialog, { contains: () => false }])), null, 'a dialog over the dialog has them all');
  assert.equal(mostInView(inFront(ratios, [])), 'page');
});
