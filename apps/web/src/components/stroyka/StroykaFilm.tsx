'use client';

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SITE } from '@/lib/site';
import { setSoundEnabled, storedSoundChoice } from '@/lib/sound';
import { ChannelBug } from './ChannelBug';
import { FilmLook } from './FilmLook';

// The opening film of /stroyka: a 44 s montage of open-licence footage
// (Mixkit, see /credits) with music, before the film tour. With sound when
// the browser allows it, muted otherwise (a tap turns it on). «Войти на
// стройку» enters the tour; the film also closes by itself at the end, or
// with «Пропустить».

export const FILM_SRC = {
  full: '/film/stroyka-film.mp4',
  sm: '/film/stroyka-film-sm.mp4',
  /** 720×1280, reframed shot by shot, same soundtrack: for phones held upright. */
  v: '/film/stroyka-film-v.mp4',
};
export const FILM_POSTER = '/film/stroyka-film.webp';

/** What the site offers, over the film (owner, 2026-10-03: «чтобы привлечь больше людей»). */
const OFFERS = [
  {
    href: '/equipment',
    icon: '🚜',
    label: 'Аренда спецтехники',
    line: 'Аренда спецтехники с машинистом',
  },
  { href: '/smeta', icon: '🧮', label: 'Смета онлайн', line: 'Составьте смету онлайн' },
  {
    href: '/dizain',
    icon: '🏠',
    label: 'Дизайн-проект онлайн',
    line: 'Сделайте дизайн-проект онлайн',
  },
];
/** Seconds each headline stays on screen. */
const LINE_SECONDS = 4;
/** The burned-in title card («СпецПласт16 представляет») plays this long. */
const TITLE_SECONDS = 4;
/** The landscape cut carries its own 2.39:1 matte: the picture is rows 92–628 of 720. */
const BAKED = { top: 92 / 720, height: 536 / 720 };
/** The top row of buttons (sound, skip) ends about here. */
const CHROME_PX = 64;

type Place = { head: number; offersBottom: number };

/**
 * Where the headline and the offers go: wholly inside the black bar when it
 * is tall enough, otherwise wholly inside the picture, never across its edge.
 */
function placeOver(v: HTMLVideoElement, small: boolean, offersH: number): Place {
  const vw = v.videoWidth || 1280;
  const vh = v.videoHeight || 720;
  const bw = v.clientWidth || window.innerWidth;
  const bh = v.clientHeight || window.innerHeight;
  const cover = getComputedStyle(v).objectFit === 'cover';
  const scale = cover ? Math.max(bw / vw, bh / vh) : Math.min(bw / vw, bh / vh);
  const frameH = vh * scale;
  const frameTop = (bh - frameH) / 2;
  // A vertical cut has no matte of its own.
  const baked = vw > vh ? BAKED : { top: 0, height: 1 };
  const picTop = Math.max(0, frameTop + baked.top * frameH);
  const picBottom = Math.min(bh, frameTop + (baked.top + baked.height) * frameH);
  const headH = small ? 72 : 52;
  const topBar = picTop - CHROME_PX;
  const head =
    topBar >= headH + 16
      ? CHROME_PX + (topBar - headH) / 2
      : Math.max(picTop, CHROME_PX) + (small ? 20 : 28);
  const bottomBar = bh - picBottom;
  const offersBottom = bottomBar >= offersH + 8 ? 0 : bottomBar + 12;
  // Whole pixels: no fractional offset on a text layer.
  return { head: Math.round(head), offersBottom: Math.round(offersBottom) };
}

