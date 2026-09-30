'use client';

import { useEffect, useState } from 'react';
import { CinemaVideo } from '@/components/CinemaVideo';
import { SITE } from '@/lib/site';
import { reachGoal } from '@/lib/marketing';

// Opening titles of the home page, about 3 seconds: a drone shot descends over
// a construction site, «ООО «СпецПласт 16» представляет», then the partner card
// turns towards the viewer and the camera dives into the site. Shown once per
// browser session; a click or any key skips it; off with reduced motion.
//
// It is plain CSS (globals.css, .intro-*), so it runs and ends on time even
// before hydration. The inline script hides it before the first paint for
// visitors who have already seen it.

const SEEN_KEY = 'sp16_intro_seen';
const DURATION_MS = 2800;

// `?intro=0` in the address skips the titles too (ad landings, QA, links
// sent to someone who has already seen them).
const HIDE_IF_SEEN = `try{if(/(?:^|;\\s*)sp_ab=calm/.test(document.cookie)||sessionStorage.getItem('${SEEN_KEY}')||/[?&](intro=0|yclid|gclid|utm_medium=cpc)/.test(location.search)||matchMedia('(prefers-reduced-motion: reduce)').matches){document.getElementById('intro').hidden=true}}catch(e){}`;

export function IntroSplash() {
  const [done, setDone] = useState(false);
  const skip = () => {
    reachGoal('intro_skip');
    setDone(true);
  };

  useEffect(() => {
    // The inline script has already hidden it for a repeat visit; the flag
    // is read there only, so an effect that runs twice still plays it.
    if (document.getElementById('intro')?.hidden) {
      setDone(true);
      return;
    }
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage blocked: the titles just play on every visit.
    }
    const onKey = () => {
      reachGoal('intro_skip');
      setDone(true);
    };
    const timer = window.setTimeout(() => {
      reachGoal('intro_full');
      setDone(true);
    }, DURATION_MS);
    window.addEventListener('keydown', onKey, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (done) return null;

  return (
    <>
      <div
        id="intro"
        className="intro fixed inset-0 z-[100] overflow-hidden bg-black text-white"
        onClick={skip}
        role="presentation"
        suppressHydrationWarning
      >
        {/* The descent moves the frame and the footage together; the footage
            is fetched only for visitors who actually get the titles. */}
        <div className="intro-drone absolute inset-0">
          <CinemaVideo clip="site-aerial" priority className="absolute inset-0 h-full w-full" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/10 to-black/70" />
        <div className="journey-scanlines pointer-events-none absolute inset-0 opacity-40" />

        {/* Drone HUD */}
        <div className="absolute left-4 top-4 font-mono text-[0.6rem] uppercase tracking-[0.25em] text-white/60 sm:left-8 sm:top-8">
          <span className="intro-rec mr-2 inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
          Аэросъёмка · {SITE.city}
        </div>

        <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="intro-presents font-mono text-sm font-semibold uppercase tracking-[0.35em] text-amber-400 sm:text-xl">
            {SITE.legalName}
          </div>
          <div className="intro-presents-2 mt-2 text-sm uppercase tracking-[0.4em] text-white/80">
            представляет
          </div>

          {/* Partner card */}
          <div className="intro-card-wrap mt-8">
            <div className="intro-card relative aspect-[1.586] w-[min(86vw,420px)] overflow-hidden rounded-2xl p-5 text-left shadow-[0_30px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/15 sm:p-7">
              <div className="intro-card-shine absolute inset-0" aria-hidden />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-slate-950">
                      16
                    </span>
                    <span className="text-lg font-extrabold tracking-tight">{SITE.name}</span>
                  </div>
                  <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] ring-1 ring-white/20">
                    Карта партнёра
                  </span>
                </div>
                <div className="mt-auto">
                  <div className="intro-chip mb-3 h-7 w-10 rounded-md" aria-hidden />
                  <div className="font-mono text-base tracking-[0.18em] text-white/90 sm:text-lg">
                    {SITE.phone}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3 text-[0.65rem] uppercase tracking-[0.15em] text-white/60">
                    <span>Аренда спецтехники с машинистом</span>
                    <span className="shrink-0">{SITE.city}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="absolute bottom-6 right-6 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white/80 ring-1 ring-white/20 backdrop-blur hover:bg-white/20"
          onClick={skip}
        >
          Пропустить →
        </button>
      </div>
      <script dangerouslySetInnerHTML={{ __html: HIDE_IF_SEEN }} />
    </>
  );
}
