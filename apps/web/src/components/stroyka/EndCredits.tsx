'use client';

// The end of the visitor's film: after the order goes through, short credits
// roll on a solid black screen — «В главных ролях: Вы (or the name), Михалыч, Ринат…», the crew,
// «Съёмочная группа: СпецПласт16» and the phone. About 6 s, then it fades; a
// tap anywhere closes it at once. With reduced motion the text just appears.

import { useEffect, useState } from 'react';
import { SITE } from '@/lib/site';
import { joinNames, type Credits } from '@/lib/stroyka/story';
import { displayFont } from './displayFont';

export const CREDITS_MS = 6000;
const FADE_MS = 700;

const CSS = `
@keyframes sp-cr-in{0%{opacity:0}100%{opacity:1}}
.sp-cr-item{animation:sp-cr-in .8s ease-out both}
@media (prefers-reduced-motion: reduce){.sp-cr-item{animation:none}}`;

export function EndCredits({ credits, onDone }: { credits: Credits; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), CREDITS_MS - FADE_MS);
    const done = window.setTimeout(onDone, CREDITS_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [onDone]);

  const items: { key: string; label?: string; text: string; big?: boolean }[] = [
    { key: 'starring', label: 'В главных ролях', text: joinNames(credits.starring), big: true },
    ...(credits.story ? [{ key: 'story', text: credits.story }] : []),
    { key: 'crew', label: 'А также', text: joinNames(credits.featuring) },
    { key: 'film', label: 'Съёмочная группа', text: SITE.name, big: true },
  ];

  return (
    <div
      data-testid="end-credits"
      role="dialog"
      aria-label="Титры"
      onClick={onDone}
      className={`ym-hide-content fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-black px-6 text-center text-white antialiased transition-opacity duration-700 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="absolute inset-x-0 top-0 h-[8vh] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[8vh] bg-black" />
      <div className="flex max-w-xl flex-col items-center gap-5 sm:gap-6">
        {items.map((item, i) => (
          <div
            key={item.key}
            className="sp-cr-item"
            style={{ animationDelay: `${0.25 + i * 0.55}s` }}
          >
            {item.label && (
              <div className="font-mono text-sm font-bold uppercase tracking-[0.3em] text-amber-300">
                {item.label}
              </div>
            )}
            <div
              className={
                item.big
                  ? `${displayFont.className} mt-1.5 text-2xl font-bold leading-snug sm:text-4xl`
                  : 'mt-1 text-[15px] font-semibold leading-snug text-white sm:text-base'
              }
            >
              {item.text}
            </div>
          </div>
        ))}
        <a
          href={SITE.phoneHref}
          onClick={(e) => e.stopPropagation()}
          className="sp-cr-item mt-1 rounded-full bg-amber-500 px-5 py-2.5 text-base font-black text-slate-950 shadow-lg shadow-amber-600/30"
          style={{ animationDelay: `${0.25 + items.length * 0.55}s` }}
        >
          {SITE.phone}
        </a>
      </div>
      <span className="absolute bottom-[calc(8vh+0.5rem)] text-sm font-semibold text-white/75">
        Коснитесь, чтобы закрыть
      </span>
    </div>
  );
}
