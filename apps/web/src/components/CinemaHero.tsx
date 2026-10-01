'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CinemaVideo } from '@/components/CinemaVideo';
import { LiveClock } from '@/components/LiveClock';

// The film-style header of an inner page: a looping clip of real footage
// (poster frame first, see CinemaVideo), a slow push-in, scanlines and grain,
// a camera HUD (● ОНЛАЙН, camera number, Moscow time) and a title that is
// revealed like opening credits. `clips` are names in public/video; one is
// picked per visit.

export function CinemaHero({
  eyebrow,
  title,
  children,
  clips,
  camera = 1,
  compact = false,
  still = false,
}: {
  eyebrow: string;
  title: ReactNode;
  /** Subtitle, price, buttons… under the title. */
  children?: ReactNode;
  clips: string[];
  camera?: number;
  compact?: boolean;
  /** No footage: the poster frame only, darker (legal and reference pages). */
  still?: boolean;
}) {
  const [clip, setClip] = useState(clips[0]!);

  useEffect(() => {
    setClip(clips[Math.floor(Math.random() * clips.length)]!);
  }, []);

  return (
    <section
      className={`cine-hero relative isolate flex min-h-[max(320px,45vh)] flex-col overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-2xl sm:min-h-[max(320px,55vh)]`}
    >
      {still ? (
        <img
          src={`/video/${clips[0]}.webp`}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40"
        />
      ) : (
        <CinemaVideo
          clip={clip}
          poster={clips[0]}
          priority
          className="journey-push absolute inset-0 -z-10 h-full w-full"
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/85 via-slate-950/45 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40" />
      <div className="journey-scanlines pointer-events-none absolute inset-0 -z-10 opacity-50" />
      <div className="cine-letterbox pointer-events-none absolute inset-0" aria-hidden />

      <div className="flex items-center justify-between gap-3 px-6 pt-5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-white/70 sm:px-10">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded bg-red-600/90 px-2 py-0.5 font-bold text-white">
            <span className="journey-rec h-1.5 w-1.5 rounded-full bg-white" />
            Онлайн
          </span>
          <span className="hidden sm:inline">Камера {String(camera).padStart(2, '0')}</span>
        </span>
        <LiveClock className="tabular-nums" />
      </div>

      <div className={`mt-auto px-6 sm:px-10 ${compact ? 'pb-8 pt-10' : 'pb-10 pt-14 sm:pt-20'}`}>
        <div className="cine-eyebrow eyebrow text-amber-400">{eyebrow}</div>
        <h1 className="cine-title mt-3 max-w-3xl text-3xl font-extrabold leading-[1.05] tracking-[-0.03em] drop-shadow-lg sm:text-5xl">
          {title}
        </h1>
        {children && <div className="cine-sub mt-4 max-w-2xl text-white/80">{children}</div>}
      </div>
    </section>
  );
}

/**
 * A full-screen film backdrop for small pages (login, registration…): the
 * footage plays behind the page content.
 */
export function CinemaBackdrop({ clip }: { clip: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <CinemaVideo clip={clip} className="journey-push absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]" />
      <div className="journey-scanlines absolute inset-0 opacity-40" />
    </div>
  );
}

/**
 * The footage, shading and letterbox of CinemaHero as a layer for an existing
 * dark section. The section needs `relative isolate overflow-hidden`.
 */
export function CinemaLayer({ clips }: { clips: string[] }) {
  const [clip, setClip] = useState(clips[0]!);
  useEffect(() => {
    setClip(clips[Math.floor(Math.random() * clips.length)]!);
  }, []);
  return (
    <>
      <CinemaVideo
        clip={clip}
        poster={clips[0]}
        priority
        className="journey-push absolute inset-0 -z-10 h-full w-full"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-slate-950/20" />
      <div className="journey-scanlines pointer-events-none absolute inset-0 -z-10 opacity-50" />
      <div className="cine-letterbox pointer-events-none absolute inset-0" aria-hidden />
    </>
  );
}
