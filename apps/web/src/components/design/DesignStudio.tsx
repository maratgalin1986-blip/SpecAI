'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CallbackForm } from '@/components/CallbackForm';
import { SpecSheet, StyleBoard } from '@/components/design/DesignSheets';
import { FloorPlanSvg } from '@/components/design/FloorPlanSvg';
import { IsoView } from '@/components/design/IsoView';
import { LandscapePlanSvg } from '@/components/design/LandscapePlanSvg';
import {
  BUDGET_IDS,
  BUDGETS,
  designQuery,
  designSummary,
  generateDesign,
  normalizeParams,
  OBJECT_IDS,
  OBJECT_SPECS,
  PROJECT_CONTENTS,
  smetaHref,
  STYLE_IDS,
  STYLES,
  type DesignProject,
} from '@/lib/design';
import { PRESETS } from '@/lib/design/presets';
import { newSeed } from '@/lib/design/random';
import type { DesignObject, DesignParams } from '@/lib/design/types';
import { SITE } from '@/lib/site';

export const DESIGN_DISCLAIMER =
  'Эскизный дизайн-проект, сгенерирован автоматически; не является рабочей документацией';

const OBJECT_HINTS: Record<DesignObject, string> = {
  house: 'Планировка, фасад, отделка',
  banya: 'Парная, мойка, отдых',
  garage: 'Бокс, мастерская, студия',
  flat: 'Ремонт и зонирование',
  landscape: 'Зонирование участка',
};

const pill =
  'inline-flex min-h-12 items-center justify-center rounded-full px-5 text-center font-semibold';

function Stepper({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  const round = 'h-10 w-10 shrink-0 rounded-full border border-slate-300 text-lg';
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-700">
        {label}
        {unit ? `, ${unit}` : ''}
      </span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          className={round}
          onClick={() => set(value - step)}
          aria-label={`Меньше: ${label}`}
        >
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value.replace(',', '.'));
            if (Number.isFinite(v)) onChange(v);
          }}
          onBlur={() => set(value)}
          aria-label={label}
          className="h-10 w-16 rounded-lg border border-slate-300 text-center"
        />
        <button
          type="button"
          className={round}
          onClick={() => set(value + step)}
          aria-label={`Больше: ${label}`}
        >
          +
        </button>
      </span>
    </div>
  );
}

function Chips<T extends string>({
  items,
  value,
  onPick,
  label,
}: {
  items: { id: T; title: string; hint?: string }[];
  value: T;
  onPick: (id: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          aria-pressed={it.id === value}
          onClick={() => onPick(it.id)}
          className={`min-w-0 rounded-2xl border p-3 text-left text-sm transition ${
            it.id === value
              ? 'border-amber-500 bg-amber-50'
              : 'border-slate-200 bg-white hover:border-slate-400'
          }`}
        >
          <span className="block font-semibold">{it.title}</span>
          {it.hint && <span className="mt-0.5 block text-xs text-slate-500">{it.hint}</span>}
        </button>
      ))}
    </div>
  );
}

function Thumb({ d }: { d: DesignProject }) {
  if (d.landscape) return <LandscapePlanSvg land={d.landscape} compact className="h-full w-full" />;
  return (
    <FloorPlanSvg
      building={d.building!}
      floor={d.building!.floors[0]!}
      compact
      className="h-full w-full"
    />
  );
}

