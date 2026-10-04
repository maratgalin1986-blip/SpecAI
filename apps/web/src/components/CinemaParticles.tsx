'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { afterIntroIdle, fxAllowed, hydrated, saveDataOn } from '@/lib/cinemaFx';

// Drifting dust and a few sparks over the home hero and every CinemaBand
// photo: one small <canvas> per host, one shared rAF loop (about 30 fps) that
// only runs while a host is on screen and the tab is visible. DPR is capped
// at 2 (1 on touch screens, which also get fewer dots: the soft sprites look
// the same, and the phone composites a quarter of the pixels over the video),
// nothing runs with reduced motion or Save-Data. It starts once the opening
// titles are gone and the main thread is idle.

const HOSTS = '.hero-short, .cine-band';
const MAX_DPR = 2;
const FRAME_MS = 33;

type Dot = { x: number; y: number; vx: number; vy: number; r: number; a: number; spark: boolean };

interface Layer {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dots: Dot[];
  w: number;
  h: number;
  dpr: number;
}

function sprite(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return c;
}

function spawn(w: number, h: number, anywhere: boolean): Dot {
  const spark = Math.random() < 0.22;
  return {
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : h + 10,
    vx: (Math.random() - 0.3) * (spark ? 22 : 8),
    vy: -(spark ? 26 + Math.random() * 40 : 4 + Math.random() * 12),
    r: spark ? 2 + Math.random() * 2.5 : 1.2 + Math.random() * 2.8,
    a: spark ? 0.55 + Math.random() * 0.4 : 0.15 + Math.random() * 0.3,
    spark,
  };
}

export function CinemaParticles() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith('/admin') || !fxAllowed() || saveDataOn()) return;
    const dust = sprite('rgba(255,255,255,0.9)');
    const glow = sprite('rgba(251,191,36,1)');
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const maxDpr = touch ? 1 : MAX_DPR;
    const layers = new Map<HTMLElement, Layer>();
    const live = new Set<Layer>();
    let raf = 0;
    let last = 0;
    let disposed = false;

    const fit = (l: Layer) => {
      const r = l.host.getBoundingClientRect();
      l.dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
      l.w = Math.max(1, r.width);
      l.h = Math.max(1, r.height);
      l.canvas.width = Math.round(l.w * l.dpr);
      l.canvas.height = Math.round(l.h * l.dpr);
    };

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const l = layers.get(e.target as HTMLElement);
        if (l) fit(l);
      }
    });

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const l = layers.get(e.target as HTMLElement);
        if (!l) continue;
        if (e.isIntersecting) live.add(l);
        else live.delete(l);
      }
      kick();
    });

    function draw(now: number) {
      raf = 0;
      if (disposed || document.hidden || live.size === 0) return;
      raf = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      live.forEach((l) => {
        const { ctx, dots } = l;
        ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
        ctx.clearRect(0, 0, l.w, l.h);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < dots.length; i++) {
          const d = dots[i]!;
          d.x += (d.vx + Math.sin(now / 900 + i) * 4) * dt;
          d.y += d.vy * dt;
          if (d.y < -12 || d.x < -12 || d.x > l.w + 12) dots[i] = spawn(l.w, l.h, false);
          const fade = Math.min(1, Math.max(0, d.y / (l.h * 0.25)));
          const tw = d.spark ? 0.6 + 0.4 * Math.sin(now / 90 + i * 3) : 1;
          ctx.globalAlpha = d.a * fade * tw;
          const s = d.r * (d.spark ? 5 : 4);
          ctx.drawImage(d.spark ? glow : dust, d.x - s / 2, d.y - s / 2, s, s);
        }
      });
    }
    function kick() {
      if (!raf && live.size && !document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    }

    function attach(host: HTMLElement) {
      if (layers.has(host) || !hydrated(host)) return;
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.className = 'fx-particles';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Above the photo and its shading, below the content.
      const anchor = host.classList.contains('cine-band')
        ? host.querySelector('.cine-band-bar')
        : (host.firstElementChild?.nextElementSibling ?? null);
      host.insertBefore(canvas, anchor);
      const layer: Layer = { host, canvas, ctx, dots: [], w: 1, h: 1, dpr: 1 };
      fit(layer);
      const n = host.classList.contains('cine-band') ? (touch ? 18 : 30) : touch ? 24 : 40;
      for (let i = 0; i < n; i++) layer.dots.push(spawn(layer.w, layer.h, true));
      layers.set(host, layer);
      ro.observe(host);
      io.observe(host);
    }

    const scan = (root: ParentNode) => root.querySelectorAll<HTMLElement>(HOSTS).forEach(attach);
    let mo: MutationObserver | null = null;
    let scanRaf = 0;
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
    }, 900);

    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      disposed = true;
      cancel();
      mo?.disconnect();
      io.disconnect();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (scanRaf) cancelAnimationFrame(scanRaf);
      document.removeEventListener('visibilitychange', onVis);
      layers.forEach((l) => l.canvas.remove());
    };
  }, [pathname]);

  return null;
}
