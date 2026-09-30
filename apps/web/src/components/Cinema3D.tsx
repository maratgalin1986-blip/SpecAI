'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// One lightweight effects layer for every page, no per-page edits:
//  1. 3D fly-in of sections, cards, figures and images as they scroll in;
//  2. «title sequence» for h1/h2 (words rise from blur to sharp);
//  3. pointer tilt with a soft glare on images, cards and photo figures;
//  4. gentle scroll parallax on large images.
// Transform/opacity only (plus a short blur on headings), everything plays once,
// nothing is hidden until JS runs, and reduced motion switches the layer off.

const FLY_SELECTOR = 'main section, main article, main figure, main img, main [data-card]';
const HEADING_SELECTOR = 'main h1, main h2';
const TILT_SELECTOR = '[data-card], figure, img';
// Already animated by other effects, or unsafe to transform.
const SKIP_ANCESTOR =
  '.reveal, [class*="cine-"], .tilt-card, .tilt-wrap, [data-vt-id], header, footer, nav, form, dialog, [aria-hidden="true"], [data-c3-skip]';
// Tilt and parallax only need to stay clear of other effects' own transforms.
const SKIP_DECOR = '[class*="cine-"], .tilt-card, .tilt-wrap, [data-vt-id], [data-c3-skip]';
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const FROM = 'perspective(1000px) rotateX(12deg) translateY(40px) translateZ(-60px)';
const MAX_TILT = 6;
const MAX_DRIFT = 20;

// Elements handled once per page load, across route changes.
const seen = new WeakSet<Element>();

function hasVt(el: Element): boolean {
  const v = (el as HTMLElement).style?.viewTransitionName;
  if (v && v !== 'none') return true;
  return (
    !!el.closest('[data-vt-id]') ||
    !!el.querySelector('[data-vt-id], [style*="view-transition-name"]')
  );
}

// React tags DOM nodes once hydrated; touching them earlier breaks hydration.
function hydrated(el: Element): boolean {
  for (const k in el) if (k.startsWith('__reactFiber')) return true;
  return false;
}

function isFixedOrSticky(el: Element): boolean {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === 'fixed' || p === 'sticky') return true;
  }
  return false;
}

