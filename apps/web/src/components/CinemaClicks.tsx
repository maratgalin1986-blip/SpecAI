'use client';

import { useEffect } from 'react';
import { parseAbCookie } from '@/lib/ab';

// Every press on the site gets a film-style response: a ring of light spreads
// from the finger or cursor, and the pressed button "clicks" like a clapper.
// Pure decoration: no layout change, off with reduced motion.
export function CinemaClicks() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // A/B group «calm»: no click effects.
    if (parseAbCookie(document.cookie) === 'calm') return;
    const onDown = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest?.(
        'a[href], button, [role="button"], summary, label',
      );
      if (!target || (target as HTMLButtonElement).disabled) return;
      const ring = document.createElement('span');
      ring.className = 'cine-ring';
      ring.style.left = `${event.clientX}px`;
      ring.style.top = `${event.clientY}px`;
      document.body.appendChild(ring);
      window.setTimeout(() => ring.remove(), 650);
      target.classList.remove('cine-press');
      // Restart the animation on repeated presses.
      void (target as HTMLElement).offsetWidth;
      target.classList.add('cine-press');
      window.setTimeout(() => target.classList.remove('cine-press'), 400);
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  return null;
}
