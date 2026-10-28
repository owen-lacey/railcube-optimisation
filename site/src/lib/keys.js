// Which builder the keyboard belongs to: the one that is mostly on screen.
//
// A page can hold several builders, and asking a reader to click one before its
// keys work is a step nobody expects. So the keys are the page's, and they go to
// whichever registered element has the largest share of itself in view — as long
// as that is more than half of it. Scrolled between two, or past the last, the
// keys are nobody's, and the arrows scroll the page as usual.
//
// Anything being typed into is left alone, so a text box elsewhere on the page
// (Sketch's, say) keeps its own letters and its own Backspace. And nothing behind
// an open modal dialog has them, as focus cannot reach it either: a builder in a
// dialog has the keys, not a button the dialog covers.

// How much of an element must be in view before it can have the keys.
export const MAJORITY = 0.5;

const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * The one of these that should have the keys, or null. `ratios` maps each
 * candidate to how much of it is in view, 0 to 1.
 */
export function mostInView(ratios) {
  let best = null;
  let most = MAJORITY;
  for (const [candidate, ratio] of ratios) {
    if (ratio > most) { best = candidate; most = ratio; }
  }
  return best;
}

/**
 * The candidates in `ratios` inside every one of `modals` (anything with
 * `contains`), each with its share in view.
 */
export function inFront(ratios, modals) {
  return new Map([...ratios].filter(([candidate]) => modals.every(modal => modal.contains(candidate))));
}

const editable = target => target instanceof Element
  && (target.isContentEditable || target.closest('input, textarea, select'));

const handlers = new Map();   // element → keydown handler
const ratios = new Map();     // element → share of it in view
let observer = null;

function onKeydown(event) {
  if (event.defaultPrevented || editable(event.target)) return;
  const modals = [...document.querySelectorAll('dialog:modal')];
  handlers.get(mostInView(inFront(ratios, modals)))?.(event);
}

/**
 * Give `element` the page's keys whenever it is the one mostly in view. Returns
 * the function that takes them back.
 */
export function claimKeys(element, handler) {
  if (!observer) {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio);
    }, { threshold: THRESHOLDS });
    window.addEventListener('keydown', onKeydown);
  }
  handlers.set(element, handler);
  ratios.set(element, 0);
  observer.observe(element);

  return () => {
    observer.unobserve(element);
    handlers.delete(element);
    ratios.delete(element);
    if (handlers.size) return;
    observer.disconnect();
    observer = null;
    window.removeEventListener('keydown', onKeydown);
  };
}