export function Cinema3D() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith('/admin')) return;
    const mq = window.matchMedia.bind(window);
    if (mq('(prefers-reduced-motion: reduce)').matches) return;

    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const saveData = !!conn?.saveData;
    const fine = mq('(pointer: fine)').matches;
    const hoverable = mq('(hover: hover)').matches;
    const vh = () => window.innerHeight;

    const cleanups: Array<() => void> = [];
    let disposed = false;

    /* ---------- fly-in + headings: one observer ---------- */
    const pending = new Map<Element, () => void>();
    const io = new IntersectionObserver(
      (entries) => {
        // Elements revealed in the same batch get a short stagger.
        let i = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const play = pending.get(entry.target);
          if (!play) continue;
          pending.delete(entry.target);
          io.unobserve(entry.target);
          window.setTimeout(play, Math.min(i, 5) * 70);
          i += 1;
        }
      },
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    );

    function prepFly(el: HTMLElement) {
      el.style.opacity = '0';
      el.style.transform = FROM;
      pending.set(el, () => {
        el.dataset.c3Fly = '1';
        el.style.willChange = 'opacity, transform';
        el.style.transition = `opacity 700ms ${EASE}, transform 700ms ${EASE}`;
        el.style.opacity = '';
        el.style.transform = '';
        const done = () => {
          delete el.dataset.c3Fly;
          el.style.transition = '';
          el.style.willChange = '';
        };
        el.addEventListener('transitionend', (ev) => {
          if (ev.target === el && ev.propertyName === 'transform') done();
        });
        window.setTimeout(done, 900);
      });
    }

    function prepHeading(el: HTMLElement): boolean {
      const only = el.childNodes.length === 1 ? el.firstChild : null;
      if (!only || only.nodeType !== Node.TEXT_NODE) return false;
      const words = (only.textContent ?? '').split(/\s+/).filter(Boolean);
      if (words.length === 0 || words.length > 14) return false;
      const frag = document.createDocumentFragment();
      const spans: HTMLElement[] = [];
      words.forEach((w, idx) => {
        if (idx > 0) frag.appendChild(document.createTextNode(' '));
        const s = document.createElement('span');
        s.textContent = w;
        s.style.display = 'inline-block';
        s.style.opacity = '0';
        s.style.transform = 'translateY(0.6em)';
        if (hoverable) s.style.filter = 'blur(6px)';
        spans.push(s);
        frag.appendChild(s);
      });
      el.replaceChildren(frag);
      pending.set(el, () => {
        spans.forEach((s, idx) => {
          const d = `${idx * 55}ms`;
          s.style.willChange = 'opacity, transform';
          s.style.transition = `opacity 650ms ${EASE} ${d}, transform 650ms ${EASE} ${d}, filter 650ms ${EASE} ${d}`;
          s.style.opacity = '';
          s.style.transform = '';
          s.style.filter = '';
        });
        window.setTimeout(
          () =>
            spans.forEach((s) => {
              s.style.transition = '';
              s.style.willChange = '';
            }),
          650 + spans.length * 55 + 100,
        );
      });
      return true;
    }

    /* ---------- parallax: one scroll listener, one rAF ---------- */
    const drift = new Map<HTMLElement, number>();
    const visible = new Set<HTMLElement>();
    let pio: IntersectionObserver | null = null;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const h = vh();
      visible.forEach((el) => {
        const amp = drift.get(el);
        if (amp === undefined) return;
        const r = el.getBoundingClientRect();
        const p = Math.max(
          -1,
          Math.min(1, (r.top + r.height / 2 - h / 2) / (h / 2 + r.height / 2)),
        );
        el.style.translate = `0 ${(-p * amp).toFixed(1)}px`;
      });
    };
    const schedule = () => {
      if (!raf && visible.size) raf = requestAnimationFrame(paint);
    };
    function prepParallax(el: HTMLElement, r: DOMRect) {
      if (saveData || !(el instanceof HTMLImageElement) || hasVt(el)) return;
      if (r.width < 300 || r.height < 180) return;
      if (!pio) {
        pio = new IntersectionObserver((entries) => {
          for (const e of entries) {
            const t = e.target as HTMLElement;
            if (e.isIntersecting) visible.add(t);
            else visible.delete(t);
          }
          schedule();
        });
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule, { passive: true });
      }
      const amp = Math.min(MAX_DRIFT, r.height * 0.05);
      const parent = el.parentElement;
      // Inside a clipped frame, zoom slightly so the drift never shows a gap.
      if (parent && getComputedStyle(parent).overflow !== 'visible') {
        el.style.scale = String(1 + (2 * amp) / r.height + 0.01);
      }
      drift.set(el, amp);
      pio.observe(el);
    }

    /* ---------- scan ---------- */
    let retryTimer = 0;
    let retry = false;
    let tries = 0;
    function scan(root: ParentNode) {
      if (disposed) return;
      const h = vh();
      retry = false;
      root.querySelectorAll<HTMLElement>(`${HEADING_SELECTOR}, ${FLY_SELECTOR}`).forEach((el) => {
        if (seen.has(el)) return;
        if (!hydrated(el)) {
          retry = true;
          return;
        }
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const isHeading = el.matches(HEADING_SELECTOR);
        if (!isHeading && !el.closest(SKIP_DECOR) && !el.closest('header, nav, form, dialog')) {
          if (!isFixedOrSticky(el)) prepParallax(el, r);
        }
        // Headings only avoid elements that animate their own text.
        if (
          el.closest(
            isHeading
              ? '[class*="cine-"], [data-vt-id], header, nav, [data-c3-skip]'
              : SKIP_ANCESTOR,
          )
        )
          return;
        // Already on screen at load (or above): never delay LCP or cause layout shift.
        if (r.top < h * 0.95) return;
        // Tall scroll-stage containers (sticky storytelling) are never hidden.
        if (r.height > h * 1.5) return;
        if (hasVt(el) || isFixedOrSticky(el)) return;
        // Descendants of an element that is still hidden come in with it.
        for (
          let a = el.parentElement;
          !isHeading && a && a !== document.body;
          a = a.parentElement
        ) {
          if (pending.has(a)) return;
        }
        if (isHeading) {
          if (!prepHeading(el)) return;
        } else {
          prepFly(el);
        }
        io.observe(el);
      });
      if (retry && tries++ < 20) retryTimer = window.setTimeout(() => scan(root), 400);
    }

    /* ---------- tilt + glare: one delegated pointermove ---------- */
    let glare: HTMLDivElement | null = null;
    let blob: HTMLDivElement | null = null;
    let active: HTMLElement | null = null;
    let tx = 0;
    let ty = 0;
    let tilt = 0;
    function tiltTarget(t: EventTarget | null): HTMLElement | null {
      if (!(t instanceof Element)) return null;
      const main = t.closest('main');
      if (!main) return null;
      const el = t.closest<HTMLElement>(TILT_SELECTOR);
      if (!el || !main.contains(el)) return null;
      const box = el.closest<HTMLElement>('[data-card]') ?? el.closest<HTMLElement>('figure') ?? el;
      if (box.closest(`${SKIP_DECOR}, header, nav, form, dialog`) || hasVt(box)) return null;
      // Still flying in.
      if (pending.has(box) || box.dataset.c3Fly) return null;
      const r = box.getBoundingClientRect();
      if (r.width < 120 || r.height < 90 || r.width > 900) return null;
      return box;
    }
    function ensureGlare() {
      if (glare) return;
      glare = document.createElement('div');
      glare.setAttribute('aria-hidden', 'true');
      glare.style.cssText =
        'position:fixed;left:0;top:0;pointer-events:none;overflow:hidden;z-index:30;opacity:0;transition:opacity .25s';
      blob = document.createElement('div');
      blob.style.cssText =
        'position:absolute;left:0;top:0;width:320px;height:320px;margin:-160px 0 0 -160px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.28),rgba(255,255,255,0));will-change:transform';
      glare.appendChild(blob);
      document.body.appendChild(glare);
    }
    function release(el: HTMLElement | null) {
      if (!el) return;
      el.style.transition = `transform 350ms ${EASE}`;
      el.style.transform = '';
      el.style.willChange = '';
      if (glare) glare.style.opacity = '0';
      window.setTimeout(() => {
        if (el !== active) el.style.transition = '';
      }, 400);
    }
    function frame() {
      tilt = 0;
      if (!active || !glare || !blob) return;
      const r = active.getBoundingClientRect();
      // The rect includes the current tilt; it is tiny at 6deg.
      const x = Math.max(0, Math.min(1, (tx - r.left) / r.width));
      const y = Math.max(0, Math.min(1, (ty - r.top) / r.height));
      const t = `perspective(900px) rotateX(${((0.5 - y) * 2 * MAX_TILT).toFixed(2)}deg) rotateY(${((x - 0.5) * 2 * MAX_TILT).toFixed(2)}deg)`;
      active.style.transform = t;
      glare.style.transform = t;
      blob.style.transform = `translate(${(x * r.width).toFixed(0)}px, ${(y * r.height).toFixed(0)}px)`;
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const box = tiltTarget(e.target);
      if (box !== active) {
        release(active);
        active = box;
        if (box) {
          ensureGlare();
          const r = box.getBoundingClientRect();
          if (glare) {
            glare.style.width = `${r.width}px`;
            glare.style.height = `${r.height}px`;
            glare.style.left = `${r.left}px`;
            glare.style.top = `${r.top}px`;
            glare.style.borderRadius = getComputedStyle(box).borderRadius;
            glare.style.opacity = '1';
          }
          box.style.willChange = 'transform';
          box.style.transition = 'transform 120ms ease-out';
        }
      }
      if (!active) return;
      tx = e.clientX;
      ty = e.clientY;
      if (!tilt) tilt = requestAnimationFrame(frame);
    };
    const flatten = () => {
      const el = active;
      active = null;
      release(el);
    };
    if (fine && hoverable && !saveData) {
      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerdown', flatten, { passive: true });
      document.documentElement.addEventListener('pointerleave', flatten, { passive: true });
      // Cross-document view transitions snapshot the page: leave it flat.
      window.addEventListener('pageswap', flatten);
      window.addEventListener('scroll', flatten, { passive: true });
      cleanups.push(() => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerdown', flatten);
        document.documentElement.removeEventListener('pointerleave', flatten);
        window.removeEventListener('pageswap', flatten);
        window.removeEventListener('scroll', flatten);
        if (tilt) cancelAnimationFrame(tilt);
        glare?.remove();
      });
    }

    /* ---------- boot: after load, once React has finished hydrating ---------- */
    let mo: MutationObserver | null = null;
    let scanRaf = 0;
    const start = () => {
      if (disposed) return;
      scan(document);
      const main = document.querySelector('main');
      if (!main) return;
      // Client-side navigations and late content.
      mo = new MutationObserver(() => {
        if (scanRaf) return;
        scanRaf = requestAnimationFrame(() => {
          scanRaf = 0;
          scan(main);
        });
      });
      mo.observe(main, { childList: true, subtree: true });
    };
    let timer = 0;
    const boot = () => {
      timer = window.setTimeout(start, 400);
    };
    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot, { once: true });

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearTimeout(retryTimer);
      window.removeEventListener('load', boot);
      mo?.disconnect();
      io.disconnect();
      pio?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (scanRaf) cancelAnimationFrame(scanRaf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      // Never leave content hidden if the layer is torn down mid-way.
      pending.forEach((play) => play());
      pending.clear();
      cleanups.forEach((c) => c());
    };
  }, [pathname]);

  return null;
}
