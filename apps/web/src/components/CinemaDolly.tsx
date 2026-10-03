'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { afterLoad, fxAllowed, hydrated } from '@/lib/cinemaFx';

// «Camera dolly»: big blocks (main > section, CinemaBand) tilt a little in 3D
// as they enter and leave the viewport, tied to the scroll position, like a
// camera gliding past set pieces. One scroll listener + one rAF for all
// blocks; only blocks on screen are touched; transform only, and the block is
// perfectly flat (no transform at all) in the middle of the screen.

const SKIP =
  '.depth-exit, .reveal, .tilt-wrap, [data-vt-id], [data-c3-skip], [data-no-dolly], [aria-hidden="true"]';
const MAX_ROT = 8;
const DEAD = 0.25;

export function CinemaDolly() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith('/admin') || !fxAllowed()) return;
    const targets = new Set<HTMLElement>();
    const visible = new Set<HTMLElement>();
    let raf = 0;
    let disposed = false;

    function clear(el: HTMLElement) {
      if (el.dataset.dolly) {
        delete el.dataset.dolly;
        el.style.transform = '';
        el.style.willChange = '';
      }
    }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) visible.add(el);
        else {
          visible.delete(el);
          clear(el);
        }
      }
      schedule();
    });

    function paint() {
      raf = 0;
      const h = window.innerHeight;
      const writes: Array<[HTMLElement, number]> = [];
      visible.forEach((el) => {
        // Another effect owns the transform while it flies in.
        if (el.dataset.c3Wait || el.dataset.c3Fly) return;
        const r = el.getBoundingClientRect();
        if (r.height > h * 1.4 || r.width === 0) {
          writes.push([el, 0]);
          return;
        }
        const p = Math.max(
          -1,
          Math.min(1, (r.top + r.height / 2 - h / 2) / (h / 2 + r.height / 2)),
        );
        const k = Math.max(0, (Math.abs(p) - DEAD) / (1 - DEAD));
        writes.push([el, Math.sign(p) * k * k * (3 - 2 * k)]);
      });
      writes.forEach(([el, s]) => {
        const k = Math.abs(s);
        if (k < 0.01) {
          clear(el);
          return;
        }
        el.dataset.dolly = '1';
        el.style.willChange = 'transform';
        el.style.transform = `perspective(1100px) translateZ(${(-70 * k).toFixed(1)}px) rotateX(${(
          s * MAX_ROT
        ).toFixed(2)}deg) scale(${(1 - 0.04 * k).toFixed(4)})`;
      });
    }
    function schedule() {
      if (!raf && visible.size) raf = requestAnimationFrame(paint);
    }

    function register(root: ParentNode) {
      root.querySelectorAll<HTMLElement>('main section').forEach((el) => {
        if (targets.has(el) || el.matches(SKIP)) return;
        // Top-level blocks only: a section inside a section moves with its parent.
        if (el.parentElement?.closest('main section')) return;
        // Pinned storytelling stages and anything holding fixed layers stay put.
        if (el.querySelector('[class*="sticky"], [class*="fixed"], dialog')) return;
        if (!hydrated(el)) return;
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed' || pos === 'sticky') return;
        targets.add(el);
        io.observe(el);
      });
    }

    let mo: MutationObserver | null = null;
    let scanRaf = 0;
    const cancel = afterLoad(() => {
      if (disposed) return;
      register(document);
      const main = document.querySelector('main');
      if (!main) return;
      mo = new MutationObserver(() => {
        if (scanRaf) return;
        scanRaf = requestAnimationFrame(() => {
          scanRaf = 0;
          register(main);
        });
      });
      mo.observe(main, { childList: true, subtree: true });
    }, 700);

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      disposed = true;
      cancel();
      mo?.disconnect();
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (scanRaf) cancelAnimationFrame(scanRaf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      targets.forEach(clear);
    };
  }, [pathname]);

  return null;
}
