'use client';

// A film's chapter title over the zone footage: thin letterbox bars, «Глава 2 ·
// Котлован» and one line of mood (lib/stroyka/story.ts). It plays for about
// 2.5 s and fades; it never takes a click (pointer-events: none) and the
// parent does not mount it under «уменьшение движения».

import { useEffect } from 'react';
import type { Chapter } from '@/lib/stroyka/story';

export const CHAPTER_MS = 2600;

const CSS = `
@keyframes sp-ch-bar{0%{transform:scaleY(0)}14%,82%{transform:scaleY(1)}100%{transform:scaleY(0)}}
@keyframes sp-ch-fade{0%{opacity:0}15%,80%{opacity:1}100%{opacity:0}}
.sp-ch-bar{animation:sp-ch-bar ${CHAPTER_MS}ms cubic-bezier(.2,.7,.2,1) both}
.sp-ch-top{transform-origin:top}.sp-ch-bot{transform-origin:bottom}
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
      <div className="sp-ch-bar sp-ch-top absolute inset-x-0 top-0 h-[6vh] bg-black" />
      <div className="sp-ch-bar sp-ch-bot absolute inset-x-0 bottom-0 h-[6vh] bg-black" />
      {/* Phones: in the top band, above the dialogue box that fills the lower
          part. Crisp text on a near-solid plate; the whole title fades by
          opacity only (owner: «текст должен быть чётким всегда»). */}
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+5rem)] flex justify-center px-4 sm:top-[34%]">
        <div className="sp-ch-fade flex max-w-lg flex-col items-center rounded-2xl bg-slate-950 px-6 py-4 text-center antialiased">
          <div className="font-mono text-sm font-bold uppercase tracking-[0.35em] text-amber-300">
            Глава {chapter.number}
          </div>
          <div className="mt-1 font-serif text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {chapter.name}
          </div>
          <div className="mt-2 h-px w-24 bg-amber-300/80" />
          <p className="mt-2 text-[15px] font-semibold leading-snug text-white sm:text-base">
            {chapter.subtitle}
          </p>
        </div>
      </div>
      <span className="sr-only">{chapter.title}</span>
    </div>
  );
}
