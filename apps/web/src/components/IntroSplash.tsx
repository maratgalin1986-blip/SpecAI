'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CinemaVideo } from '@/components/CinemaVideo';
import { SITE } from '@/lib/site';
import { reachGoal } from '@/lib/marketing';
import { setSoundEnabled, soundEnabled, storedSoundChoice, subscribeSound } from '@/lib/sound';

// Opening titles of the home page, about 6 seconds, cut like a TV channel
// ident: light beams over a drone shot, «ООО «СпецПласт 16» представляет»,
// a brass hit with a flash and the gold «ИИСтройка24» logo, then the bright
// partner card under a spotlight for about three seconds, and the camera
// dives into the site. Shown once per browser session; «Пропустить» or Esc
// skips it (a tap only switches the sound on); off with reduced motion.
//
// It is plain CSS (globals.css, .intro-*), so it runs and ends on time even
// before hydration. The inline script hides it before the first paint for
// visitors who have already seen it.

const SEEN_KEY = 'sp16_intro_seen';
const DURATION_MS = 7800;

/** What the site offers, under the card (owner, 2026-10-03: «чтобы привлечь больше людей»). */
const OFFERS = [
  { href: '/equipment', icon: '🚜', label: 'Аренда спецтехники' },
  { href: '/smeta', icon: '🧮', label: 'Составьте смету онлайн' },
  { href: '/dizain', icon: '🏠', label: 'Дизайн-проект онлайн' },
];

// `?intro=0` in the address skips the titles too (ad landings, QA, links
// sent to someone who has already seen them), and so does a deep link to the
// order form or the wizard (`/#callback`, `?m=<machine>#podbor`): the visitor
// asked for the form, not the titles. Hiding also marks them seen, so the
// next home page visit in this session does not play them either.
const HIDE_IF_SEEN = `try{if(/(?:^|;\\s*)sp_ab=calm/.test(document.cookie)||sessionStorage.getItem('${SEEN_KEY}')||/[?&](intro=0|m=|yclid|gclid|utm_medium=cpc)/.test(location.search)||/^#(callback|podbor)/.test(location.hash)||matchMedia('(prefers-reduced-motion: reduce)').matches){document.getElementById('intro').hidden=true;sessionStorage.setItem('${SEEN_KEY}','1')}}catch(e){}`;

/** The address asks for the order form or the wizard. */
const FORM_HASH = /^#(callback|podbor)/;

/**
 * A deep link to the form (`/#callback`, `#podbor`): the browser scrolls to it
 * at once, then the blocks above load (lazy chunks, photos) and push it down.
 * Keep it in place for a few seconds, until the visitor scrolls himself.
 */
function keepFormAnchored(): () => void {
  const id = FORM_HASH.exec(window.location.hash)?.[1];
  const el = id ? document.getElementById(id) : null;
  if (!el) return () => {};
  const instant = 'instant' as ScrollBehavior;
  el.scrollIntoView({ block: 'start', behavior: instant });
  const anchor = el.getBoundingClientRect().top;
  const stops = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
  let timer = 0;
  const stop = () => {
    window.clearInterval(timer);
    stops.forEach((name) => window.removeEventListener(name, stop));
  };
  stops.forEach((name) => window.addEventListener(name, stop, { passive: true }));
  const until = performance.now() + 4000;
  timer = window.setInterval(() => {
    if (performance.now() > until) return stop();
    if (Math.abs(el.getBoundingClientRect().top - anchor) > 4) {
      el.scrollIntoView({ block: 'start', behavior: instant });
    }
  }, 150);
  return stop;
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Storage blocked: the titles just play on every visit.
  }
}

// The card number flies into the header «Позвонить» button through a View
// Transition. Old snapshot: only the card number carries the name. In the
// update callback the html gets `intro-live` (the header button takes the name
// in CSS) and the intro unmounts, so the name is never twice in one snapshot.
const LIVE_CLASS = 'intro-live';

