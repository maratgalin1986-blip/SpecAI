'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

// Full-bleed hero backdrop: photos of the machine classes cross-fade with a
// slow push-in; the chips switch machines by hand. Illustrative photos.
const SLIDES = [
  {
    src: '/images/backhoe.jpg',
    label: 'Экскаватор-погрузчик',
    href: '/arenda/ekskavator-pogruzchik',
  },
  { src: '/images/crane.jpg', label: 'Автокран', href: '/arenda/avtokran' },
  {
    src: '/images/loader.jpg',
    label: 'Фронтальный погрузчик',
    href: '/arenda/frontalnyj-pogruzchik',
  },
  { src: '/images/truck.jpg', label: 'Самосвал', href: '/equipment' },
  { src: '/images/dozer.jpg', label: 'Бульдозер', href: '/equipment' },
];

const SLIDE_MS = 6500;

export function HeroPhotos() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => setCurrent((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [current, paused]);

  return (
    <>
      <div className="absolute inset-0" aria-hidden>
        {SLIDES.map((slide, index) => (
          <Image
            key={slide.src}
            src={slide.src}
            alt=""
            fill
            priority={index === 0}
            sizes="(min-width: 1152px) 1152px, 100vw"
            className={`object-cover transition-opacity duration-1000 ${
              index === current ? 'hero-kenburns opacity-100' : 'opacity-0'
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-slate-950/45 lg:bg-gradient-to-r lg:from-slate-950/95 lg:via-slate-950/35 lg:to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
      </div>

      <div
        className="absolute bottom-5 right-5 z-10 hidden max-w-md flex-wrap justify-end gap-2 lg:flex"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {SLIDES.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => setCurrent(index)}
            aria-pressed={index === current}
            className={`relative overflow-hidden rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur transition ${
              index === current
                ? 'bg-amber-500 text-slate-950'
                : 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20'
            }`}
          >
            {slide.label}
          </button>
        ))}
      </div>
      <a
        href={SLIDES[current]!.href}
        className="absolute bottom-5 left-6 z-10 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-slate-400 hover:text-amber-400 sm:left-10 lg:hidden"
      >
        {SLIDES[current]!.label} →
      </a>
    </>
  );
}
