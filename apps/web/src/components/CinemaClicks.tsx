'use client';

import { useEffect } from 'react';
import { parseAbCookie } from '@/lib/ab';
import { playCue } from '@/lib/sound';

// Every press on the site gets a film-style response: a ring of light spreads
// from the finger or cursor, and the pressed button "clicks" like a clapper.
// Pure decoration: no layout change, off with reduced motion.
const SPARK_TARGET =
  "a[href^='tel:'][class*='rounded'], a[href*='#podbor'][class*='rounded-full'], form button[type='submit']";

// 6-8 sparks fly out of the press point (CSS only: --dx/--dy are the targets).
function burst(x: number, y: number) {
  const n = 6 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const d = 46 + Math.random() * 54;
    const s = document.createElement('span');
    s.className = 'cine-spark';
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(0)}px`);
    s.style.setProperty('--dy', `${(Math.sin(a) * d - 14).toFixed(0)}px`);
    document.body.appendChild(s);
    window.setTimeout(() => s.remove(), 850);
  }
}

// Heavier «thunk» for «Позвонить», «Наряд» and «Отправить».
const THUNK_TARGET = "a[href^='tel:'], a[href*='#podbor'], button[type='submit']";

export function CinemaClicks() {
  // Sound, «по-людски» (owner, 2026-10-06): only for a finished press (a
  // click, not the pointerdown that also starts every scroll), only on real
  // controls — a soft tap for buttons, a wooden thunk for «Позвонить»,
  // «Наряд», «Отправить». Ordinary links stay silent: a page change gets its
  // whoosh from SoundDirector. The engine makes repeated presses quieter.
  // Silent unless sound is on, and independent of the visual effects below.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button > 0) return;
      const target = (event.target as Element | null)?.closest?.(
        'a[href], button, [role="button"], summary',
      );
      if (!target || (target as HTMLButtonElement).disabled) return;
      if (target.matches('[data-sound-toggle]')) return;
      if (target.matches(THUNK_TARGET)) playCue('thunk');
      else if (!target.matches('a[href]')) playCue('click');
    };
    document.addEventListener('click', onClick, { passive: true });
    return () => document.removeEventListener('click', onClick);
  }, []);

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
      // The call / «Наряд» / submit buttons also throw sparks.
      if (target.matches(SPARK_TARGET)) burst(event.clientX, event.clientY);
      // Restart the animation on repeated presses without a forced reflow.
      target.classList.remove('cine-press');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          target.classList.add('cine-press');
          window.setTimeout(() => target.classList.remove('cine-press'), 400);
        }),
      );
    };
    // A short buzz only for a finished tap: pointerdown also starts every
    // scroll gesture, and before the first tap the browser blocks vibrate().
    const onClick = (event: MouseEvent) => {
      if ((event as PointerEvent).pointerType !== 'touch') return;
      if (typeof navigator.vibrate !== 'function') return;
      const target = (event.target as Element | null)?.closest?.(
        'a[href], button, [role="button"], summary',
      );
      if (!target || (target as HTMLButtonElement).disabled) return;
      try {
        navigator.vibrate(12);
      } catch {
        /* vibration is optional */
      }
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('click', onClick, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return null;
}
