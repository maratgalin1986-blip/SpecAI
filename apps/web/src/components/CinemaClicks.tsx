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
        'a[href], button, [role="button"], summary',
      );
      if (!target || (target as HTMLButtonElement).disabled) return;
      // Two rings, the second one 80 ms behind.
      ['cine-ring', 'cine-ring cine-ring-2'].forEach((cls) => {
        const ring = document.createElement('span');
        ring.className = cls;
        ring.style.left = `${event.clientX}px`;
        ring.style.top = `${event.clientY}px`;
        document.body.appendChild(ring);
        window.setTimeout(() => ring.remove(), 1000);
      });
      if (event.pointerType === 'touch' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(12);
        } catch {
          /* vibration is optional */
        }
      }
      // Restart the animation on repeated presses without a forced reflow.
      target.classList.remove('cine-press');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          target.classList.add('cine-press');
          window.setTimeout(() => target.classList.remove('cine-press'), 400);
        }),
      );
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  return null;
}
