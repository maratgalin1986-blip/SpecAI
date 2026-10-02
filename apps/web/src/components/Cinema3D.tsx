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

const FLY_SELECTOR =
  'main section, main article, main figure, main img, main [data-card], main .tilt-wrap';
const HEADING_SELECTOR = 'main h1, main h2';
const TILT_SELECTOR = '[data-card], figure, img';
// Already animated by other effects, or unsafe to transform.
const SKIP_ANCESTOR =
  '.reveal, [class*="cine-"], .tilt-card, .tilt-wrap, [data-vt-id], header, footer, nav, form, dialog, [aria-hidden="true"], [data-c3-skip]';
// Touch press targets: cards, photos and button-like links.
const TOUCH_SELECTOR =
  '[data-card], figure, img, a[class*="rounded"], a.button, a[class*="btn"], button[class*="rounded"]';
// Tilt and parallax only need to stay clear of other effects' own transforms.
const SKIP_DECOR = '[class*="cine-"], .tilt-card, .tilt-wrap, [data-vt-id], [data-c3-skip]';
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const FROM_DESKTOP = 'perspective(1000px) rotateX(12deg) translateY(40px) translateZ(-60px)';
// Phones have no hover effects, so the fly-in carries the cinema there: a
// deeper, more visible move.
const FROM_TOUCH =
  'perspective(900px) rotateX(28deg) translateY(90px) translateZ(-140px) scale(0.9)';
const MAX_TILT = 9;
const TOUCH_TILT = 5;
const STAGGER = 90;
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
  // Own keys only: a for…in here would walk every DOM property of the prototype.
  return Object.keys(el).some((k) => k.startsWith('__reactFiber'));
}

function isFixedOrSticky(el: Element): boolean {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === 'fixed' || p === 'sticky') return true;
  }
  return false;
}

function sizeOk(el: Element, minW: number, minH: number): boolean {
  const r = el.getBoundingClientRect();
  return r.width >= minW && r.height >= minH;
}

function cardLike(el: Element): boolean {
  const cs = getComputedStyle(el);
  return (
    parseFloat(cs.borderTopWidth) > 0 ||
    cs.boxShadow !== 'none' ||
    !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(cs.backgroundColor)
  );
}

