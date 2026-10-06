'use client';

import { useEffect, useRef } from 'react';
import { onceInView, reducedMotion } from '@/lib/inView';

const format = (n: number) => n.toLocaleString('ru-RU');

// Counts a number up from zero the first time it scrolls into view. Only for
// real numbers from the code (prices from lib/prices.ts, shift hours).
// The server renders the final value (no script, reduced motion and search
// engines see it); the count writes the text node directly, so no React
// render runs per frame, and the box keeps the final width (no reflow).
export function CountUp({ value, duration = 1500 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    let frame = 0;
    let shown = false;
    const show = (n: number) => {
      el.textContent = format(n);
    };
    // Only count if the number is still below the fold: one already on
    // screen at load stays put rather than flashing to zero.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;
    show(0);
    const stop = onceInView(
      el,
      () => {
        shown = true;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          show(Math.round(value * (1 - Math.pow(1 - t, 3))));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    return () => {
      stop();
      cancelAnimationFrame(frame);
      if (!shown) show(value);
    };
  }, [value, duration]);

  // The hidden copy of the final value holds the width of the box (both sit
  // in one grid cell), so the counting digits never push the text around.
  return (
    <span className="inline-grid text-right tabular-nums">
      <span aria-hidden className="invisible [grid-area:1/1]">
        {format(value)}
      </span>
      <span ref={ref} className="[grid-area:1/1]">
        {format(value)}
      </span>
    </span>
  );
}
