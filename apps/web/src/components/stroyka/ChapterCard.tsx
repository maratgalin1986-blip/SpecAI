'use client';

// A film's chapter title over the zone footage: «Глава 2 · Котлован» and one
// line of mood (lib/stroyka/story.ts). It is mounted on the actual cut
// (ZoneFilm's onCut), plays for about 2.6 s and fades; ZoneFilm's letterbox
// closes and opens with it (the card has no bars of its own), and the rest of
// the UI steps out meanwhile (the «clean frame», .sp-clean in globals.css).
// It never takes a click (pointer-events: none) and the parent does not mount
// it under «уменьшение движения».

import { useEffect } from 'react';
import { Playfair_Display } from 'next/font/google';
import type { Chapter } from '@/lib/stroyka/story';

export const CHAPTER_MS = 2600;

// A Cyrillic display serif for the chapter name only (no Times fallback).
const display = Playfair_Display({
  subsets: ['cyrillic'],
  weight: ['700', '800'],
  display: 'swap',
  preload: false,
});

const CSS = `
@keyframes sp-ch-fade{0%{opacity:0}15%,80%{opacity:1}100%{opacity:0}}
.sp-ch-fade{animation:sp-ch-fade ${CHAPTER_MS}ms ease-out both}`;

export function ChapterCard({ chapter, onDone }: { chapter: Chapter; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, CHAPTER_MS);
    return () => window.clearTimeout(timer);
  }, [chapter, onDone]);

  return (
    <div
      data-testid="chapter-card"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[66] select-none overflow-hidden"
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* In the picture, between the letterbox bars and above the subtitle
          bar. Crisp text on a near-solid plate; the whole title fades by
          opacity only (owner: «текст должен быть чётким всегда»). */}
      <div className="absolute inset-x-0 top-[26%] flex justify-center px-4 sm:top-[30%]">
        <div className="sp-ch-fade flex max-w-lg flex-col items-center rounded-2xl bg-slate-950/95 px-7 py-5 text-center antialiased shadow-2xl">
          <div className="font-mono text-sm font-bold uppercase tracking-[0.35em] text-amber-300">
            Глава {chapter.number}
          </div>
          <div
            className={`${display.className} mt-1 text-[2.6rem] font-extrabold leading-tight text-white sm:text-6xl`}
          >
            {chapter.name}
          </div>
          <div className="mt-2 h-px w-24 bg-amber-300/80" />
          <p className="mt-2 text-[15px] font-bold leading-snug text-white sm:text-base">
            {chapter.subtitle}
          </p>
        </div>
      </div>
      <span className="sr-only">{chapter.title}</span>
    </div>
  );
}
