// The floating buttons at the bottom of the page (the install button, the
// cookie strip) must never lie on what the visitor came for: the order button,
// a price, the phone number, a form field. A fixed element cannot know that
// from CSS, so it asks here what the page shows under it and steps aside.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Sample points over a box: a grid no coarser than `step` px, just inside the edges. */
export function samplePoints(box: Box, step = 22): { x: number; y: number }[] {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (!(width > 2) || !(height > 2) || !(step > 0)) return [];
  const columns = Math.max(1, Math.ceil(width / step));
  const rows = Math.max(1, Math.ceil(height / step));
  const points: { x: number; y: number }[] = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      points.push({
        // One pixel inside the edge: a point on the border belongs to the neighbour.
        x: Math.min(box.right - 1, Math.max(box.left + 1, box.left + (width * column) / columns)),
        y: Math.min(box.bottom - 1, Math.max(box.top + 1, box.top + (height * row) / rows)),
      });
    }
  }
  return points;
}

/** Links, buttons and fields: what a visitor taps. */
export const CONTROLS =
  'a[href],button,input,select,textarea,label,summary,[role="button"],[data-fab-avoid]';
/** What the cookie strip never covers: the phone, the order button, a submit button, a field. */
export const KEY_ACTIONS =
  'a[href^="tel:"],a[href$="#callback"],button[type="submit"],input,select,textarea,[data-fab-avoid]';

/** The element itself carries text of at least `minPx` (a price, a heading, a phone number). */
export function hasOwnText(el: Element, minPx: number): boolean {
  let own = false;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 && (node.textContent ?? '').trim()) {
      own = true;
      break;
    }
  }
  if (!own) return false;
  if (minPx <= 0) return true;
  return parseFloat(getComputedStyle(el).fontSize) >= minPx;
}

/**
 * Whether the page's own content (inside <main>, not the site's fixed chrome)
 * has an element matching `blocks` under the box. Browser only.
 */
export function coversContent(box: Box, blocks: (el: Element) => boolean, step = 22): boolean {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') {
    return false;
  }
  const main = document.querySelector('main');
  if (!main) return false;
  const seen = new Set<Element>();
  for (const point of samplePoints(box, step)) {
    for (const el of document.elementsFromPoint(point.x, point.y)) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el === main || !main.contains(el) || el.closest('[data-platform-chrome]')) continue;
      if (blocks(el)) return true;
    }
  }
  return false;
}

/**
 * Calls `check` now, on scroll and resize (at most once per `everyMs`) and once
 * a second (the page under a fixed element changes without scrolling too).
 * Returns the function that stops it.
 */
export function watchOverlay(check: () => void, everyMs = 120): () => void {
  let timer = 0;
  let last = 0;
  const run = () => {
    timer = 0;
    last = Date.now();
    check();
  };
  const onMove = () => {
    if (timer) return;
    timer = window.setTimeout(run, Math.max(0, everyMs - (Date.now() - last)));
  };
  const slow = window.setInterval(onMove, 1000);
  window.addEventListener('scroll', onMove, { passive: true });
  window.addEventListener('resize', onMove);
  run();
  return () => {
    window.clearTimeout(timer);
    window.clearInterval(slow);
    window.removeEventListener('scroll', onMove);
    window.removeEventListener('resize', onMove);
  };
}
