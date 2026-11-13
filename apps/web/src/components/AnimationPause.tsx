'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Looping effects rest where nobody sees them: every <section> of the page
// that is more than a quarter screen away from the viewport gets
// `data-fx-off`, and the whole page gets `data-tab-hidden` while the tab is
// in the background; motion.css pauses every animation inside
// (animation-play-state), so it resumes from the same frame when seen again.
// On screen nothing changes. Sections that toggle `data-offscreen` for their
// own loops keep doing so; this is a separate attribute.

const MARGIN = '25% 0px';

export function AnimationPause() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.toggleAttribute('data-tab-hidden', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      root.removeAttribute('data-tab-hidden');
    };
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          entry.target.toggleAttribute('data-fx-off', !entry.isIntersecting);
      },
      { rootMargin: MARGIN },
    );
    const watched = new Set<Element>();
    const scan = () => {
      document.querySelectorAll('main section').forEach((section) => {
        if (watched.has(section)) return;
        watched.add(section);
        observer.observe(section);
      });
    };
    scan();
    // Sections that arrive later (lazy blocks of the home page): one rescan
    // per burst of changes.
    let timer = 0;
    const main = document.querySelector('main');
    const mutations = new MutationObserver(() => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        scan();
      }, 400);
    });
    if (main) mutations.observe(main, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      observer.disconnect();
      window.clearTimeout(timer);
      watched.forEach((section) => section.removeAttribute('data-fx-off'));
    };
  }, [pathname]);

  return null;
}
