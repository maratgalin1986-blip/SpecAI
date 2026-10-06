'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { LoopVideo } from '@/components/LoopVideo';
import { watchInView } from '@/lib/inView';
import type { LoopName } from '@/lib/loops';
import { defaultPhotoOf, type MachineType } from '@/lib/machinePhotos';
import { SITE } from '@/lib/site';

// A full-bleed cinematic break between light blocks: a machine photo with a
// slow push-in, a dark gradient, letterbox bars that open once when the band
// scrolls into view, one big phrase and a call / «Наряд» row. With `clip`, a
// short loop of real footage (LoopVideo, public/loops) plays over the photo
// while the band is on screen. Works without video; with reduced motion it is
// static (see «cinema content» in globals.css).

export function CinemaBand({
  machine,
  phrase,
  eyebrow,
  clip,
  className = '',
}: {
  machine: MachineType;
  phrase: string;
  eyebrow?: string;
  /** A loop from lib/loops.ts to play over the photo. */
  clip?: LoopName;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  // Opens once; the light sweep on the call button pauses off screen.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    return watchInView(
      node,
      (entry) => {
        node.toggleAttribute('data-offscreen', !entry.isIntersecting);
        if (entry.isIntersecting) setOpen(true);
      },
      { threshold: 0.25 },
    );
  }, []);

  return (
    <section
      ref={ref}
      data-open={open ? 'true' : 'false'}
      className={`cine-band relative isolate flex min-h-[320px] items-center overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-2xl sm:min-h-[400px] ${className}`}
    >
      {clip ? (
        <LoopVideo clip={clip} className="absolute inset-0 -z-10 h-full w-full" />
      ) : (
        <Image
          src={defaultPhotoOf(machine)}
          alt=""
          fill
          sizes="(min-width: 1280px) 1200px, 100vw"
          className="cine-band-photo -z-10 object-cover"
        />
      )}
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
            className="sweep inline-flex items-center gap-2.5 rounded-full bg-amber-500 px-6 py-3 font-mono text-base font-bold tabular-nums text-slate-950 shadow-lg shadow-amber-500/30 transition hover:bg-amber-400"
          >
            <Icon name="phone" className="h-5 w-5" />
            {SITE.phone}
          </a>
          <a
            href={`/?m=${machine}#podbor`}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-semibold text-white ring-1 ring-white/40 backdrop-blur transition hover:bg-white/10"
          >
            Заявка
            <span className="nudge">
              <Icon name="arrow" className="h-4 w-4" />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
