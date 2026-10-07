'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { afterIntroIdle, afterLoad, fxAllowed, hydrated } from '@/lib/cinemaFx';

// Title-sequence extras, all transform/opacity/clip/blur and all one-shot:
//  - home hero: the h1 «slams» in with a short camera shake (CSS plays it at
//    load; replayed here when the intro splash was covering it) and a light
//    sweep (lens flare) crosses the hero every ~8 s while it is on screen;
//  - every h2 in main: «film gate», a letterbox mask opens with a slight
//    slide when the heading scrolls in;
//  - images below the fold: a quick «focus pull» (blur to sharp);
//  - client-side page changes: a short 3D push-in of main (full page loads get
//    theirs from CSS, see «Page enter» in globals.css). (A full page load
//    already has the curtain or the view transition, so nothing is stacked.)
// Nothing is hidden before it is armed, armed elements are revealed by the
// observer, by a scroll-stop sweep, and at the latest on teardown.

const EASE = 'cubic-bezier(.2,.8,.2,1)';
const GATE_SKIP = 'header, nav, footer, dialog, [data-vt-id], [data-c3-skip], [aria-hidden="true"]';
const IMG_SKIP = `${GATE_SKIP}, [class*="cine-"], .hero-short, .tilt-wrap, form`;

type Mode = 'gate' | 'focus';