// Memoised: the /stroyka page around it updates often (radio, dialogue,
// loading), and the film should re-render only when its own props change.
export const StroykaFilm = memo(function StroykaFilm({
  small,
  onClose,
}: {
  /** Phones and slow connections get the lighter cut. */
  small: boolean;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  // Read once (the film mounts on the client only): a change of source would restart it.
  const [portrait] = useState(() => window.matchMedia('(orientation: portrait)').matches);
  const [muted, setMuted] = useState(false);
  // Muted only by the browser (not by the visitor): the first touch turns it on.
  const autoMuted = useRef(false);
  // Mirrors autoMuted for the button label.
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [line, setLine] = useState(0);
  // The HTML headline waits for the film's own title card to finish.
  const [titled, setTitled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTitled(true), (TITLE_SECONDS + 2) * 1000);
    return () => window.clearTimeout(timer);
  }, []);
  const offers = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  // Before the first paint, so the offers never jump.
  useLayoutEffect(() => {
    const v = video.current;
    if (!v) return;
    const measure = () => setPlace(placeOver(v, small, offers.current?.offsetHeight ?? 140));
    measure();
    v.addEventListener('loadedmetadata', measure);
    window.addEventListener('resize', measure);
    return () => {
      v.removeEventListener('loadedmetadata', measure);
      window.removeEventListener('resize', measure);
    };
  }, [small]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setLine((k) => (k + 1) % OFFERS.length),
      LINE_SECONDS * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    // The visitor switched the site's sound off earlier: start muted.
    const wantSound = storedSoundChoice();
    v.muted = !wantSound;
    setMuted(!wantSound);
    v.play().catch(() => {
      // Autoplay with sound refused: play muted until the first touch.
      v.muted = true;
      autoMuted.current = wantSound;
      setWaiting(wantSound);
      setMuted(true);
      v.play().catch(() => setEnded(true));
    });
  }, []);

  // The film is over (or could not play): go in.
  useEffect(() => {
    if (ended) onClose();
  }, [ended, onClose]);

  return (
    <div
      className="absolute inset-0 z-[80] bg-black"
      data-testid="stroyka-film"
      onPointerDown={() => {
        const v = video.current;
        if (!v || !autoMuted.current) return;
        autoMuted.current = false;
        setWaiting(false);
        v.muted = false;
        setMuted(false);
      }}
    >
      <video
        ref={video}
        className={`absolute inset-0 h-full w-full ${portrait ? 'object-cover' : 'object-contain'}`}
        src={portrait ? FILM_SRC.v : small ? FILM_SRC.sm : FILM_SRC.full}
        poster={FILM_POSTER}
        playsInline
        preload="auto"
        onEnded={() => setEnded(true)}
        onTimeUpdate={(e) => {
          if (!titled && e.currentTarget.currentTime >= TITLE_SECONDS) setTitled(true);
        }}
        aria-label={`Фильм ${SITE.platform}: стройки, техника и люди`}
      />
      <FilmLook />
      {/* Phones: the corner belongs to «Выключить звук» and «Пропустить». */}
      <ChannelBug corner="top-left" className="hidden sm:flex" />
      {/* The offers: a big headline that changes, and a button for each. It
        comes after the film's own title card, wholly in the black bar or
        wholly in the picture (placeOver). */}
      {titled && place && (
        <div
          className="pointer-events-none absolute inset-x-0 flex justify-center px-4"
          style={{ top: place.head }}
        >
          <p
            key={line}
            className="sf-headline text-center text-2xl font-extrabold text-white antialiased drop-shadow-[0_1px_0_rgba(0,0,0,0.9)] sm:text-4xl"
          >
            {OFFERS[line]!.line}
          </p>
        </div>
      )}
      <div
        ref={offers}
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        style={place?.offersBottom ? { bottom: place.offersBottom } : undefined}
      >
        <nav
          aria-label="Что можно сделать на сайте"
          className="flex w-full max-w-2xl flex-wrap justify-center gap-2"
        >
          {OFFERS.map((offer, i) => (
            <a
              key={offer.href}
              href={offer.href}
              className={`flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-lg ring-2 sm:text-base ${
                i === line
                  ? 'bg-amber-400 text-slate-950 ring-amber-300'
                  : 'bg-slate-950/80 text-white ring-amber-400/70 hover:bg-amber-400 hover:text-slate-950'
              }`}
            >
              <span aria-hidden>{offer.icon}</span>
              {offer.label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          onClick={onClose}
          className="group inline-flex items-center gap-3 rounded-full bg-amber-500 py-2 pl-2 pr-6 text-lg font-extrabold text-slate-950 shadow-xl shadow-amber-600/40 transition hover:bg-amber-400"
        >
          <span className="stroyka-ping relative grid h-10 w-10 place-items-center rounded-full bg-slate-950 text-amber-400">
            <svg viewBox="0 0 16 16" aria-hidden className="ml-0.5 h-4 w-4 fill-current">
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
          </span>
          Войти на стройку
        </button>
      </div>
      <div className="absolute right-3 top-3 flex gap-2 sm:right-5 sm:top-5">
        <button
          type="button"
          // Not the film's «first touch unmutes»: that ran first and this click
          // then muted again, so the sound took two presses (owner, 2026-10-03).
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            const v = video.current;
            if (!v) return;
            // Sound wanted but the browser still waits for a touch: the
            // button already says «Выключить звук», so this press turns it off.
            const next = autoMuted.current ? true : !v.muted;
            autoMuted.current = false;
            setWaiting(false);
            v.muted = next;
            setMuted(next);
            setSoundEnabled(!next);
          }}
          className="min-h-11 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-lg hover:bg-amber-300"
        >
          {muted && !waiting ? '🔊 Включить звук' : '🔇 Выключить звук'}
        </button>
        <button
          type="button"
          onClick={() => {
            video.current?.pause();
            onClose();
          }}
          className="min-h-11 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-lg hover:bg-amber-300"
        >
          Пропустить →
        </button>
      </div>
    </div>
  );
});