export function IntroSplash() {
  const [done, setDone] = useState(false);
  // The visitor switched the sound off earlier: no «tap for sound» hint.
  const [soundOff, setSoundOff] = useState(false);
  const finishing = useRef(false);
  const finish = () => {
    if (finishing.current) return;
    finishing.current = true;
    const root = document.documentElement;
    const canMorph =
      typeof document.startViewTransition === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canMorph) {
      setDone(true);
      return;
    }
    const transition = document.startViewTransition(() => {
      root.classList.add(LIVE_CLASS);
      flushSync(() => setDone(true));
    });
    const land = () => {
      root.classList.remove(LIVE_CLASS);
      const button = document.querySelector('.vt-phone');
      if (button) {
        button.classList.add('phone-land');
        window.setTimeout(() => button.classList.remove('phone-land'), 900);
      }
    };
    transition.finished.then(land, land);
  };
  const skip = () => {
    reachGoal('intro_skip');
    finish();
  };

  useEffect(() => {
    // The inline script has already hidden it for a repeat visit; the flag
    // is read there only, so an effect that runs twice still plays it.
    const intro = document.getElementById('intro');
    if (!intro || intro.hidden || FORM_HASH.test(window.location.hash)) {
      markSeen();
      setDone(true);
      return keepFormAnchored();
    }
    setSoundOff(!storedSoundChoice());
    const offSound = subscribeSound(() => setSoundOff(!soundEnabled()));
    markSeen();
    // A link to the form while the titles play (the header «Заказать
    // технику →» is `/#callback`): end them at once.
    const onHash = () => {
      if (FORM_HASH.test(window.location.hash)) finish();
    };
    window.addEventListener('hashchange', onHash);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Enter') return;
      reachGoal('intro_skip');
      finish();
    };
    const timer = window.setTimeout(() => {
      reachGoal('intro_full');
      finish();
    }, DURATION_MS);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
      offSound();
    };
  }, []);

  if (done) return null;

  return (
    <>
      <div
        id="intro"
        className="intro fixed inset-0 z-[100] overflow-hidden bg-black text-white"
        role="presentation"
        suppressHydrationWarning
      >
        {/* The descent moves the frame and the footage together; the footage
            is fetched only for visitors who actually get the titles. */}
        <div className="intro-drone absolute inset-0">
          <CinemaVideo clip="site-aerial" priority className="absolute inset-0 h-full w-full" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-black/80" />
        {/* Darkens the footage when the card arrives, so the card stands out. */}
        <div className="intro-dim absolute inset-0 bg-black" aria-hidden />
        <div className="intro-rays pointer-events-none absolute inset-0" aria-hidden />
        <div className="intro-flash pointer-events-none absolute inset-0" aria-hidden />

        {/* Drone HUD */}
        <div className="absolute left-4 top-4 font-mono text-[0.6rem] uppercase tracking-[0.25em] text-white/60 sm:left-8 sm:top-8">
          <span className="intro-rec mr-2 inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
          Аэросъёмка · {SITE.city}
        </div>

        {/* 1. «… представляет» */}
        <div className="intro-stage-1 absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="intro-presents font-mono text-sm font-semibold uppercase tracking-[0.35em] text-amber-400 sm:text-xl">
            {SITE.legalName}
          </div>
          <div className="intro-presents-2 mt-2 text-sm uppercase tracking-[0.4em] text-white/80">
            представляет
          </div>
        </div>

        {/* 2. The logo hit */}
        <div className="intro-stage-2 absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="intro-logo text-6xl font-black tracking-[-0.04em] sm:text-8xl">
            {SITE.platform}
          </div>
          <div className="mt-3 font-mono text-sm font-bold uppercase tracking-[0.45em] text-amber-100 drop-shadow sm:text-lg">
            от {SITE.name}
          </div>
        </div>

        {/* 3. Partner card under a spotlight, the three offers under it */}
        <div className="intro-stage-3 absolute inset-0 flex flex-col items-center justify-center gap-5 px-4">
          <div className="intro-spot absolute inset-0" aria-hidden />
          <div className="intro-card-wrap relative">
            <div className="intro-card relative aspect-[1.586] w-[min(90vw,480px)] overflow-hidden rounded-[1.4rem] p-5 text-left text-slate-950 shadow-[0_40px_120px_rgba(245,158,11,0.35),0_20px_60px_rgba(0,0,0,0.7)] ring-1 ring-amber-200/60 sm:p-7">
              <div className="intro-card-shine absolute inset-0" aria-hidden />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 font-black text-amber-400">
                      16
                    </span>
                    <span className="text-xl font-black tracking-tight sm:text-2xl">
                      {SITE.name}
                    </span>
                  </div>
                  <span className="rounded-full bg-slate-950/85 px-2.5 py-1 font-mono text-[0.6rem] font-bold uppercase tracking-[0.18em] text-amber-300">
                    Карта партнёра
                  </span>
                </div>
                <div className="mt-auto">
                  <div className="intro-chip mb-3 h-8 w-11 rounded-md" aria-hidden />
                  <div
                    className="intro-emboss font-mono text-xl font-bold tracking-[0.12em] sm:text-2xl"
                    style={{ viewTransitionName: 'sp-phone' }}
                  >
                    {SITE.phone}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-900/80">
                    <span>Аренда спецтехники с машинистом</span>
                    <span className="shrink-0">{SITE.city}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <nav
            aria-label="Что можно сделать на сайте"
            className="relative flex w-[min(92vw,560px)] flex-col gap-2.5 sm:flex-row"
          >
            {OFFERS.map((offer, i) => (
              <a
                key={offer.href}
                href={offer.href}
                onClick={() => reachGoal('intro_offer')}
                className="intro-offer flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950/90 px-4 py-3 text-center text-base font-bold text-white shadow-xl ring-2 ring-amber-400/80 transition hover:bg-amber-400 hover:text-slate-950 sm:text-sm"
                style={{ animationDelay: `${3.4 + i * 0.35}s` }}
              >
                <span aria-hidden>{offer.icon}</span>
                {offer.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Sound is on by default (it starts at the first touch where the
            browser asks for one); this button takes it away, or brings it back. */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSoundEnabled(soundOff);
          }}
          // Same switch as the header one: pressing it must not wake the
          // sound first (SoundDirector skips gestures on [data-sound-toggle]).
          data-sound-toggle
          aria-pressed={!soundOff}
          className="intro-sound-hint absolute bottom-6 left-4 flex min-h-11 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg ring-1 ring-white/40 hover:bg-amber-300 sm:left-6"
        >
          {soundOff ? '🔊 Включить звук' : '🔇 Убрать звук'}
        </button>
        <button
          type="button"
          className="absolute bottom-6 right-6 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg ring-1 ring-white/40 hover:bg-amber-300"
          onClick={skip}
        >
          Пропустить →
        </button>
      </div>
      <script dangerouslySetInnerHTML={{ __html: HIDE_IF_SEEN }} />
    </>
  );
}
