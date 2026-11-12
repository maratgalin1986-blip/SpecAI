'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { onceInView } from '@/lib/inView';

// Fades its children into place the first time they scroll into view. With
// `stagger`, the direct children rise one after another instead (motion.css,
// .reveal-stagger). Opacity and transform only.
export function Reveal({
  children,
  delay = 0,
  className = '',
  stagger = false,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  stagger?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Not a share of the block: a grid taller than ~6 screens (the catalogue on a phone)
    // never has 15 % of itself on screen and stayed invisible. Any part of the block past
    // the bottom tenth of the viewport reveals it.
    return onceInView(el, () => setIsVisible(true), {
      threshold: 0,
      rootMargin: '0px 0px -10% 0px',
    });
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`reveal ${stagger ? 'reveal-stagger' : ''} ${
        isVisible ? 'reveal-visible' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
