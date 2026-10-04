'use client';

// The /stroyka tour as real footage instead of rendered graphics (owner,
// 2026-10-03). Each stop plays a short muted loop full-screen (files from
// lib/stroyka/zoneFilms.ts); the dialogue box and the top bar are drawn by
// Stroyka.tsx on top. Two <video> slots crossfade on a zone change, and the
// idle slot quietly preloads the next stop, so at most two videos are ever
// alive. A missing clip shows its poster, a missing poster a dark gradient.
// With «уменьшение движения» only the poster is shown.
//
// «Как в кино» (owner, 2026-10-03): the footage sits in a slow Ken Burns
// camera (.zf-cam), a zone change is a cinematic cut (the old shot whips out,
// a dip toward black under a warm light-leak swipe, the new shot settles in),
// the chapter card's 2.39:1 letterbox closes on the cut (onCut) and opens as
// the card fades, and FilmLook lays grain, vignette and halation (and a
// day-for-night grade after dark) over the picture. All of it is
// CSS transform/opacity (globals.css, «/stroyka film tour» section) and sits
// under every text layer; nothing here filters or moves text.

import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { ZONES, type ZoneId } from '@/lib/stroyka';
import { ZONE_FILMS, zoneFilmPoster, zoneFilmSrc } from '@/lib/stroyka/zoneFilms';
import { ChannelBug } from './ChannelBug';
import { FilmLook, type FilmTint } from './FilmLook';