// Children of grids, wrapping flex rows and card columns: each flies in on its own.
function collectItems(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>('div, ul, ol, section, dl').forEach((c) => {
    if (c.children.length < 3 || !c.closest('main')) return;
    const cs = getComputedStyle(c);
    const grid = cs.display === 'grid' || cs.display === 'inline-grid';
    const flex = cs.display === 'flex' || cs.display === 'inline-flex';
    const wrap = flex && cs.flexWrap.startsWith('wrap');
    const column = flex && cs.flexDirection.startsWith('column');
    if (!grid && !wrap && !column) return;
    const kids = Array.from(c.children).filter((k): k is HTMLElement => {
      if (!(k instanceof HTMLElement)) return false;
      const p = getComputedStyle(k).position;
      return p !== 'fixed' && p !== 'absolute' && sizeOk(k, 60, 50);
    });
    const counts = new Map<string, number>();
    kids.forEach((k) => counts.set(k.tagName, (counts.get(k.tagName) ?? 0) + 1));
    let tag = '';
    let best = 0;
    counts.forEach((n, t) => {
      if (n > best) {
        best = n;
        tag = t;
      }
    });
    if (best < 3) return;
    kids.forEach((k) => {
      if (k.tagName !== tag) return;
      if (column && !grid && !wrap && !cardLike(k)) return;
      out.push(k);
    });
  });
  return out;
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
          window.setTimeout(play, Math.min(i, 6) * STAGGER);
          i += 1;
        }
      },
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    );

    // Safety net: whatever sits in view after scrolling stops is never left hidden
    // (IntersectionObserver can miss elements inside clipped or pinned stages).
    let sweepTimer = 0;
    const sweep = () => {
      window.clearTimeout(sweepTimer);
      sweepTimer = window.setTimeout(() => {
        const h = vh();
        let i = 0;
        Array.from(pending.keys()).forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.top >= h * 0.9 || r.bottom <= 0) return;
          const play = pending.get(el);
          if (!play) return;
          pending.delete(el);
          io.unobserve(el);
          window.setTimeout(play, Math.min(i++, 6) * STAGGER);
        });
      }, 250);
    };
    window.addEventListener('scroll', sweep, { passive: true });
    cleanups.push(() => {
      window.clearTimeout(sweepTimer);
      window.removeEventListener('scroll', sweep);
    });

    function prepFly(el: HTMLElement) {
      el.dataset.c3Wait = '1';
      el.style.opacity = '0';
      el.style.transform = window.matchMedia('(pointer: coarse)').matches
        ? FROM_TOUCH
        : FROM_DESKTOP;
      pending.set(el, () => {
        delete el.dataset.c3Wait;
        el.dataset.c3Fly = '1';
        el.style.willChange = 'opacity, transform';
        el.style.transition = `opacity 800ms ${EASE}, transform 900ms ${EASE}`;
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
        // Phones get a lighter blur: cheaper to paint, still visible.
        s.style.filter = hoverable ? 'blur(6px)' : 'blur(3px)';
        spans.push(s);
        frag.appendChild(s);
      });
      el.replaceChildren(frag);
      el.dataset.c3Wait = '1';
      pending.set(el, () => {
        delete el.dataset.c3Wait;
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
      // Read every rect first, then write: no forced style recalc per image.
      const moves: Array<[HTMLElement, string]> = [];
      visible.forEach((el) => {
        const amp = drift.get(el);
        if (amp === undefined) return;
        const r = el.getBoundingClientRect();
        const p = Math.max(
          -1,
          Math.min(1, (r.top + r.height / 2 - h / 2) / (h / 2 + r.height / 2)),
        );
        moves.push([el, `0 ${(-p * amp).toFixed(1)}px`]);
      });
      moves.forEach(([el, t]) => {
        el.style.translate = t;
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
      const items = new Set(collectItems(root));
      const list = new Set(
        root.querySelectorAll<HTMLElement>(`${HEADING_SELECTOR}, ${FLY_SELECTOR}`),
      );
      items.forEach((i) => list.add(i));
      const ordered = Array.from(list).sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
      ordered.forEach((el) => {
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
          ) &&
          // A tilt wrapper is the flying part of a tilt card: only its ancestors count.
          !(
            el.classList.contains('tilt-wrap') &&
            !el.parentElement?.closest(SKIP_ANCESTOR) &&
            !el.querySelector('[data-vt-id]')
          )
        )
          return;
        // A section that holds flying cards stays put: the cards carry the motion.
        if (el.matches('section, article') && !items.has(el)) {
          for (const it of items) if (el !== it && el.contains(it)) return;
        }
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
    let amount = MAX_TILT;
    let touching = false;
    function touchTarget(t: EventTarget | null): HTMLElement | null {
      if (!(t instanceof Element)) return null;
      const main = t.closest('main');
      if (!main) return null;
      const el = t.closest<HTMLElement>(TOUCH_SELECTOR);
      if (!el || !main.contains(el)) return null;
      const isLink = el.matches('a, button');
      const box = isLink
        ? el
        : (el.closest<HTMLElement>('[data-card]') ?? el.closest<HTMLElement>('figure') ?? el);
      if (box.closest(`${SKIP_DECOR}, header, nav, form, dialog`) || hasVt(box)) return null;
      if (pending.has(box) || box.dataset.c3Fly) return null;
      const r = box.getBoundingClientRect();
      if (r.width < (isLink ? 60 : 120) || r.height < (isLink ? 30 : 90) || r.width > 900)
        return null;
      return box;
    }
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
        'position:absolute;left:0;top:0;width:320px;height:320px;margin:-160px 0 0 -160px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.35),rgba(255,255,255,0));will-change:transform';
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
      const t = `perspective(900px) rotateX(${((0.5 - y) * 2 * amount).toFixed(2)}deg) rotateY(${((x - 0.5) * 2 * amount).toFixed(2)}deg)${touching ? ' scale(0.985)' : ''}`;
      active.style.transform = t;
      glare.style.transform = t;
      blob.style.transform = `translate(${(x * r.width).toFixed(0)}px, ${(y * r.height).toFixed(0)}px)`;
    }
    function engage(box: HTMLElement | null, ms: number) {
      release(active);
      active = box;
      if (!box) return;
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
      box.style.transition = `transform ${ms}ms ease-out`;
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (touching) return;
      const box = tiltTarget(e.target);
      if (box !== active) {
        amount = MAX_TILT;
        engage(box, 120);
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

    /* ---------- touch: the pressed card leans towards the finger ---------- */
    let letGo = 0;
    const touchEnd = () => {
      window.clearTimeout(letGo);
      touching = false;
      const el = active;
      active = null;
      release(el);
    };
    // A tap is over in ~80 ms; hold the lean long enough to be seen.
    const touchUp = () => {
      window.clearTimeout(letGo);
      letGo = window.setTimeout(touchEnd, 160);
    };
    const onTouchDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touchEnd();
      const box = touchTarget(e.target);
      if (!box) return;
      touching = true;
      amount = TOUCH_TILT;
      engage(box, 90);
      tx = e.clientX;
      ty = e.clientY;
      if (!tilt) tilt = requestAnimationFrame(frame);
    };
    const onTouchMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !touching || !active) return;
      tx = e.clientX;
      ty = e.clientY;
      if (!tilt) tilt = requestAnimationFrame(frame);
    };
    if (!saveData) {
      document.addEventListener('pointerdown', onTouchDown, { passive: true });
      document.addEventListener('pointermove', onTouchMove, { passive: true });
      document.addEventListener('pointerup', touchUp, { passive: true });
      document.addEventListener('pointercancel', touchEnd, { passive: true });
      window.addEventListener('scroll', touchEnd, { passive: true });
      window.addEventListener('pageswap', touchEnd);
      cleanups.push(() => {
        window.clearTimeout(letGo);
        document.removeEventListener('pointerdown', onTouchDown);
        document.removeEventListener('pointermove', onTouchMove);
        document.removeEventListener('pointerup', touchUp);
        document.removeEventListener('pointercancel', touchEnd);
        window.removeEventListener('scroll', touchEnd);
        window.removeEventListener('pageswap', touchEnd);
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
