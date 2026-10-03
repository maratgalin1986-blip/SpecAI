'use client';

import { useEffect, useRef, useState } from 'react';
import { SITE } from '@/lib/site';

// The opening film of /stroyka: a 44 s montage of open-licence footage
// (Mixkit, see /credits) with music, shown while the 3D site loads. With
// sound when the browser allows it, muted otherwise (a tap turns it on).
// «Войти на стройку» appears as soon as the site is ready; the film also
// closes by itself at the end, or with «Пропустить».

export const FILM_SRC = { full: '/film/stroyka-film.mp4', sm: '/film/stroyka-film-sm.mp4' };
export const FILM_POSTER = '/film/stroyka-film.webp';

export function StroykaFilm({
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
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {
      // Autoplay with sound refused: play muted, the visitor can unmute.
      v.muted = true;
      setMuted(true);
      v.play().catch(() => setEnded(true));
    });
  }, []);

  // The film is over (or could not play) and the site is ready: go in.
  useEffect(() => {
    if (ended && ready) onClose();
  }, [ended, ready, onClose]);

  return (
    <div className="absolute inset-0 z-[80] bg-black" data-testid="stroyka-film">
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
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {ready ? (
          <button
            type="button"
            onClick={onClose}
            className="group inline-flex items-center gap-3 rounded-full bg-white/10 py-2 pl-2 pr-6 text-base font-semibold text-white ring-1 ring-white/40 backdrop-blur-md transition hover:bg-white/20"
          >
            <span className="stroyka-ping relative grid h-9 w-9 place-items-center rounded-full bg-amber-400 text-slate-950">
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
          onClick={() => {
            const v = video.current;
            if (!v) return;
            v.muted = !v.muted;
            setMuted(v.muted);
          }}
          className="rounded-full bg-black/50 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/70"
        >
          {muted ? '🔇 Включить звук' : '🔊 Звук'}
        </button>
        <button
          type="button"
          onClick={() => {
            video.current?.pause();
            if (ready) onClose();
            else setEnded(true);
          }}
          className="rounded-full bg-black/50 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/70"
        >
          Пропустить →
        </button>
      </div>
    </div>
  );
}