/** The cut between zones (zf-in / zf-out / zf-dip in globals.css). */
const FADE_MS = 720;
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
  onZone,
  small,
  onForce3d,
  onCut,
  matte = 0,
  tint = null,
  shade = 'low',
  expanded = false,
  paused = false,
}: {
  active: ZoneId | null;
  onZone: (zone: ZoneId) => void;
  small: boolean;
  onForce3d?: () => void;
  /** The actual cut to a zone's shot (and the first shot once the film shows):
   *  the chapter card starts here, not on the zone change. */
  onCut?: (zone: ZoneId) => void;
  /** Non-zero while a chapter card is up: keys the letterbox so it plays with the card. */
  matte?: number;
  /** Day for night or dusk over the (always daytime) footage. */
  tint?: FilmTint;
  /** 'high' while a full dialogue box needs the dark bottom; 'low' otherwise. */
  shade?: 'low' | 'high';
  /** The phone's expanded dialogue is up: «Пройтись в 3D» steps aside (the strip rides above the box). */
  expanded?: boolean;
  /** Held still (no playback) while something opaque covers it, e.g. the opening film. */
  paused?: boolean;
}): JSX.Element {
  const target: ZoneId = active ?? 'gate';
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const live = () => !document.hidden && !pausedRef.current;
  const onCutRef = useRef(onCut);
  onCutRef.current = onCut;
  /** The zone whose shot was last announced by onCut. */
  const announced = useRef<ZoneId | null>(null);
  const announce = useCallback((zone: ZoneId | null) => {
    if (!zone || pausedRef.current) return;
    announced.current = zone;
    onCutRef.current?.(zone);
  }, []);

  // null until the media query has been read, so no clip starts by mistake.
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // Phones held upright get the vertical reframes (-v), not a sliver of the wide frame.
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    setPortrait(mq.matches);
    const onChange = () => setPortrait(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ------------------------------------------------------------ video slots
  const [slots, setSlots] = useState<[ZoneId | null, ZoneId | null]>([target, null]);
  const [front, setFront] = useState<Slot>(0);
  /** The slot whose shot is whipping out during a cut, and a count of cuts
   *  (keys the dip and the light leak so they replay). */
  const [leaving, setLeaving] = useState<Slot | null>(null);
  const [cuts, setCuts] = useState(0);
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

  const swapTo = useCallback(
    (idx: Slot) => {
      if (pending.current === null || slotsRef.current[idx] !== pending.current) return;
      pending.current = null;
      const old = frontRef.current;
      setFront(idx);
      setLeaving(old);
      setCuts((n) => n + 1);
      announce(slotsRef.current[idx]);
      if (live()) play(videos.current[idx]);
      // Pause the old clip once it has faded out.
      window.setTimeout(() => {
        if (frontRef.current !== old) videos.current[old]?.pause();
        setLeaving((l) => (l === old ? null : l));
      }, FADE_MS);
    },
    [announce],
  );

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

  // Once the current clip is showing, preload the next stop into the idle slot
  // (not under the opening film: the phone would fetch two clips beside it).
  useEffect(() => {
    if (paused || reduced !== false || !ready[front] || pending.current) return;
    const back: Slot = front === 0 ? 1 : 0;
    const timer = window.setTimeout(() => {
      if (!pending.current) setSlot(back, neighbour(target, 1));
    }, FADE_MS + 100);
    return () => window.clearTimeout(timer);
  }, [paused, reduced, ready, front, target, setSlot]);

  // The first shot (and a shot that changed under the opening film) has no
  // cut: announce it once the film is showing and the shot has a frame.
  useEffect(() => {
    const zone = slots[front];
    if (paused || !zone || announced.current === zone || pending.current) return;
    if (ready[front] || reduced) {
      announce(zone);
      return;
    }
    const timer = window.setTimeout(
      () => announce(slotsRef.current[frontRef.current]),
      SWAP_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [paused, slots, front, ready, reduced, announce]);

  const onLoaded = (idx: Slot) => {
    setReady((r) => (idx === 0 ? [true, r[1]] : [r[0], true]));
    if (idx === frontRef.current && live()) play(videos.current[idx]);
    else swapTo(idx);
  };
  const onFailed = (idx: Slot) => {
    setReady((r) => (idx === 0 ? [false, r[1]] : [r[0], false]));
    // The shot on screen has no clip: its poster is the shot, announce it now.
    if (idx === frontRef.current && !pending.current && announced.current !== slotsRef.current[idx])
      announce(slotsRef.current[idx]);
    swapTo(idx);
  };

  // Pause in a background tab, resume when the visitor comes back.
  useEffect(() => {
    const onVisibility = () => {
      const video = videos.current[frontRef.current];
      if (document.hidden) video?.pause();
      else if (!pausedRef.current) play(video);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Under the opening film the phone would decode two videos at once: hold
  // this one still until the film is gone.
  useEffect(() => {
    if (paused) videos.current.forEach((v) => v?.pause());
    else if (!document.hidden) play(videos.current[frontRef.current]);
  }, [paused]);

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
  /** The first shot fades in; later ones arrive by a cut; the old one whips out. */
  const shotClass = (idx: Slot) => {
    if (idx === front) return ready[idx] ? (cuts === 0 ? 'zf-fade' : 'zf-in') : '';
    return idx === leaving ? 'zf-out' : '';
  };
  const [posterOk, setPosterOk] = useState(true);
  useEffect(() => setPosterOk(true), [shown]);
  // During a cut the new clip already has a frame: no poster underneath, or
  // the gap in the whip would flash a frozen still of the new shot.
  const posterHidden = reduced === false && leaving !== null && ready[front];

  return (
    <div
      data-testid="zone-film"
      className={`absolute inset-0 z-0 overflow-hidden bg-[radial-gradient(ellipse_at_top,#334155,#0b1220)] ${
        paused ? 'zf-hold' : ''
      }`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* The camera: a slow push and drift on the picture only. */}
      <div className="zf-cam absolute inset-0">
        {/* Poster underneath: the first frame before the clip loads, the whole
          picture with reduced motion or a missing clip. */}
        {posterOk && !posterHidden && (
          <img
            src={zoneFilmPoster(shown, portrait)}
            style={portrait ? undefined : { objectPosition: ZONE_FILMS[shown].focus }}
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
                src={zoneFilmSrc(zone, small, portrait)}
                poster={zoneFilmPoster(zone, portrait)}
                style={portrait ? undefined : { objectPosition: ZONE_FILMS[zone].focus }}
                muted
                loop
                playsInline
                autoPlay={isFront && !paused}
                preload="auto"
                disablePictureInPicture
                aria-label={ZONE_FILMS[zone].alt}
                aria-hidden={isFront ? undefined : true}
                onLoadedData={() => onLoaded(idx)}
                onError={() => onFailed(idx)}
                className={`zf-shot absolute inset-0 h-full w-full object-cover ${shotClass(idx)}`}
              />
            );
          })}
      </div>

      <FilmLook grain={reduced === false} tint={tint} />

      {reduced === false && (
        <>
          {/* The only letterbox: in on the cut, out as the chapter card fades. */}
          {matte > 0 && (
            <div key={`matte-${matte}`} aria-hidden className="pointer-events-none">
              <div className="zf-matte zf-matte-top absolute inset-x-0 top-0 bg-black" />
              <div className="zf-matte zf-matte-bottom absolute inset-x-0 bottom-0 bg-black" />
            </div>
          )}
          {cuts > 0 && (
            <div
              key={`cut-${cuts}`}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              <div className="zf-dip absolute inset-0" />
              <div className="zf-leak absolute inset-y-0" />
            </div>
          )}
        </>
      )}

      {/* Cinematic shading so the top bar and the dialogue box read. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      {/* The bottom shade is deep only under a full dialogue box; under the
        subtitle bar a quarter of the frame is enough. */}
      <div
        // Scaled, not resized: a height change would count as a layout shift.
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-[45%] origin-bottom bg-gradient-to-t from-black/80 via-black/35 to-transparent transition-transform duration-300 ${
          shade === 'high' ? '' : 'scale-y-[0.56]'
        }`}
      />
      <ChannelBug corner="tour" className="sp-cleanable" />

      <div
        ref={strip}
        data-testid="zone-strip"
        role="tablist"
        aria-label="Зоны стройки"
        // Phones: just above the subtitle bar (--sp-bottom is the height of
        // the bottom block, set by Stroyka); from sm up under the top bar.
        className={`sp-cleanable absolute inset-x-0 bottom-[calc(var(--sp-bottom,10rem)+0.25rem)] z-10 flex gap-2 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] sm:bottom-auto sm:top-[calc(max(0.5rem,env(safe-area-inset-top))+3.75rem)] sm:pl-[26rem] [&::-webkit-scrollbar]:hidden`}
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
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-bold shadow ${
                on ? 'bg-amber-500 text-slate-950' : 'bg-slate-950/80 text-white hover:bg-slate-900'
              }`}
            >
              {zone.name}
            </button>
          );
        })}
      </div>

      {/* The one order button is «К заказу» in the top bar (Stroyka.tsx): one
        tap from every frame, and the picture stays clean. */}
      {onForce3d && !expanded && (
        <button
          type="button"
          data-testid="force-3d"
          onClick={onForce3d}
          className="sp-cleanable absolute right-3 top-[calc(max(0.5rem,env(safe-area-inset-top))+8rem)] z-10 min-h-11 rounded-full bg-slate-950/80 px-3 text-xs font-bold text-white shadow hover:bg-slate-900 sm:right-5 sm:top-[calc(max(0.5rem,env(safe-area-inset-top))+7rem)]"
        >
          🎮 Пройтись в 3D
        </button>
      )}
    </div>
  );
}
