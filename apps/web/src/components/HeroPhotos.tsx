'use client';

import { useEffect, useRef, useState } from 'react';
import { CinemaVideo } from '@/components/CinemaVideo';
import { MachinePhoto } from '@/components/MachinePhoto';
import { useMachineSound } from '@/components/useMachineSound';
import { MACHINE_LABELS, type MachineType } from '@/lib/machinePhotos';
import { currentSiteObject, SITE_OBJECTS } from '@/lib/siteObjects';

// Full-bleed hero backdrop: photos of the machine classes cross-fade with a
// slow push-in; the chips switch machines by hand. Every visit starts on a
// random machine, and each machine shows a random photo variant.
// Depth: the photo layer follows the pointer in the opposite direction to the
// text (with a slight perspective tilt) and zooms in as the hero scrolls away.
// The section gets --hx/--hy (pointer, -1…1) and --hs (scroll, 0…1).
const SLIDES: { type: MachineType; href: string }[] = [
  { type: 'backhoe', href: '/arenda/ekskavator-pogruzchik' },
  { type: 'excavator', href: '/equipment' },
  { type: 'crane', href: '/arenda/avtokran' },
  { type: 'kmu', href: '/equipment' },
  { type: 'loader', href: '/arenda/frontalnyj-pogruzchik' },
  { type: 'truck', href: '/equipment' },
  { type: 'dozer', href: '/equipment' },
  { type: 'agp', href: '/equipment' },
  { type: 'roller', href: '/equipment' },
];

const SLIDE_MS = 6500;
const VIDEO_MS = 12000;
const SOFT_SLIDE_MS = 9000;
// Real construction footage of the visit's project (see siteObjects.ts); the
// hero opens on it (index -1), then cycles through the machine photos and
// comes back to the footage.

export function HeroPhotos() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(-1);
  const [object, setObject] = useState(SITE_OBJECTS[0]!);
  const video = object.hero;
  const [paused, setPaused] = useState(false);
  // The furthest slide that may be mounted: the current one plus the next.
  const [reach, setReach] = useState(0);

  useEffect(() => {
    setReach((value) => Math.max(value, current + 1));
  }, [current]);

  // A different project on every visit, chosen after hydration.
  useEffect(() => {
    setObject(currentSiteObject());
  }, []);

  useEffect(() => {
    if (paused) return;
    // Soft mode («Уменьшение движения»): no footage and no push-in, the
    // machine photos only cross-fade, slower.
    const soft = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (soft && current === -1) {
      setCurrent(0);
      return;
    }
    const timer = window.setTimeout(
      () => setCurrent((i) => (i + 1 >= SLIDES.length ? (soft ? 0 : -1) : i + 1)),
      soft ? SOFT_SLIDE_MS : current === -1 ? VIDEO_MS : SLIDE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [current, paused]);

  useEffect(() => {
    const section = rootRef.current?.parentElement;
    if (!section || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let px = 0;
    let py = 0;
    let written = '';
    const apply = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const scrolled = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
      // Only real changes: each write restyles the whole hero, and below the
      // hero every scroll frame would otherwise write the same values again.
      const next = `${px.toFixed(3)} ${py.toFixed(3)} ${scrolled.toFixed(3)}`;
      if (next === written) return;
      written = next;
      section.style.setProperty('--hx', px.toFixed(3));
      section.style.setProperty('--hy', py.toFixed(3));
      section.style.setProperty('--hs', scrolled.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const rect = section.getBoundingClientRect();
      px = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      py = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      schedule();
    };
    const onPointerLeave = () => {
      px = 0;
      py = 0;
      schedule();
    };
    section.addEventListener('pointermove', onPointerMove);
    section.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('scroll', schedule, { passive: true });
    apply();
    return () => {
      section.removeEventListener('pointermove', onPointerMove);
      section.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Sound (only when the visitor turned it on): the machine on screen revs
  // in as its slide comes up, while the hero is in view.
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), {
      threshold: 0.35,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useMachineSound('hero', current === -1 ? null : SLIDES[current]?.type, inView);

  const slide = SLIDES[Math.max(0, current)]!;

  return (
    <>
      <div ref={rootRef} className="absolute inset-0 overflow-hidden" aria-hidden>
        <div className="hero-parallax-photo absolute -inset-8">
          <div
            className={`absolute inset-0 transition-opacity duration-1000 ${
              current === -1 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <CinemaVideo
              clip={video}
              poster={SITE_OBJECTS[0]!.hero}
              priority
              // Not under the opening titles; on phones after the first touch.
              deferred
              className="hero-drone absolute inset-0 h-full w-full"
            />
          </div>
          {SLIDES.map((item, index) =>
            // Only slides already shown and the next one are mounted, so the
            // photos are not all fetched while the opening footage plays.
            index > reach ? null : (
              <MachinePhoto
                key={item.type}
                type={item.type}
                slot="hero"
                sizes="(min-width: 1152px) 1200px, 100vw"
                className={`absolute inset-0 transition-opacity duration-1000 ${
                  index === current ? 'opacity-100' : 'opacity-0'
                }`}
                imgClassName={index === current ? 'hero-kenburns' : ''}
              />
            ),
          )}
        </div>
        <div className="absolute inset-0 bg-slate-950/45 lg:bg-gradient-to-r lg:from-slate-950/95 lg:via-slate-950/35 lg:to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
        <div className="hero-vignette absolute inset-0" />
      </div>

      <div
        className="absolute bottom-5 right-5 z-10 hidden max-w-lg flex-wrap justify-end gap-2 lg:flex"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {SLIDES.map((item, index) => (
          <button
            key={item.type}
            type="button"
            onClick={() => setCurrent(index)}
            aria-pressed={index === current}
            className={`relative overflow-hidden rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur transition ${
              index === current
                ? 'bg-amber-500 text-slate-950'
                : 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20'
            }`}
          >
            {MACHINE_LABELS[item.type]}
          </button>
        ))}
      </div>
      <a
        href={current === -1 ? '/stroyka' : slide.href}
        className="absolute bottom-3 left-6 z-10 inline-flex min-h-10 items-center font-mono text-[0.65rem] uppercase tracking-[0.2em] text-slate-400 hover:text-amber-400 sm:left-10 lg:hidden"
      >
        {current === -1 ? 'Стройка онлайн' : MACHINE_LABELS[slide.type]} →
      </a>
      <span className="absolute right-5 top-4 z-10 text-[0.6rem] text-white/50">
        {current === -1 ? `${object.name} · видео для примера` : 'Фото для примера'}
      </span>
    </>
  );
}
