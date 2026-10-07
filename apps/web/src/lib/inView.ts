// One IntersectionObserver per option set for the whole page, instead of one
// per Reveal / CountUp / loop: dozens of blocks on the home page share a few
// observers, and their callbacks run in one batch per frame.

type Callback = (entry: IntersectionObserverEntry) => void;

const observers = new Map<string, { io: IntersectionObserver; subs: Map<Element, Callback> }>();

function observerFor(threshold: number, rootMargin: string) {
  const key = `${threshold}|${rootMargin}`;
  let item = observers.get(key);
  if (!item) {
    const subs = new Map<Element, Callback>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) subs.get(entry.target)?.(entry);
      },
      { threshold, rootMargin },
    );
    item = { io, subs };
    observers.set(key, item);
  }
  return item;
}

/**
 * Calls `callback` with every intersection change of `el`; returns the
 * unsubscribe. Without IntersectionObserver the element counts as visible.
 */
export function watchInView(
  el: Element,
  callback: Callback,
  { threshold = 0, rootMargin = '0px' }: { threshold?: number; rootMargin?: string } = {},
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    callback({ isIntersecting: true, target: el } as IntersectionObserverEntry);
    return () => {};
  }
  const { io, subs } = observerFor(threshold, rootMargin);
  subs.set(el, callback);
  io.observe(el);
  return () => {
    subs.delete(el);
    io.unobserve(el);
  };
}

/** Calls `callback` once, the first time `el` comes into view. */
export function onceInView(
  el: Element,
  callback: () => void,
  options?: { threshold?: number; rootMargin?: string },
): () => void {
  let stop = () => {};
  stop = watchInView(
    el,
    (entry) => {
      if (!entry.isIntersecting) return;
      stop();
      callback();
    },
    options,
  );
  return () => stop();
}

/** Whether the visitor asked for reduced motion. */
export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
