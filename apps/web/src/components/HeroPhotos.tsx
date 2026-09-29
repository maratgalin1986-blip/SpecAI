'use client';

import { useEffect, useRef, useState } from 'react';
import { MachinePhoto } from '@/components/MachinePhoto';
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
// Real construction footage of the visit's project (see siteObjects.ts); the
// hero opens on it (index -1), then cycles through the machine photos and
// comes back to the footage.

export function HeroPhotos() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(-1);
  const [object, setObject] = useState(SITE_OBJECTS[0]!);
  const video = object.hero;
  const [paused, setPaused] = useState(false);

  // A different project on every visit, chosen after hydration.
  useEffect(() => {
    setObject(currentSiteObject());
  }, []);

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(
      () => setCurrent((i) => (i + 1 >= SLIDES.length ? -1 : i + 1)),
      current === -1 ? VIDEO_MS : SLIDE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [current, paused]);

  useEffect(() => {
    const section = rootRef.current?.parentElement;
    if (!section || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const scrolled = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
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

  const slide = SLIDES[Math.max(0, current)]!;

  return (
    <>
      <div ref={rootRef} className="absolute inset-0 overflow-hidden" aria-hidden>
        <div className="hero-parallax-photo absolute -inset-8">
          <video
            key={video}
            className={`hero-drone absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
              current === -1 ? 'opacity-100' : 'opacity-0'
            }`}
            autoPlay
            muted
            loop
            playsInline
            poster={`/video/${video}.jpg`}
          >
            <source src={`/video/${video}.webm`} type="video/webm" />
            <source src={`/video/${video}.mp4`} type="video/mp4" />
          </video>
          {SLIDES.map((item, index) => (
            <MachinePhoto
              key={item.type}
              type={item.type}
              slot="hero"
              priority={index === 0}
              sizes="(min-width: 1152px) 1200px, 100vw"
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === current ? 'opacity-100' : 'opacity-0'
              }`}
              imgClassName={index === current ? 'hero-kenburns' : ''}
            />
          ))}
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
        href={slide.href}
        className="absolute bottom-5 left-6 z-10 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-slate-400 hover:text-amber-400 sm:left-10 lg:hidden"
      >
        {current === -1 ? 'Стройка онлайн' : MACHINE_LABELS[slide.type]} →
      </a>
      <span className="absolute right-5 top-4 z-10 text-[0.6rem] text-white/50">
        {current === -1 ? `${object.name} · видео для примера` : 'Фото для примера'}
      </span>
    </>
  );
}
