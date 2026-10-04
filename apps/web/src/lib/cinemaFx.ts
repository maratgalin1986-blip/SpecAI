// Shared guards for the extra «cinema» effect layers (dolly, particles, titles).

/** False for reduced motion and for the A/B group «calm». */
export function fxAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    if (/(?:^|;\s*)sp_ab=calm/.test(document.cookie)) return false;
  } catch {
    /* cookies are optional */
  }
  return true;
}

export function saveDataOn(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!conn?.saveData;
}

// React tags DOM nodes once hydrated; touching them earlier breaks hydration.
export function hydrated(el: Element): boolean {
  return Object.keys(el).some((k) => k.startsWith('__reactFiber'));
}

/** Runs `start` shortly after the window «load» event; returns a canceller. */
export function afterLoad(start: () => void, delay = 600): () => void {
  let timer = 0;
  const boot = () => {
    timer = window.setTimeout(start, delay);
  };
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener('load', boot);
  };
}

/** Whether the home page's opening titles (IntroSplash, #intro) cover the page. */
export function introShowing(): boolean {
  const intro = document.getElementById('intro');
  return !!intro && !intro.hidden;
}

/**
 * Runs `start` once the opening titles are gone (removed from the page or
 * hidden), right away when there are none. Reads the DOM only, so it needs
 * nothing from IntroSplash. Returns a canceller.
 */
export function whenIntroGone(start: () => void): () => void {
  const intro = document.getElementById('intro');
  if (!intro || intro.hidden) {
    start();
    return () => {};
  }
  let done = false;
  const observers: MutationObserver[] = [];
  const stop = () => {
    done = true;
    observers.forEach((o) => o.disconnect());
    window.clearTimeout(timer);
  };
  const check = () => {
    if (done || introShowing()) return;
    stop();
    start();
  };
  const own = new MutationObserver(check);
  own.observe(intro, { attributes: true, attributeFilter: ['hidden'] });
  observers.push(own);
  if (intro.parentNode) {
    const parent = new MutationObserver(check);
    parent.observe(intro.parentNode, { childList: true });
    observers.push(parent);
  }
  // Never hold things back for good if the titles get stuck.
  const timer = window.setTimeout(() => {
    if (done) return;
    stop();
    start();
  }, 15000);
  return stop;
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Runs `start` when the main thread is idle (at most `timeout` ms later). */
export function onIdle(start: () => void, timeout = 2000): () => void {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(start, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const timer = window.setTimeout(start, 200);
  return () => window.clearTimeout(timer);
}

/**
 * Like `afterLoad`, but also waits until the opening titles are gone and the
 * main thread is idle: for page scans and other work nothing on the first
 * screen needs, so it never competes with the titles or the first input.
 */
export function afterIntroIdle(start: () => void, delay = 600): () => void {
  let cancelIntro = () => {};
  let cancelIdle = () => {};
  const cancelLoad = afterLoad(() => {
    cancelIntro = whenIntroGone(() => {
      cancelIdle = onIdle(start);
    });
  }, delay);
  return () => {
    cancelLoad();
    cancelIntro();
    cancelIdle();
  };
}
