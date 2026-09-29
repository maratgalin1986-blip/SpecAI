'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import type { MachineKind } from '@/lib/equipmentCatalog';
import type { MachineViewer, WorkingEnvelope } from '@/lib/machineViewerScene';

const KIND_LABEL: Record<MachineKind, string> = {
  backhoe: 'экскаватор-погрузчик',
  crane: 'автокран',
  wheelLoader: 'фронтальный погрузчик',
  dumpTruck: 'самосвал',
  dozer: 'бульдозер',
};

function formatMetres(value: number) {
  return `${value.toLocaleString('ru-RU')} м`;
}

// Interactive 3D model shown on machine pages that have no photos. three.js
// is loaded lazily once the viewer is near the viewport; until then (and
// without WebGL) a drawn placeholder stays in place.
export function Machine3DViewer({
  kind,
  fallbackIcon,
  envelope,
}: {
  kind: MachineKind;
  fallbackIcon: IconName;
  envelope?: WorkingEnvelope;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'ready' | 'failed'>('idle');
  const digDepth = envelope?.digDepth ?? null;
  const reach = envelope?.reach ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let viewer: MachineViewer | undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const visibility = new IntersectionObserver(([entry]) => {
      viewer?.setRunning(entry?.isIntersecting ?? true);
    });

    const load = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        load.disconnect();
        import('@/lib/machineViewerScene')
          .then(({ createMachineViewer }) => {
            if (cancelled) return;
            try {
              viewer = createMachineViewer(container, {
                kind,
                reducedMotion,
                envelope: { digDepth, reach },
              });
            } catch (error) {
              console.error('3D viewer failed', error);
              setState('failed');
              return;
            }
            setState('ready');
            visibility.observe(container);
          })
          .catch((error) => {
            console.error('3D viewer failed to load', error);
            setState('failed');
          });
      },
      { rootMargin: '200px' },
    );
    load.observe(container);

    return () => {
      cancelled = true;
      load.disconnect();
      visibility.disconnect();
      viewer?.dispose();
    };
  }, [kind, digDepth, reach]);

  const hasEnvelope = kind === 'backhoe' && (digDepth !== null || reach !== null);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-slate-950 bg-[radial-gradient(ellipse_at_50%_35%,rgba(245,158,11,0.16),transparent_62%)] sm:aspect-[16/10]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        aria-hidden
      />
      {state !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-amber-400">
          <Icon
            name={fallbackIcon}
            className={`h-24 w-24 ${state === 'idle' ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          />
          {state === 'idle' && (
            <span className="eyebrow text-[0.65rem] text-slate-500">Загружаем 3D-модель…</span>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        role="img"
        aria-label={`3D-модель: ${KIND_LABEL[kind]}. Потяните, чтобы повернуть.`}
        className={`absolute inset-0 transition-opacity duration-700 ${
          state === 'ready' ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1">
        <span className="eyebrow text-[0.65rem] text-amber-400">3D · {KIND_LABEL[kind]}</span>
        <span className="text-[0.7rem] text-slate-400">
          Иллюстрация класса техники, не фото этой машины
        </span>
      </div>
      {state === 'ready' && (
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-2">
          {hasEnvelope ? (
            <div className="flex flex-col gap-1 rounded-2xl bg-slate-900/70 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10 backdrop-blur">
              <span className="eyebrow text-[0.6rem] text-amber-400">
                Рабочая зона · по характеристикам
              </span>
              {digDepth !== null && (
                <span>
                  Глубина копания — <b className="font-mono text-white">{formatMetres(digDepth)}</b>
                </span>
              )}
              {reach !== null && (
                <span>
                  Радиус копания — <b className="font-mono text-white">{formatMetres(reach)}</b>
                </span>
              )}
            </div>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-white/10 backdrop-blur">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path strokeLinecap="round" d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.5 2v3.8h-3.8M5.5 22v-3.8h3.8"
              />
            </svg>
            Потяните, чтобы повернуть
          </span>
        </div>
      )}
    </div>
  );
}
