'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Finale of the home page: when the block scrolls in, a circular iris opens
// from the centre and reveals the night-site backdrop with the request form.
// Without script, without IntersectionObserver or with reduced motion the
// block is simply shown (the CSS only hides it once `data-iris="armed"`).
// A jump to the form (#callback: the hero CTA, the header button) opens it at
// once, without the transition, so the phone field is usable straight away.
// While the block is on screen the chat button hides (globals.css,
// data-callback-view) so it does not sit over the form.

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
  const [instant, setInstant] = useState(false);

  // A jump to #callback: open now. A repeat tap on the same hash fires no
  // hashchange, hence the click listener as well.
  useEffect(() => {
    const openNow = () => {
      setInstant(true);
      setState('open');
    };
    if (window.location.hash === '#callback') openNow();
    const onHash = () => {
      if (window.location.hash === '#callback') openNow();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      const link = target instanceof Element ? target.closest('a[href$="#callback"]') : null;
      if (!link) return;
      openNow();
      // A link to this page: jump at once instead of the page-wide smooth glide
      // (a second or more on a phone), so the phone field is there to tap.
      const form = document.getElementById('callback');
      const url = new URL((link as HTMLAnchorElement).href, window.location.href);
      if (!form || url.pathname !== window.location.pathname || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      // Layout offsets, not getBoundingClientRect: an entrance animation that
      // scales the page for a moment must not throw the jump off.
      let top = 0;
      for (
        let node: HTMLElement | null = form;
        node;
        node = node.offsetParent as HTMLElement | null
      )
        top += node.offsetTop;
      const margin = parseFloat(getComputedStyle(form).scrollMarginTop) || 0;
      window.scrollTo({ top: Math.max(0, top - margin), behavior: 'instant' });
      if (window.location.hash !== '#callback') window.history.pushState(null, '', '#callback');
    };
    window.addEventListener('hashchange', onHash);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  // The chat button steps aside while the form is on screen.
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new IntersectionObserver((entries) => {
      const inView = entries.some((entry) => entry.isIntersecting);
      if (inView) root.setAttribute('data-callback-view', '');
      else root.removeAttribute('data-callback-view');
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.removeAttribute('data-callback-view');
    };
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Already on screen (anchor jump, reload mid-page): no need to hide it.
    if (
      window.location.hash === '#callback' ||
      node.getBoundingClientRect().top < window.innerHeight * 0.6
    ) {
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
        style={instant ? { transition: 'none' } : undefined}
        className={`cine-iris relative overflow-hidden rounded-[2rem] bg-slate-950 text-white ${className}`}
      >
        <Image
          src={backdrop}
          alt=""
          fill
          sizes="(min-width: 1280px) 1200px, 100vw"
          className="cine-iris-bg object-cover"
          style={instant ? { transition: 'none', transform: 'none' } : undefined}
        />
        <div className="absolute inset-0 bg-slate-950/75" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/60" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
