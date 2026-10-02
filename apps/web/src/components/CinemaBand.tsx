'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { defaultPhotoOf, type MachineType } from '@/lib/machinePhotos';
import { SITE } from '@/lib/site';

// A full-bleed cinematic break between light blocks: a machine photo with a
// slow push-in, a dark gradient, letterbox bars that open once when the band
// scrolls into view, one big phrase and a call / «Наряд» row. Works without
// video; with reduced motion it is static (see «cinema content» in globals.css).

export function CinemaBand({
  machine,
  phrase,
  eyebrow,
  className = '',
}: {
  machine: MachineType;
  phrase: string;
  eyebrow?: string;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setOpen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setOpen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      data-open={open ? 'true' : 'false'}
      className={`cine-band relative isolate flex min-h-[320px] items-center overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-2xl sm:min-h-[400px] ${className}`}
    >
      <img
        src={defaultPhotoOf(machine)}
        alt=""
        loading="lazy"
        decoding="async"
        className="cine-band-photo absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-slate-950/20" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/50" />
      <div className="cine-band-bar cine-band-bar-top" aria-hidden />
      <div className="cine-band-bar cine-band-bar-bottom" aria-hidden />

      <div className="relative z-10 w-full px-6 py-16 sm:px-12 sm:py-20">
        {eyebrow && <div className="eyebrow text-amber-400">{eyebrow}</div>}
        <p className="mt-3 max-w-3xl text-3xl font-extrabold uppercase leading-[0.98] tracking-[-0.03em] drop-shadow-lg sm:text-5xl lg:text-6xl">
          {phrase}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a
            href={SITE.phoneHref}
            className="inline-flex items-center gap-2.5 rounded-full bg-amber-500 px-6 py-3 font-mono text-base font-bold tabular-nums text-slate-950 shadow-lg shadow-amber-500/30 transition hover:bg-amber-400"
          >
            <Icon name="phone" className="h-5 w-5" />
            {SITE.phone}
          </a>
          <a
            href={`/?m=${machine}#podbor`}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-semibold text-white ring-1 ring-white/40 backdrop-blur transition hover:bg-white/10"
          >
            Наряд
            <Icon name="arrow" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
