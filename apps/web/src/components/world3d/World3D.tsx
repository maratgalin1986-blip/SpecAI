'use client';

// «3D-город ИИСтройка24» on the home page (owner, 2026-10-28). The poster
// image paints first; three.js loads only when the block comes near the
// screen, runs only while it is on screen and the tab is visible, and falls
// back to the poster without WebGL, on data saver, on weak phones or when the
// frame rate is too low. prefers-reduced-motion gets one still frame.
import { useEffect, useRef, useState } from 'react';
import {
  kindInfo,
  WORLD_KINDS,
  WORLD_PROVIDER_HREF,
  worldMode,
  worldOrderHref,
  type WorldKind,
} from './kinds';
import type { WorldHandle } from './scene';

export const WORLD_POSTER = '/images/world3d-poster.jpg';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<WorldHandle | null>(null);
  const [state, setState] = useState<'poster' | 'loading' | 'ready'>('poster');
  const [picked, setPicked] = useState<WorldKind | null>(null);

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

    const start = async () => {
      setState('loading');
      try {
        const { createWorld } = await import('./scene');
        if (disposed) return;
        handleRef.current = createWorld({
          canvas,
          phone,
          still: mode === 'still',
          onPick: setPicked,
          onSlow: () => {
            handleRef.current?.dispose();
            handleRef.current = null;
            setState('poster');
          },
        });
        setState('ready');
        sync();
      } catch (error) {
        console.error('3D city failed to start', error);
        setState('poster');
      }
    };

    let started = false;
    const near = new IntersectionObserver(
      (entries) => {
        if (!started && entries.some((e) => e.isIntersecting)) {
          started = true;
          near.disconnect();
          void start();
        }
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
      near.disconnect();
      visible.disconnect();
      document.removeEventListener('visibilitychange', sync);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  const info = picked ? kindInfo(picked) : null;

  function choose(kind: WorldKind) {
    setPicked(kind);
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
      </div>
      <div
        ref={boxRef}
        className="relative aspect-square overflow-hidden rounded-[2rem] bg-sky-200 shadow-xl sm:aspect-[16/9]"
      >
        <img
          src={WORLD_POSTER}
          alt="Иллюстрация: стройка в городе, экскаватор, автокран, автовышка и самосвалы на линии"
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            state === 'ready' ? 'opacity-0' : 'opacity-100'
          }`}
        />
        <canvas
          ref={canvasRef}
          aria-hidden
          className={`absolute inset-0 h-full w-full cursor-pointer transition-opacity duration-700 ${
            state === 'ready' ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ touchAction: 'pan-y' }}
        />
        {state === 'loading' && (
          <p className="absolute left-4 top-4 rounded-full bg-slate-900/70 px-3 py-1 text-sm text-white">
            Загружаем 3D-город…
          </p>
        )}
        {info && (
          <div
            role="dialog"
            aria-label={info.title}
            className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/95 p-4 shadow-2xl backdrop-blur sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm text-emerald-700">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  на линии
                </p>
                <p className="text-lg font-bold text-slate-900">{info.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setPicked(null)}
                aria-label="Закрыть"
                className="rounded-full px-2 text-2xl leading-none text-slate-500 hover:text-slate-900"
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">{info.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={worldOrderHref(categoryIds[info.kind])}
                className="rounded-full bg-amber-500 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-400"
              >
                Заказать
              </a>
              <a
                href={WORLD_PROVIDER_HREF}
                className="rounded-full border border-slate-300 px-4 py-2 font-semibold text-slate-800 hover:border-slate-500"
              >
                Встать на линию
              </a>
            </div>
          </div>
        )}
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