export function DesignStudio({
  initial,
}: {
  initial: { params: DesignParams; seed: number } | null;
}) {
  const [tab, setTab] = useState<'gallery' | 'custom'>(initial ? 'custom' : 'gallery');
  const [form, setForm] = useState<DesignParams>(
    initial?.params ?? normalizeParams({ object: 'house' }),
  );
  const [current, setCurrent] = useState<{ params: DesignParams; seed: number } | null>(initial);
  const [floor, setFloor] = useState(0);
  const [consult, setConsult] = useState(false);
  const [href, setHref] = useState('');
  const result = useRef<HTMLDivElement>(null);
  const project = useMemo(
    () => (current ? generateDesign(current.params, current.seed) : null),
    [current],
  );
  const thumbs = useMemo(
    () => PRESETS.map((p) => ({ p, d: generateDesign(p.params, p.seed) })),
    [],
  );
  const spec = OBJECT_SPECS[form.object];

  // The URL carries the project, so a link opens the same design.
  useEffect(() => {
    if (!current) return;
    const url = `/dizain?${designQuery(current.params, current.seed)}`;
    try {
      window.history.replaceState(null, '', url);
    } catch {
      /* ignore */
    }
    setHref(window.location.href);
  }, [current]);

  const show = (params: DesignParams, seed: number) => {
    setCurrent({ params, seed });
    setFloor(0);
    setConsult(false);
    window.setTimeout(() => {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      result.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }, 30);
  };
  const generate = () => show(normalizeParams(form), newSeed());
  const another = () => current && show(current.params, newSeed());
  const setField = (patch: Partial<DesignParams>) =>
    setForm((f) => normalizeParams({ ...f, ...patch }));
  const pickObject = (object: DesignObject) => {
    const s = OBJECT_SPECS[object];
    setForm((f) =>
      normalizeParams({
        ...f,
        object,
        length: s.length[2],
        width: s.width[2],
        floors: s.floors[0],
        rooms: s.rooms[2],
      }),
    );
  };

  const summary = project ? designSummary(project, SITE.name, href || undefined) : '';
  const tabBtn = (active: boolean) =>
    `min-h-11 flex-1 rounded-full px-4 text-sm font-semibold sm:flex-none ${
      active ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-300'
    }`;
  const card =
    'flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5';

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="dz-noprint flex gap-2" role="tablist" aria-label="Как начать">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gallery'}
          className={tabBtn(tab === 'gallery')}
          onClick={() => setTab('gallery')}
        >
          Готовые дизайны
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'custom'}
          className={tabBtn(tab === 'custom')}
          onClick={() => setTab('custom')}
        >
          Создать свой
        </button>
      </div>

      {tab === 'gallery' && (
        <section className="dz-noprint" aria-label="Готовые дизайны">
          <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {thumbs.map(({ p, d }) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setForm(p.params);
                    show(p.params, p.seed);
                  }}
                  aria-pressed={
                    current?.seed === p.seed && current.params.object === p.params.object
                  }
                  className="group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-amber-500 hover:shadow-md"
                >
                  <span className="flex h-40 items-center justify-center bg-slate-50 p-3">
                    <Thumb d={d} />
                  </span>
                  <span className="flex flex-1 flex-col gap-1 p-3">
                    <span className="font-semibold text-slate-900">{p.title}</span>
                    <span className="text-xs text-slate-500">{p.hint}</span>
                    <span className="mt-auto flex flex-wrap gap-1 pt-1 text-[11px]">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
                        {STYLES[p.params.style].title}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                        {BUDGETS[p.params.budget].title}
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900">
                        Бесплатно
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'custom' && (
        <section className={`${card} dz-noprint`} aria-label="Создать свой дизайн">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">1. Что проектируем</h2>
            <Chips
              label="Объект"
              items={OBJECT_IDS.map((id) => ({
                id,
                title: OBJECT_SPECS[id].title,
                hint: OBJECT_HINTS[id],
              }))}
              value={form.object}
              onPick={pickObject}
            />
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-800">2. Размеры</h2>
            <Stepper
              label={form.object === 'landscape' ? 'Глубина участка' : 'Длина'}
              unit="м"
              value={form.length}
              min={spec.length[0]}
              max={spec.length[1]}
              step={form.object === 'landscape' ? 1 : 0.5}
              onChange={(length) => setForm((f) => ({ ...f, length }))}
            />
            <Stepper
              label={form.object === 'landscape' ? 'Ширина по улице' : 'Ширина'}
              unit="м"
              value={form.width}
              min={spec.width[0]}
              max={spec.width[1]}
              step={form.object === 'landscape' ? 1 : 0.5}
              onChange={(width) => setForm((f) => ({ ...f, width }))}
            />
            {spec.floors[1] > 1 && (
              <Stepper
                label="Этажей"
                value={form.floors}
                min={spec.floors[0]}
                max={spec.floors[1]}
                step={1}
                onChange={(floors) => setField({ floors })}
              />
            )}
            {spec.roomsLabel && (
              <Stepper
                label={spec.roomsLabel}
                value={form.rooms}
                min={spec.rooms[0]}
                max={spec.rooms[1]}
                step={1}
                onChange={(rooms) => setField({ rooms })}
              />
            )}
            <p className="text-xs text-slate-500">
              {form.object === 'landscape'
                ? `Площадь участка ${((form.length * form.width) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} сот.`
                : form.object === 'flat'
                  ? `Площадь ${(form.length * form.width).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м²`
                  : `Площадь застройки ${(form.length * form.width).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м² по наружным стенам`}
            </p>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">3. Стиль</h2>
            <Chips
              label="Стиль"
              items={STYLE_IDS.map((id) => ({ id, title: STYLES[id].title }))}
              value={form.style}
              onPick={(style) => setField({ style })}
            />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">4. Бюджет отделки</h2>
            <Chips
              label="Бюджет"
              items={BUDGET_IDS.map((id) => ({ id, ...BUDGETS[id] }))}
              value={form.budget}
              onPick={(budget) => setField({ budget })}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generate}
              className={`${pill} bg-amber-500 text-slate-950 hover:bg-amber-400`}
            >
              Сгенерировать
            </button>
            {current && (
              <button
                type="button"
                onClick={another}
                className={`${pill} bg-white text-slate-900 ring-1 ring-slate-300 hover:ring-slate-500`}
              >
                Ещё вариант
              </button>
            )}
          </div>
        </section>
      )}

      <div ref={result} className="scroll-mt-24">
        {project && (
          <DesignResult
            d={project}
            floor={floor}
            setFloor={setFloor}
            onAnother={another}
            consult={consult}
            setConsult={setConsult}
            summary={summary}
          />
        )}
      </div>
    </div>
  );
}