export function CinemaFx() {
  const pathname = usePathname();
  const first = useRef(true);

  /* ---------- page push-in on client-side navigation ---------- */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (pathname?.startsWith('/admin') || !fxAllowed()) return;
    const de = document.documentElement;
    try {
      if (de.hasAttribute('data-vt') || de.matches(':active-view-transition')) return;
    } catch {
      /* selector unsupported: nothing to coordinate with */
    }
    const main = document.querySelector('main');
    if (!main || typeof main.animate !== 'function') return;
    main.animate(
      [
        { transform: 'perspective(1200px) translateZ(-120px)', opacity: 0.55 },
        { transform: 'perspective(1200px) translateZ(0)', opacity: 1 },
      ],
      { duration: 450, easing: EASE },
    );
  }, [pathname]);

  /* ---------- hero slam, flare, gates, focus pulls ---------- */
  useEffect(() => {
    if (pathname?.startsWith('/admin') || !fxAllowed()) return;
    let disposed = false;
    const cleanups: Array<() => void> = [];

    /* hero */
    function hero() {
      const section = document.querySelector<HTMLElement>('.hero-short');
      if (!section || !hydrated(section)) return;
      const h1 = section.querySelector<HTMLElement>('h1');
      // The slam already played at load (CSS); when the intro splash covered
      // it, play it again as soon as the splash is gone.
      const intro = document.getElementById('intro');
      if (h1 && intro && !intro.hidden && typeof h1.animate === 'function') {
        let n = 0;
        const t = window.setInterval(() => {
          const gone =
            !document.getElementById('intro') || document.getElementById('intro')!.hidden;
          if (!gone && n++ < 50) return;
          window.clearInterval(t);
          if (disposed) return;
          h1.animate(
            [
              { transform: 'scale(1.4)', opacity: 0 },
              { transform: 'scale(0.98)', opacity: 1, offset: 0.65 },
              { transform: 'scale(1)', opacity: 1 },
            ],
            { duration: 650, easing: EASE },
          );
          const shake = [
            { translate: '0 0' },
            { translate: '-4px 3px', offset: 0.2 },
            { translate: '4px -3px', offset: 0.4 },
            { translate: '-3px -2px', offset: 0.6 },
            { translate: '2px 2px', offset: 0.8 },
            { translate: '0 0' },
          ];
          section
            .querySelectorAll<HTMLElement>('.hero-parallax-photo, .hero-parallax-text')
            .forEach((el) => el.animate(shake, { duration: 150, delay: 380 }));
        }, 120);
        cleanups.push(() => window.clearInterval(t));
      }
      // Lens flare: a light band every ~8 s, paused while off screen.
      const flare = document.createElement('div');
      flare.className = 'fx-flare';
      flare.setAttribute('aria-hidden', 'true');
      flare.dataset.paused = '1';
      section.insertBefore(flare, section.children[1] ?? null);
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) flare.dataset.paused = e.isIntersecting ? '0' : '1';
      });
      io.observe(section);
      cleanups.push(() => {
        io.disconnect();
        flare.remove();
      });
    }

    /* gates + focus pulls: one observer, one sweep */
    const pending = new Map<HTMLElement, Mode>();
    const seen = new WeakSet<Element>();
    const play = (el: HTMLElement, mode: Mode) => {
      pending.delete(el);
      io.unobserve(el);
      if (mode === 'gate') {
        el.dataset.fxGate = 'go';
        window.setTimeout(() => delete el.dataset.fxGate, 1000);
      } else {
        // While the 3D fly-in owns the image's transform, only pull the focus.
        const plain = el.dataset.c3Wait || el.dataset.c3Fly || el.style.transform;
        el.dataset.fxFocus = plain ? 'go-f' : 'go';
        window.setTimeout(() => delete el.dataset.fxFocus, 900);
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        let i = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          const mode = pending.get(el);
          if (!mode) continue;
          window.setTimeout(() => !disposed && play(el, mode), Math.min(i++, 4) * 70);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    let sweepTimer = 0;
    const sweep = () => {
      window.clearTimeout(sweepTimer);
      sweepTimer = window.setTimeout(() => {
        const h = window.innerHeight;
        Array.from(pending).forEach(([el, mode]) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || (r.top < h * 0.95 && r.bottom > 0)) play(el, mode);
        });
      }, 250);
    };
    window.addEventListener('scroll', sweep, { passive: true });

    function arm(el: HTMLElement, mode: Mode) {
      el.dataset[mode === 'gate' ? 'fxGate' : 'fxFocus'] = 'wait';
      pending.set(el, mode);
      io.observe(el);
    }

    let retryTimer = 0;
    let tries = 0;
    function scan(root: ParentNode) {
      if (disposed) return;
      const h = window.innerHeight;
      let retry = false;
      // Measure everything first, then arm: arming changes styles, and a
      // measurement after each change would force a layout per element.
      const armed: Array<[HTMLElement, Mode]> = [];
      root.querySelectorAll<HTMLElement>('main h2, main img').forEach((el) => {
        if (seen.has(el)) return;
        if (!hydrated(el)) {
          retry = true;
          return;
        }
        seen.add(el);
        const r = el.getBoundingClientRect();
        // Never above the fold or already visible: no hidden LCP, no shift.
        if (r.width === 0 || r.top < h * 0.95) return;
        if (el instanceof HTMLImageElement) {
          if (el.closest(IMG_SKIP) || el.fetchPriority === 'high' || el.loading === 'eager') return;
          if (r.width < 80 || r.height < 60) return;
          // Very large images: skip (LCP candidates, and expensive to blur).
          if (r.width >= 900 || r.width * r.height > 0.4 * window.innerWidth * h) return;
          armed.push([el, 'focus']);
        } else {
          if (el.closest(GATE_SKIP) || r.height > h * 0.8) return;
          armed.push([el, 'gate']);
        }
      });
      armed.forEach(([el, mode]) => arm(el, mode));
      if (retry && tries++ < 20) retryTimer = window.setTimeout(() => scan(root), 400);
    }

    let mo: MutationObserver | null = null;
    let scanRaf = 0;
    // The hero extras are cheap and timed to the titles; the page scan reads
    // the layout of every heading and image, so it waits until the titles are
    // gone and the main thread is idle.
    const cancelHero = afterLoad(() => {
      if (!disposed) hero();
    }, 650);
    const cancel = afterIntroIdle(() => {
      if (disposed) return;
      scan(document);
      const main = document.querySelector('main');
      if (!main) return;
      mo = new MutationObserver(() => {
        if (scanRaf) return;
        scanRaf = requestAnimationFrame(() => {
          scanRaf = 0;
          scan(main);
        });
      });
      mo.observe(main, { childList: true, subtree: true });
    }, 650);

    return () => {
      disposed = true;
      cancelHero();
      cancel();
      mo?.disconnect();
      io.disconnect();
      window.clearTimeout(sweepTimer);
      window.clearTimeout(retryTimer);
      if (scanRaf) cancelAnimationFrame(scanRaf);
      window.removeEventListener('scroll', sweep);
      // Never leave anything armed (hidden or blurred) behind.
      pending.forEach((_m, el) => {
        delete el.dataset.fxGate;
        delete el.dataset.fxFocus;
      });
      pending.clear();
      cleanups.forEach((c) => c());
    };
  }, [pathname]);

  return null;
}
