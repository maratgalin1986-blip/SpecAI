'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExcavatorScene } from '@/lib/excavatorScene';

// Mounts the three.js excavator scene. three.js is loaded lazily so the rest
// of the page renders (and stays interactive) before the 3D kicks in.
export function Hero3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scene: ExcavatorScene | undefined;
    let cancelled = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function onPointerMove(event: PointerEvent) {
      scene?.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    }

    // Stop rendering while the hero is scrolled out of view.
    const visibility = new IntersectionObserver(([entry]) => {
      scene?.setRunning(entry?.isIntersecting ?? true);
    });

    import('@/lib/excavatorScene')
      .then(({ createExcavatorScene }) => {
        if (cancelled) return;
        try {
          scene = createExcavatorScene(container, { reducedMotion });
        } catch {
          return; // No WebGL — the gradient backdrop stays as a fallback.
        }
        setIsReady(true);
        visibility.observe(container);
        window.addEventListener('pointermove', onPointerMove);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      visibility.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      scene?.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={`absolute inset-0 transition-opacity duration-1000 lg:[mask-image:linear-gradient(to_right,transparent,black_18%)] ${isReady ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}
