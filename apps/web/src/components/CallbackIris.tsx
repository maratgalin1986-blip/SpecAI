'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Finale of the home page: when the block scrolls in, a circular iris opens
// from the centre and reveals the night-site backdrop with the request form.
// Without script, without IntersectionObserver or with reduced motion the
// block is simply shown (the CSS only hides it once `data-iris="armed"`).

export function CallbackIris({
  children,
  backdrop,
  className = '',
}: {
  children: ReactNode;
  /** Image behind the content, e.g. a night construction photo. */
  backdrop: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'armed' | 'open'>('idle');

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Already on screen (anchor jump, reload mid-page): no need to hide it.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.6) {
      setState('open');
      return;
    }
    setState('armed');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState('open');
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    // The observed wrapper is not clipped itself: a clipped target would
    // never count as intersecting.
    <div ref={ref}>
      <div
        data-iris={state === 'idle' ? undefined : state}
        className={`cine-iris relative overflow-hidden rounded-[2rem] bg-slate-950 text-white ${className}`}
      >
        <Image
          src={backdrop}
          alt=""
          fill
          sizes="(min-width: 1280px) 1200px, 100vw"
          className="cine-iris-bg object-cover"
        />
        <div className="absolute inset-0 bg-slate-950/75" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/60" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
