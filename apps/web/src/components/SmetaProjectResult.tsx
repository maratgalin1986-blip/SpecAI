'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef } from 'react';
import { orderHref, SmetaCtas, SmetaDisclaimer } from '@/components/SmetaCtas';
import { SmetaUnlock, useUnlocked } from '@/components/SmetaUnlock';
import { SITE } from '@/lib/site';
import { projectScene } from '@/lib/smeta3d';
import {
  FOUNDATIONS,
  OBJECTS,
  projectText,
  projectView,
  SOILS,
  type Project,
} from '@/lib/smetaProject';

const Smeta3D = dynamic(() => import('@/components/Smeta3D').then((m) => m.Smeta3D), {
  ssr: false,
  loading: () => <div className="h-72 rounded-xl border border-cyan-900 bg-[#0a1a2f]" />,
});

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

export function SmetaProjectResult({
  project,
  onEdit,
  onSnab,
}: {
  project: Project;
  onEdit: () => void;
  onSnab: () => void;
}) {
  const [unlocked, unlock] = useUnlocked();
  const view = projectView(project, unlocked);
  const scene = useMemo(() => projectScene(project, unlocked), [project, unlocked]);
  const unlockRef = useRef<HTMLDivElement>(null);
  const i = project.input;
  const spec = OBJECTS[i.object];
  const title = `${spec.title} ${i.length}×${i.width} м`;
  const params = [
    `${i.length}×${i.width} м`,
    i.floors ? `${i.floors} эт.` : '',
    i.object === 'site' ? '' : FOUNDATIONS[i.foundation].toLowerCase(),
    SOILS[i.soil].title.toLowerCase(),
    i.haul ? `вывоз ${i.distance} км` : 'без вывоза',
  ].filter(Boolean);
  const toUnlock = () => unlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const names = [...new Set(project.stages.flatMap((s) => s.rows.map((r) => r.name)))];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="flex min-w-0 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <p className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-amber-600">
          Примерная смета · проект целиком · {SITE.name}
        </p>
        <h2 className="text-xl font-bold">{spec.title}</h2>
        <p className="text-sm text-slate-600">{params.join(' · ')}</p>
        <p className="text-sm">
          <span className="font-semibold">Техника {SITE.name}:</span> {names.join(', ')}
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="self-start text-sm text-slate-500 underline"
        >
          Изменить параметры
        </button>
      </section>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <Smeta3D scene={scene} title={title} onLockClick={toUnlock} />

        <section
          className="work-order flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-200 sm:p-5"
          aria-live="polite"
        >
          <ol className="flex flex-col divide-y divide-dashed divide-slate-700 text-sm">
            {view.open.map((s, n) => (
              <li key={s.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-white">
                    {n + 1}. {s.title}
                  </span>
                  <span className="shrink-0 font-semibold text-white">≈ {rub(s.cost)}</span>
                </div>
                <ul className="mt-1 text-xs text-slate-400">
                  {s.rows.map((r) => (
                    <li key={r.machine + r.task}>
                      {r.name} {SITE.name}: {r.hours} ч × {rub(r.rate)} — {r.task}
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400">~{s.days} дн.</span>
                  <a
                    href={orderHref(s.rows[0]?.machine)}
                    className="font-semibold text-amber-300 underline"
                  >
                    Заказать у {SITE.name}
                  </a>
                </div>
                {unlocked && s.materials.length > 0 && (
                  <p className="mt-1 text-xs text-cyan-300">
                    Материалы — ориентир:{' '}
                    {s.materials
                      .map(
                        (m) =>
                          `${m.name.toLowerCase()} ≈ ${m.qty.toLocaleString('ru-RU')} ${m.unit}`,
                      )
                      .join(', ')}
                  </p>
                )}
              </li>
            ))}
            {view.locked.map((s, n) => (
              <li key={s.id} className="relative py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-white">
                    {view.open.length + n + 1}. {s.title}
                  </span>
                  {/* Placeholder digits only: the real price is not in the page. */}
                  <span
                    className="shrink-0 select-none font-semibold text-white blur-sm"
                    aria-hidden
                  >
                    ≈ 00 000 ₽
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {s.machines.join(', ')} · {SITE.name}
                </p>
                <p className="mt-1 select-none text-xs text-cyan-300 blur-sm" aria-hidden>
                  Материалы — ориентир: бетон ≈ 00 м³, песок ≈ 00 м³
                </p>
                <span className="absolute right-0 top-8 text-sm" aria-label="Цена в полной смете">
                  🔒
                </span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-700 pt-3">
            <span className="text-sm text-slate-400">Техника {SITE.name} итого, примерно</span>
            <span className="text-xl font-extrabold text-amber-400 sm:text-2xl">
              {view.totalHigh
                ? `${rub(view.totalFrom)} – ${rub(view.totalHigh)}`
                : `от ${rub(view.totalFrom)}`}
            </span>
          </div>
          {unlocked ? (
            <>
              <p className="text-xs text-slate-400">
                Сроки — около {project.days} дн. вместе с работой бригады. Запас 25% — на грунт,
                подъезд и погоду.
              </p>
              {view.materials && view.materials.length > 0 && (
                <div className="rounded-lg border border-cyan-900 p-2 text-xs text-cyan-200">
                  <p className="mt-1 text-cyan-400">
                    Материалы для этого проекта — с запасом, ценой и доставкой техникой {SITE.name}{' '}
                    —{' '}
                    <button type="button" onClick={onSnab} className="underline">
                      в смете для снабженца
                    </button>
                    .
                  </p>
                </div>
              )}
              <ul className="list-disc pl-4 text-xs text-slate-400">
                {project.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          ) : (
            <button
              type="button"
              onClick={toUnlock}
              className="rounded-lg border border-amber-500/60 p-2 text-left text-xs text-amber-200"
            >
              🔒 Цены остальных этапов, материалы и вся 3D-схема — в полной смете.
            </button>
          )}
          <SmetaDisclaimer />
        </section>
      </div>

      {!unlocked && (
        <div ref={unlockRef}>
          <SmetaUnlock text={projectText(project)} onUnlocked={unlock} />
        </div>
      )}
      {unlocked && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          Полная смета открыта. Ссылку на приложение {SITE.name} пришлём, как только оно выйдет.
        </p>
      )}

      <SmetaCtas
        text={projectText(project, unlocked)}
        machine={project.stages[0]?.rows[0]?.machine}
        source="smeta-project"
      />
    </div>
  );
}
