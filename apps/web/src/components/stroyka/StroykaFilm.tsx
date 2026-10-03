'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { SITE } from '@/lib/site';
import { setSoundEnabled, storedSoundChoice } from '@/lib/sound';
import { ChannelBug } from './ChannelBug';

// The opening film of /stroyka: a 44 s montage of open-licence footage
// (Mixkit, see /credits) with music, shown while the 3D site loads. With
// sound when the browser allows it, muted otherwise (a tap turns it on).
// «Войти на стройку» appears as soon as the site is ready; the film also
// closes by itself at the end, or with «Пропустить».

export const FILM_SRC = { full: '/film/stroyka-film.mp4', sm: '/film/stroyka-film-sm.mp4' };
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

// Memoised: the /stroyka page around it updates often (radio, dialogue,
// loading), and the film should re-render only when its own props change.
export const StroykaFilm = memo(function StroykaFilm({
  ready,
  progress,
  small,
  onClose,
}: {
  /** The 3D site is loaded. */
  ready: boolean;
  /** Loading progress, 0–100. */
  progress: number;
  /** Phones and slow connections get the lighter cut. */
  small: boolean;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  // Muted only by the browser (not by the visitor): the first touch turns it on.
  const autoMuted = useRef(false);
  // Mirrors autoMuted for the button label.
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [line, setLine] = useState(0);
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

  // The film is over (or could not play) and the site is ready: go in.
  useEffect(() => {
    if (ended && ready) onClose();
  }, [ended, ready, onClose]);

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
        className="absolute inset-0 h-full w-full object-contain"
        src={small ? FILM_SRC.sm : FILM_SRC.full}
        poster={FILM_POSTER}
        playsInline
        preload="auto"
        onEnded={() => setEnded(true)}
        aria-label={`Фильм ${SITE.platform}: стройки, техника и люди`}
      />
      <ChannelBug corner="top-left" />
      {/* The offers: a big headline that changes, and a button for each. */}
      <div className="pointer-events-none absolute inset-x-0 top-[18%] flex justify-center px-4 sm:top-[14%]">
        <p
          key={line}
          className="intro-offer text-center text-2xl font-extrabold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-4xl"
        >
          {OFFERS[line]!.line}
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
        {ready ? (
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
        ) : (
          <p className="font-mono text-xs text-white/70" data-testid="film-loading">
            {ended ? 'Заезжаем на объект…' : 'Стройка загружается…'} {progress}%
          </p>
        )}
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
            // button already says «Убрать звук», so this press turns it off.
            const next = autoMuted.current ? true : !v.muted;
            autoMuted.current = false;
            setWaiting(false);
            v.muted = next;
            setMuted(next);
            setSoundEnabled(!next);
          }}
          className="min-h-11 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-lg hover:bg-amber-300"
        >
          {muted && !waiting ? '🔊 Включить звук' : '🔇 Убрать звук'}
        </button>
        <button
          type="button"
          onClick={() => {
            video.current?.pause();
            if (ready) onClose();
            else setEnded(true);
          }}
          className="min-h-11 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-lg hover:bg-amber-300"
        >
          Пропустить →
        </button>
      </div>
    </div>
  );
});
