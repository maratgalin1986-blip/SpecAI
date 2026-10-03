'use client';

// The /stroyka tour as real footage instead of rendered graphics (owner,
// 2026-10-03). Each stop plays a short muted loop full-screen (files from
// lib/stroyka/zoneFilms.ts); the dialogue box and the top bar are drawn by
// Stroyka.tsx on top. Two <video> slots crossfade on a zone change, and the
// idle slot quietly preloads the next stop, so at most two videos are ever
// alive. A missing clip shows its poster, a missing poster a dark gradient.
// With «уменьшение движения» only the poster is shown.

import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { ZONES, type ZoneId } from '@/lib/stroyka';
import type { WorldProgress } from '@/lib/stroyka/progress';
import { ZONE_FILMS, zoneFilmPoster, zoneFilmSrc } from '@/lib/stroyka/zoneFilms';
import { Passport } from './FallbackMap';

const FADE_MS = 600;
/** Swap even if the new clip has not loaded by then (its poster shows). */
const SWAP_TIMEOUT_MS = 1500;
const SWIPE_PX = 50;

type Slot = 0 | 1;

function neighbour(zone: ZoneId, step: 1 | -1): ZoneId {
  const i = ZONES.findIndex((z) => z.id === zone);
  return ZONES[(i + step + ZONES.length) % ZONES.length]!.id;
}

function play(video: HTMLVideoElement | null) {
  // play() rejects when interrupted by a src change or blocked; both harmless.
  video?.play().catch(() => undefined);
}

