'use client';

import { useEffect, useState } from 'react';

export const JOURNEY_SELECTOR = 'section[aria-label="Путешествие по объекту"]';

// True while the «Путешествие по объекту» section is on screen. The section
// may mount after this hook, so it is looked up again for a few seconds.
export function useJourneyInView(path?: string | null): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    let timer = 0;
    let tries = 0;
    const attach = () => {
      const el = document.querySelector(JOURNEY_SELECTOR);
      if (!el) {
        if (tries++ < 40) timer = window.setTimeout(attach, 250);
        return;
      }
      observer = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) setInView(last.isIntersecting);
      });
      observer.observe(el);
    };
    setInView(false);
    attach();
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [path]);
  return inView;
}