function DesignResult({
  d,
  floor,
  setFloor,
  onAnother,
  consult,
  setConsult,
  summary,
}: {
  d: DesignProject;
  floor: number;
  setFloor: (n: number) => void;
  onAnother: () => void;
  consult: boolean;
  setConsult: (v: boolean) => void;
  summary: string;
}) {
  const p = d.params;
  const floors = d.building?.floors ?? [];
  const facts = d.spec
    ? [
        `${d.spec.totals.area.toLocaleString('ru-RU')} м² помещений`,
        `${d.spec.rows.length} помещ.`,
        `окон ${d.spec.totals.windows}, дверей ${d.spec.totals.doors}`,
      ]
    : d.landscape
      ? [
          `${((d.landscape.W * d.landscape.L) / 100).toLocaleString('ru-RU')} сот.`,
          `газон ${d.landscape.lawn.toLocaleString('ru-RU')} м²`,
          `деревьев ${d.landscape.trees.length}`,
        ]
      : [];
  const canBuild = p.object !== 'flat';
  return (
    <article className="dz-print flex min-w-0 flex-col gap-5" aria-labelledby="dz-title">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
          Дизайн-проект {SITE.name} · {d.code}
        </p>
        <h2
          id="dz-title"
          className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl"
        >
          {d.title}
        </h2>
        <p className="text-sm text-slate-600">
          {d.style.title} · бюджет {BUDGETS[p.budget].title.toLowerCase()} · {facts.join(' · ')}
        </p>
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">
          {DESIGN_DISCLAIMER}.
        </p>
      </header>

      <div className="dz-noprint flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAnother}
          className={`${pill} bg-slate-900 text-white hover:bg-slate-800`}
        >
          Ещё вариант
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className={`${pill} bg-white text-slate-900 ring-1 ring-slate-300 hover:ring-slate-500`}
        >
          Скачать PDF
        </button>
        <a
          href={`${SITE.whatsappHref}?text=${encodeURIComponent(summary)}`}
          target="_blank"
          rel="noopener"
          className={`${pill} bg-emerald-700 text-white hover:bg-emerald-600`}
        >
          Отправить в WhatsApp
        </a>
      </div>

      <section
        className="dz-sheet min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4"
        aria-label="План"
      >
        {floors.length > 1 && (
          <div className="dz-noprint mb-3 flex gap-2" role="tablist" aria-label="Этаж">
            {floors.map((f) => (
              <button
                key={f.index}
                type="button"
                role="tab"
                aria-selected={floor === f.index}
                onClick={() => setFloor(f.index)}
                className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
                  floor === f.index ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-300'
                }`}
              >
                {f.index + 1} этаж
              </button>
            ))}
          </div>
        )}
        {d.building &&
          floors.map((f) => (
            <div
              key={f.index}
              className={`dz-plan ${f.index === floor ? '' : 'hidden print:block'}`}
            >
              <FloorPlanSvg
                building={d.building!}
                floor={f}
                title={d.title}
                code={d.code}
                styleTitle={d.style.title}
                className="mx-auto block h-auto max-h-[80vh] w-full"
              />
            </div>
          ))}
        {d.landscape && (
          <div className="dz-plan">
            <LandscapePlanSvg
              land={d.landscape}
              title={d.title}
              code={d.code}
              styleTitle={d.style.title}
              className="mx-auto block h-auto max-h-[85vh] w-full"
            />
          </div>
        )}
        {d.notes.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-xs text-slate-500">
            {d.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="dz-noprint min-w-0" aria-label="3D-схема">
        <IsoView model={d.iso} title={d.title} />
      </section>

      <div className="dz-funnel dz-noprint flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-white sm:p-5">
        <h2 className="text-lg font-bold">Воплотить проект с {SITE.name}</h2>
        <div className="flex flex-wrap gap-3">
          {canBuild && (
            <a
              href={smetaHref(p)}
              className={`${pill} bg-amber-500 text-slate-950 hover:bg-amber-400`}
            >
              {p.object === 'landscape'
                ? 'Посчитать планировку участка'
                : 'Посчитать стройку по этому проекту'}
            </a>
          )}
          <a
            href={smetaHref(p, true)}
            className={`${pill} bg-white text-slate-900 hover:bg-amber-100`}
          >
            Материалы под этот дизайн от {SITE.name} с доставкой
          </a>
          {p.object === 'landscape' && (
            <a
              href="/?m=backhoe#podbor"
              className={`${pill} bg-amber-400 text-slate-950 hover:bg-amber-300`}
            >
              Земляные работы, планировка, вывоз грунта — техника {SITE.name}
            </a>
          )}
          <button
            type="button"
            onClick={() => setConsult(!consult)}
            aria-expanded={consult}
            className={`${pill} bg-slate-700 text-white ring-1 ring-slate-500 hover:bg-slate-600`}
          >
            Заказать консультацию
          </button>
        </div>
        {consult && (
          <div className="rounded-2xl bg-white p-4 text-slate-900 sm:p-5">
            <CallbackForm
              source="dizain"
              defaultMessage={summary}
              title="Консультация по дизайн-проекту"
              subtitle={`Специалист ${SITE.name} обсудит проект, материалы и стройку. ${SITE.callbackPromise}.`}
            />
          </div>
        )}
      </div>

      <StyleBoard d={d} />
      <SpecSheet d={d} />

      <section className="dz-sheet rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 sm:p-5">
        <h2 className="text-base font-bold text-slate-900">Что входит в эскизный дизайн-проект</h2>
        <ul className="mt-2 grid list-disc gap-1 pl-5 sm:grid-cols-2">
          {PROJECT_CONTENTS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs">
          {DESIGN_DISCLAIMER}. Для стройки нужны рабочие чертежи: конструктив, инженерные сети,
          фундамент по геологии. {SITE.name} · {SITE.phone}
        </p>
      </section>
    </article>
  );
}
