'use client';

import { ZONES, type ZoneId } from '@/lib/stroyka';
import { progressLine, STAGES, type WorldProgress } from '@/lib/stroyka/progress';
import { SiteMapSvg } from './MiniMap';

export function Passport({
  progress,
  compact = false,
}: {
  progress: WorldProgress;
  compact?: boolean;
}) {
  return (
    <div
      data-testid="passport"
      className="rounded-xl border border-amber-500/40 bg-slate-900/85 p-3 text-white shadow-lg backdrop-blur"
    >
      <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
        Паспорт объекта
      </div>
      <div className="font-bold">{progress.projectName}</div>
      {!compact && (
        <div className="text-xs text-slate-300">
          Генподрядчик и техника: СпецПласт16 · объект № {progress.projectIndex + 1} квартала ·
          старт квартала 01.10.2026
        </div>
      )}
      <div
        className="mt-2 flex gap-0.5"
        aria-label={`Этап ${progress.stage + 1} из ${STAGES.length}`}
      >
        {STAGES.map((stage, i) => (
          <span
            key={stage.key}
            title={stage.name}
            className={`h-2 flex-1 rounded-sm ${
              i < progress.stage
                ? 'bg-emerald-500'
                : i === progress.stage
                  ? 'bg-amber-400'
                  : 'bg-slate-600'
            }`}
          />
        ))}
      </div>
      <div className="mt-1 text-xs text-slate-200">{progressLine(progress)}</div>
    </div>
  );
}

// Without WebGL (or with reduced motion): an illustrated site map. Tapping a
// zone opens the same dialogue, so ordering works exactly the same.
export function FallbackMap({
  active,
  progress,
  onZone,
  reducedMotion,
  onForce3d,
}: {
  active: ZoneId | null;
  progress: WorldProgress;
  onZone: (zone: ZoneId) => void;
  reducedMotion: boolean;
  onForce3d?: () => void;
}) {
  return (
    <div
      data-testid="fallback-map"
      className="absolute inset-0 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#334155,#0b1220)] px-4 pb-72 pt-16 text-white"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <h1 className="text-xl font-extrabold">Стройка — пройдись по объекту</h1>
        <p className="text-sm text-slate-300">
          Карта площадки: нажмите на зону — там работает техника и ждёт машинист.
          {reducedMotion &&
            ' Анимация отключена, потому что в системе включено «уменьшение движения».'}
        </p>
        <div className="aspect-[132/140] w-full overflow-hidden rounded-2xl border border-amber-500/40 bg-slate-900">
          <SiteMapSvg active={active} onZone={onZone} big />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ZONES.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => onZone(zone.id)}
              className={`rounded-lg px-3 py-2 text-left text-sm font-semibold ${
                zone.id === active ? 'bg-amber-500 text-slate-950' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {zone.name}
            </button>
          ))}
        </div>
        <Passport progress={progress} />
        {onForce3d && (
          <button
            type="button"
            onClick={onForce3d}
            className="self-start rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
          >
            Всё равно включить 3D
          </button>
        )}
      </div>
    </div>
  );
}