export function ZoneFilm({
  active,
  progress,
  onZone,
  small,
  onForce3d,
}: {
  active: ZoneId | null;
  progress: WorldProgress;
  onZone: (zone: ZoneId) => void;
  small: boolean;
  onForce3d?: () => void;
}): JSX.Element {
  const target: ZoneId = active ?? 'gate';

  // null until the media query has been read, so no clip starts by mistake.
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ------------------------------------------------------------ video slots
  const [slots, setSlots] = useState<[ZoneId | null, ZoneId | null]>([target, null]);
  const [front, setFront] = useState<Slot>(0);
  /** Whether each slot's current clip has a decoded frame. */
  const [ready, setReady] = useState<[boolean, boolean]>([false, false]);
  const videos = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([null, null]);
  const pending = useRef<ZoneId | null>(null);
  const frontRef = useRef<Slot>(0);
  frontRef.current = front;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const setSlot = useCallback((idx: Slot, zone: ZoneId | null) => {
    if (slotsRef.current[idx] === zone) return;
    setSlots((s) => (idx === 0 ? [zone, s[1]] : [s[0], zone]));
    setReady((r) => (idx === 0 ? [false, r[1]] : [r[0], false]));
  }, []);

  const swapTo = useCallback((idx: Slot) => {
    if (pending.current === null || slotsRef.current[idx] !== pending.current) return;
    pending.current = null;
    const old = frontRef.current;
    setFront(idx);
    if (!document.hidden) play(videos.current[idx]);
    // Pause the old clip once it has faded out.
    window.setTimeout(() => {
      if (frontRef.current !== old) videos.current[old]?.pause();
    }, FADE_MS);
  }, []);

  // A new stop: load it into the idle slot (unless it is already preloaded
  // there) and swap once it has a frame, or after a timeout.
  useEffect(() => {
    if (slotsRef.current[frontRef.current] === target) {
      pending.current = null;
      return;
    }
    const back: Slot = frontRef.current === 0 ? 1 : 0;
    pending.current = target;
    setSlot(back, target);
    const video = videos.current[back];
    if (slotsRef.current[back] === target && video && video.readyState >= 2) {
      swapTo(back);
      return;
    }
    const timer = window.setTimeout(() => swapTo(back), SWAP_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [target, setSlot, swapTo]);

  // Once the current clip is showing, preload the next stop into the idle slot.
  useEffect(() => {
    if (reduced !== false || !ready[front] || pending.current) return;
    const back: Slot = front === 0 ? 1 : 0;
    const timer = window.setTimeout(() => {
      if (!pending.current) setSlot(back, neighbour(target, 1));
    }, FADE_MS + 100);
    return () => window.clearTimeout(timer);
  }, [reduced, ready, front, target, setSlot]);

  const onLoaded = (idx: Slot) => {
    setReady((r) => (idx === 0 ? [true, r[1]] : [r[0], true]));
    if (idx === frontRef.current && !document.hidden) play(videos.current[idx]);
    else swapTo(idx);
  };
  const onFailed = (idx: Slot) => {
    setReady((r) => (idx === 0 ? [false, r[1]] : [r[0], false]));
    swapTo(idx);
  };

  // Pause in a background tab, resume when the visitor comes back.
  useEffect(() => {
    const onVisibility = () => {
      const video = videos.current[frontRef.current];
      if (document.hidden) video?.pause();
      else play(video);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // ------------------------------------------------------------ navigation
  const step = useCallback((dir: 1 | -1) => onZone(neighbour(target, dir)), [onZone, target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      step(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    const inStrip = (e.target as HTMLElement).closest('[data-testid="zone-strip"]');
    touch.current = t && e.touches.length === 1 && !inStrip ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const start = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    step(dx < 0 ? 1 : -1);
  };

  // Keep the active pill in view (scroll the strip only, never the page).
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = strip.current;
    const pill = row?.querySelector<HTMLElement>(`[data-zone="${target}"]`);
    if (!row || !pill) return;
    const left = pill.offsetLeft - (row.clientWidth - pill.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: reduced ? 'auto' : 'smooth' });
  }, [target, reduced]);

  // ------------------------------------------------------------ render
  const shown = slots[front] ?? target;
  const [posterOk, setPosterOk] = useState(true);
  useEffect(() => setPosterOk(true), [shown]);

  return (
    <div
      data-testid="zone-film"
      className="absolute inset-0 z-0 overflow-hidden bg-[radial-gradient(ellipse_at_top,#334155,#0b1220)]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Poster underneath: the first frame before the clip loads, the whole
          picture with reduced motion or a missing clip. */}
      {posterOk && (
        <img
          src={zoneFilmPoster(shown)}
          alt={reduced ? ZONE_FILMS[shown].alt : ''}
          aria-hidden={reduced ? undefined : true}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setPosterOk(false)}
        />
      )}

      {reduced === false &&
        ([0, 1] as const).map((idx) => {
          const zone = slots[idx];
          if (!zone) return null;
          const isFront = idx === front;
          return (
            <video
              key={idx}
              ref={(el) => {
                videos.current[idx] = el;
              }}
              src={zoneFilmSrc(zone, small)}
              poster={zoneFilmPoster(zone)}
              muted
              loop
              playsInline
              autoPlay={isFront}
              preload="auto"
              disablePictureInPicture
              aria-label={ZONE_FILMS[zone].alt}
              aria-hidden={isFront ? undefined : true}
              onLoadedData={() => onLoaded(idx)}
              onError={() => onFailed(idx)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[600ms] ease-out ${
                isFront && ready[idx] ? 'opacity-100' : 'opacity-0'
              }`}
            />
          );
        })}

      {/* Cinematic shading so the top bar and the dialogue box read. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

      <div
        ref={strip}
        data-testid="zone-strip"
        role="tablist"
        aria-label="Зоны стройки"
        className="absolute inset-x-0 top-[calc(max(0.5rem,env(safe-area-inset-top))+5.5rem)] z-10 flex gap-2 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] sm:top-[calc(max(0.5rem,env(safe-area-inset-top))+3.75rem)] [&::-webkit-scrollbar]:hidden"
      >
        {ZONES.map((zone) => {
          const on = zone.id === target;
          return (
            <button
              key={zone.id}
              type="button"
              role="tab"
              aria-selected={on}
              data-zone={zone.id}
              onClick={() => onZone(zone.id)}
              className={`min-h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold shadow backdrop-blur ${
                on ? 'bg-amber-500 text-slate-950' : 'bg-black/55 text-white hover:bg-black/70'
              }`}
            >
              {zone.name}
            </button>
          );
        })}
      </div>

      <div className="absolute right-3 top-[calc(max(0.5rem,env(safe-area-inset-top))+8.75rem)] z-10 flex flex-col items-end gap-2 sm:top-[calc(max(0.5rem,env(safe-area-inset-top))+7rem)]">
        {onForce3d && (
          <button
            type="button"
            onClick={onForce3d}
            className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-950 shadow hover:bg-white"
          >
            🎮 Пройтись в 3D
          </button>
        )}
        <div className="hidden w-64 sm:block">
          <Passport progress={progress} compact />
        </div>
      </div>
    </div>
  );
}
