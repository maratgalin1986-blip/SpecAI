'use client';

// «3D-город ИИСтройка24» on the home page (owner, 2026-10-28; 2026-11-10: better
// graphics, a show, and an invitation to walk through it). The poster image
// paints first; three.js loads only when the block comes near the screen (or
// when the visitor asks for the walk), runs only while it is on screen and the
// tab is visible, and falls back to the poster without WebGL, on data saver, on
// weak phones or when the frame rate is too low. prefers-reduced-motion gets
// one still frame and a walk that waits for the visitor. The walk itself
// (WalkController) loads only when it is opened; without the live scene it shows
// a picture per stop (rendered from the scene by scripts/world3d-pictures.cjs).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './world3d.css';
import { WORLD_KINDS, worldMode, type WorldKind } from './kinds';
import type { WorldHandle } from './scene';
import { WorldIcon } from './icons';
import type { WalkBridge } from './WalkController';

/** The picture of the block: WebP, and the same frame as JPEG for browsers without it. */
export const WORLD_POSTER = '/images/world3d-poster.jpg';
export const WORLD_POSTER_WEBP = '/images/world3d-poster.webp';
/** The square block of a phone: the name-only tags, drawn at the phone's size. */
export const WORLD_POSTER_PHONE = '/images/world3d-poster-phone.webp';

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function World3D({ categoryIds }: { categoryIds: Partial<Record<WorldKind, string>> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<WorldHandle | null>(null);
  const startRef = useRef<(() => void) | null>(null);
  const inviteRef = useRef<HTMLButtonElement>(null);
  const bridgeRef = useRef<WalkBridge | null>(null);
  const [state, setState] = useState<'poster' | 'loading' | 'ready'>('poster');
  const [picked, setPicked] = useState<WorldKind | null>(null);
  const [walkOpen, setWalkOpen] = useState(false);
  const [fromUrl, setFromUrl] = useState(false);
  const [Picked, setPicked2] = useState<(typeof import('./PickedCard'))['default'] | null>(null);
  const [Walk, setWalk] = useState<(typeof import('./WalkController'))['default'] | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const mode = worldMode({
      webgl: hasWebGL(),
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      saveData: nav.connection?.saveData,
      memory: nav.deviceMemory,
      cores: nav.hardwareConcurrency || undefined,
    });
    if (mode === 'poster') return;
    const phone = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
    let disposed = false;
    let onScreen = false;
    const sync = () => handleRef.current?.setActive(onScreen && !document.hidden);

    let started = false;
    const start = async () => {
      if (started) return;
      started = true;
      near.disconnect();
      setState('loading');
      try {
        const { createWorld } = await import('./scene');
        if (disposed) return;
        handleRef.current = createWorld({
          canvas,
          phone,
          still: mode === 'still',
          onPick: (kind) => {
            const bridge = bridgeRef.current;
            if (bridge) bridge.goto(WORLD_KINDS.findIndex((k) => k.kind === kind));
            else setPicked(kind);
          },
          onArrive: (index) => {
            bridgeRef.current?.arrived(index);
          },
          onSlow: () => {
            handleRef.current?.dispose();
            handleRef.current = null;
            setState('poster');
          },
        });
        setState('ready');
        void import('./PickedCard').then((m) => setPicked2(() => m.default));
        sync();
      } catch (error) {
        console.error('3D city failed to start', error);
        setState('poster');
      }
    };
    startRef.current = () => void start();

    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void start();
      },
      { rootMargin: '300px 0px' },
    );
    near.observe(box);
    const visible = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      sync();
    });
    visible.observe(box);
    document.addEventListener('visibilitychange', sync);
    return () => {
      disposed = true;
      startRef.current = null;
      near.disconnect();
      visible.disconnect();
      document.removeEventListener('visibilitychange', sync);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  // The open walk fills the screen. Scroll effects of the page (depth, dolly) put a
  // transform on the ancestors of this block, and a transform turns `fixed` into
  // «fixed inside that ancestor»: so while the walk is open the box lives in <body>.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const slot = slotRef.current;
    if (!box || !slot) return;
    if (walkOpen) document.body.appendChild(box);
    else if (box.parentElement !== slot) slot.appendChild(box);
    return () => {
      if (box.parentElement !== slot) box.remove();
    };
  }, [walkOpen]);

  // Focus goes back to the invitation when the walk closes. A walk opened from
  // the address (/?walk=1, the hero's button) closes onto this block, not onto
  // the top of the page: the closing Back may restore the old scroll, so the
  // block is brought into view once more after it.
  const wasOpen = useRef(false);
  useEffect(() => {
    const closed = wasOpen.current && !walkOpen;
    wasOpen.current = walkOpen;
    if (!closed) return;
    inviteRef.current?.focus({ preventScroll: true });
    if (!fromUrl) return;
    const slot = slotRef.current;
    if (!slot) return;
    // The closing Back is followed, a moment later, by the browser's and the
    // router's own scroll to where that entry was (the top, smoothly): for a few
    // seconds the block is brought back whenever it has left the screen. A visitor
    // who scrolls on is not fought for long, and a block on screen is left alone.
    const toBlock = () => slot.scrollIntoView({ block: 'center', behavior: 'instant' });
    const offScreen = () => {
      const box = slot.getBoundingClientRect();
      return box.bottom < 0 || box.top > window.innerHeight;
    };
    toBlock();
    const started = Date.now();
    const watch = window.setInterval(() => {
      if (Date.now() - started > 3500) window.clearInterval(watch);
      else if (offScreen()) toBlock();
    }, 120);
    return () => window.clearInterval(watch);
  }, [walkOpen, fromUrl]);

  const openWalk = useCallback((direct = false) => {
    setFromUrl(direct);
    setWalkOpen(true);
    startRef.current?.();
    void import('./WalkController').then((m) => setWalk(() => m.default));
  }, []);
  const closeWalk = useCallback(() => setWalkOpen(false), []);

  // /?walk=1 opens the walk straight away.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('walk') !== '1') return;
    const id = window.setTimeout(() => openWalk(true), 0);
    return () => window.clearTimeout(id);
  }, [openWalk]);

  function choose(kind: WorldKind) {
    setPicked(kind);
    void import('./PickedCard').then((m) => setPicked2(() => m.default));
    handleRef.current?.focus(kind);
  }

  return (
    <section aria-labelledby="world3d-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="eyebrow text-amber-600">3D-город</p>
        <h2 id="world3d-title" className="text-3xl font-bold sm:text-4xl">
          Техника на линии — как такси, только спецтехника
        </h2>
        <p className="max-w-2xl text-slate-600">
          Нажмите на машину: посмотрите, что она делает, и закажите такую же. Исполнители выходят на
          линию со своей техникой и ценой. Картинка — иллюстрация, настоящие машины рядом с вами —
          на карте в приложении.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            ref={inviteRef}
            type="button"
            onClick={() => openWalk()}
            className="w3d-invite inline-flex min-h-[3.25rem] items-center gap-3 rounded-full px-6 py-3 text-base font-bold text-slate-950 transition-transform hover:scale-[1.03] active:scale-95"
          >
            <WorldIcon name="walk" className="h-6 w-6" />
            Прогуляться по городу
            <span className="w3d-invite-arrow">
              <WorldIcon name="arrow" className="h-5 w-5" />
            </span>
          </button>
          <span className="text-sm text-slate-500">
            {WORLD_KINDS.length} остановки: покажем технику, цену и как заказать
          </span>
        </div>
      </div>
      <div ref={slotRef} className="relative aspect-square sm:aspect-[16/9]">
        <div
          ref={boxRef}
          role={walkOpen ? 'dialog' : undefined}
          aria-modal={walkOpen ? true : undefined}
          aria-label={walkOpen ? 'Прогулка по 3D-городу' : undefined}
          data-w3d={walkOpen ? 'walk' : 'block'}
          className={
            walkOpen
              ? 'w3d-bars fixed inset-0 z-[100] overflow-hidden bg-slate-950'
              : 'absolute inset-0 overflow-hidden rounded-[2rem] bg-sky-200 shadow-xl'
          }
        >
          <picture>
            <source media="(max-width: 639px)" srcSet={WORLD_POSTER_PHONE} type="image/webp" />
            <source srcSet={WORLD_POSTER_WEBP} type="image/webp" />
            <img
              src={WORLD_POSTER}
              alt="Иллюстрация: вечерняя стройка в городе, экскаватор, автокран, автовышка и самосвалы на линии"
              width={1600}
              height={900}
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                state === 'ready' ? 'opacity-0' : 'opacity-100'
              }`}
            />
          </picture>
          <canvas
            ref={canvasRef}
            aria-hidden
            className={`absolute inset-0 h-full w-full cursor-pointer transition-opacity duration-700 ${
              state === 'ready' ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ touchAction: walkOpen ? 'none' : 'pan-y' }}
          />
          <div className="w3d-vignette" aria-hidden />
          {!walkOpen && state === 'loading' && (
            <p className="absolute left-4 top-4 rounded-full bg-slate-900/70 px-3 py-1 text-sm text-white">
              Загружаем 3D-город…
            </p>
          )}
          {!walkOpen && (
            <button
              type="button"
              onClick={() => openWalk()}
              className="w3d-float absolute right-3 top-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-950/80 px-4 text-sm font-bold text-amber-300 shadow-lg ring-1 ring-amber-300/60 backdrop-blur hover:bg-slate-950"
            >
              <WorldIcon name="play" className="h-4 w-4" />
              Прогуляться
            </button>
          )}
          {!walkOpen && picked && Picked && (
            <Picked kind={picked} categoryIds={categoryIds} onClose={() => setPicked(null)} />
          )}
          {walkOpen && Walk && (
            <Walk
              categoryIds={categoryIds}
              state={state}
              handleRef={handleRef}
              boxRef={boxRef}
              bridgeRef={bridgeRef}
              fromUrl={fromUrl}
              onClose={closeWalk}
            />
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Выберите технику">
        {WORLD_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => choose(k.kind)}
            aria-pressed={picked === k.kind}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
              picked === k.kind
                ? 'border-amber-500 bg-amber-50 text-slate-900'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
            }`}
          >
            {k.title}
          </button>
        ))}
      </div>
    </section>
  );
}
