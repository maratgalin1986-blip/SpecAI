'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { playCue } from '@/lib/sound';
import { currentShowLevel, type ShowLevel } from '@/lib/showGate';

// The runtime of the «show» layer (app/show.css, lib/showGate.ts). It lives in
// the lazy cinema chunk, so it adds nothing to a page's first-load JS.
//  - keeps <html data-show> right after client-side page changes (the inline
//    script in layout.tsx sets it for the first load);
//  - the scroll line at the top of the page;
//  - parallax for [data-parallax] decor and a «live» flag for .show-stage, so
//    ambient loops run only while their section is on screen;
//  - the magnetic pull of main buttons (mouse only), a soft click on in-page
//    main buttons.
// One passive scroll listener and one rAF for all of it; everything moves by
// transform/translate/opacity only.

const MAGNET =
  "[data-magnet], main a.cab-action, main a.show-cta, main a[href^='tel:'][class*='rounded-full']";
const MAGNET_MAX = 5; // px, at the edge of the button

export function ShowRuntime() {
  const pathname = usePathname();
  const level = useRef<ShowLevel | null>(null);
  const bar = useRef<HTMLElement>(null);

  // Level for this page: set on <html>, removed where there is no show.
  useEffect(() => {
    const next = currentShowLevel(pathname);
    level.current = next;
    const root = document.documentElement;
    if (next) root.setAttribute('data-show', next);
    else root.removeAttribute('data-show');
  }, [pathname]);

  // Scroll line, parallax, live flags.
  useEffect(() => {
    const lvl = currentShowLevel(pathname);
    if (!lvl || lvl === 'off') return;
    let raf = 0;
    let stages: HTMLElement[] = [];
    let drifters: Array<{ el: HTMLElement; k: number }> = [];

    const collect = () => {
      stages = Array.from(document.querySelectorAll<HTMLElement>('.show-stage'));
      drifters = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]')).map(
        (el) => ({ el, k: Number(el.dataset.parallax) || 0.1 }),
      );
    };

    const paint = () => {
      raf = 0;
      const h = window.innerHeight;
      const doc = document.documentElement;
      const max = doc.scrollHeight - h;
      const fill = bar.current;
      if (fill) {
        // A short page needs no progress line.
        const p = max > h * 0.8 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        fill.style.transform = `scaleX(${p.toFixed(4)})`;
      }
      if (lvl === 'full') {
        for (const stage of stages) {
          const r = stage.getBoundingClientRect();
          stage.dataset.live = r.bottom > 0 && r.top < h ? '1' : '0';
        }
        for (const { el, k } of drifters) {
          const r = el.getBoundingClientRect();
          if (r.bottom < -200 || r.top > h + 200) continue;
          // Centre of the decor against the centre of the screen.
          const off = (r.top + r.height / 2 - h / 2) * -k;
          el.style.setProperty('--py', `${off.toFixed(1)}px`);
        }
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    collect();
    schedule();
    // Streamed sections arrive a little later.
    const timers = [window.setTimeout(collect, 800), window.setTimeout(collect, 2600)];
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      timers.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  // Magnetic main buttons (mouse only) and a soft click on in-page ones.
  useEffect(() => {
    const lvl = currentShowLevel(pathname);
    if (!lvl || lvl === 'off') return;
    let current: HTMLElement | null = null;
    let frame = 0;

    const release = (el: HTMLElement) => {
      el.dataset.magnet = 'off';
      if (typeof el.animate === 'function' && el.style.translate) {
        el.animate(
          { translate: [el.style.translate, '0 0'] },
          { duration: 280, easing: 'ease-out' },
        );
      }
      el.style.translate = '';
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || lvl !== 'full') return;
      const el = (event.target as Element | null)?.closest?.<HTMLElement>(MAGNET) ?? null;
      if (el !== current) {
        if (current) release(current);
        current = el;
        if (el) el.dataset.magnet = 'on';
      }
      if (!el) return;
      const { clientX, clientY } = event;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (clientX - (r.left + r.width / 2)) / (r.width / 2);
        const y = (clientY - (r.top + r.height / 2)) / (r.height / 2);
        const cl = (v: number) => Math.max(-1, Math.min(1, v));
        el.style.translate = `${(cl(x) * MAGNET_MAX).toFixed(1)}px ${(cl(y) * MAGNET_MAX).toFixed(1)}px`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      if (current) release(current);
      current = null;
    };
    // A main button that stays on the page (a link to #anchor) answers with a
    // soft click; going to another page already has the whoosh, a phone call
    // and a form's send button have the thunk (CinemaClicks).
    const onClick = (event: MouseEvent) => {
      if (event.button > 0) return;
      const a = (event.target as Element | null)?.closest?.<HTMLAnchorElement>(
        'a.cab-action, a.show-cta',
      );
      if (a && a.getAttribute('href')?.startsWith('#')) playCue('click');
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.addEventListener('click', onClick, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('click', onClick);
      cancelAnimationFrame(frame);
      onLeave();
    };
  }, [pathname]);

  const lvl = currentShowLevel(pathname);
  if (!lvl || lvl === 'off') return null;
  return (
    <div className="show-progress" aria-hidden>
      <i ref={bar} />
    </div>
  );
}
