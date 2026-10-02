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
