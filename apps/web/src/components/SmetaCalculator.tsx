'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { SmetaCtas, SmetaDisclaimer } from '@/components/SmetaCtas';
import { SmetaProjectResult } from '@/components/SmetaProjectResult';
import { SmetaSnabResult } from '@/components/SmetaSnabResult';
import { SITE } from '@/lib/site';
import {
  buildSmeta,
  SMETA_JOBS,
  smetaText,
  type FieldId,
  type Option,
  type SmetaInput,
} from '@/lib/smeta';
import { jobScene } from '@/lib/smeta3d';
import { jobSnab, projectSnab } from '@/lib/smetaSnab';
import {
  buildProject,
  FOUNDATIONS,
  normalizeInput,
  OBJECTS,
  SOILS,
  type Foundation,
  type ObjectType,
  type ProjectInput,
  type Soil,
} from '@/lib/smetaProject';

const Smeta3D = dynamic(() => import('@/components/Smeta3D').then((m) => m.Smeta3D), {
  ssr: false,
  loading: () => <div className="h-72 rounded-xl border border-cyan-900 bg-[#0a1a2f]" />,
});

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

type Mode = 'project' | 'job';
export type Audience = 'foreman' | 'snab';

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const set = (next: number) =>
    onChange(Math.min(max, Math.max(min, Math.round(next / step) * step)));
  const round = 'h-10 w-10 shrink-0 rounded-full border border-slate-300 text-lg';
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-700">
        {label}, {unit}
      </span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => set(value - step)}
          className={round}
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
            const next = Number(e.target.value.replace(',', '.'));
            if (Number.isFinite(next)) onChange(next);
          }}
          onBlur={() => set(value)}
          aria-label={label}
          className="h-10 w-16 rounded-lg border border-slate-300 text-center"
        />
        <button
          type="button"
          onClick={() => set(value + step)}
          className={round}
          aria-label={`Больше: ${label}`}
        >
          +
        </button>
      </span>
    </label>
  );
}

function Choice<T extends string>({
  items,
  value,
  onPick,
  cols = 'grid-cols-2 sm:grid-cols-3',
}: {
  items: { id: T; title: string; hint?: string }[];
  value: T | null;
  onPick: (id: T) => void;
  cols?: string;
}) {
  return (
    <div className={`grid gap-2 ${cols}`}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item.id)}
          aria-pressed={item.id === value}
          className={`min-w-0 rounded-2xl border p-3 text-left text-sm transition ${
            item.id === value
              ? 'border-amber-500 bg-amber-50 text-slate-950'
              : 'border-slate-200 bg-white hover:border-slate-400'
          }`}
        >
          <span className="block font-semibold">{item.title}</span>
          {item.hint && <span className="mt-0.5 block text-xs text-slate-500">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}

// «Процесс идёт»: the lines of the plan appear one by one, then the result.
function Calculating({ lines, onDone }: { lines: string[]; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      onDone();
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i > lines.length) {
        window.clearInterval(id);
        onDone();
      }
    }, 320);
    return () => window.clearInterval(id);
  }, []);
  return (
    <section
      className="rounded-2xl border border-cyan-900 bg-[#0a1a2f] p-5 font-mono text-sm text-cyan-200"
      aria-live="polite"
    >
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-cyan-400">Считаем смету…</p>
      <ul className="flex flex-col gap-1">
        {lines.slice(0, shown).map((line) => (
          <li key={line}>✓ {line}</li>
        ))}
      </ul>
    </section>
  );
}

// The estimate on /smeta as a guided process: what we build → sizes →
// foundation and soil → soil haul → «считаем» → the result. «Одна работа»
// keeps the single-operation calculator (trench, pit, crane…).
export function SmetaCalculator({
  initialJob,
  initialAudience = 'foreman',
}: {
  initialJob?: string;
  initialAudience?: Audience;
}) {
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const knownJob = SMETA_JOBS.some((job) => job.id === initialJob);
  const [mode, setMode] = useState<Mode>(knownJob ? 'job' : 'project');
  const [step, setStep] = useState(knownJob ? 1 : 0);
  const [phase, setPhase] = useState<'form' | 'calc' | 'result'>('form');

  // Whole project.
  const [p, setP] = useState<ProjectInput>(normalizeInput({ object: 'house' }));
  const project = useMemo(() => buildProject(p), [p]);
  const spec = OBJECTS[p.object];

  // One job.
  const [jobId, setJobId] = useState(knownJob ? initialJob! : SMETA_JOBS[0]!.id);
  const job = SMETA_JOBS.find((item) => item.id === jobId)!;
  const [values, setValues] = useState<Partial<Record<FieldId, number>>>({});
  const [options, setOptions] = useState<Partial<Record<Option, boolean>>>({});
  const input: SmetaInput = useMemo(() => ({ ...values, options }), [values, options]);
  const smeta = useMemo(() => buildSmeta(jobId, input), [jobId, input]);
  const scene = useMemo(() => (smeta ? jobScene(smeta, input) : null), [smeta, input]);

  const steps =
    mode === 'project'
      ? p.object === 'site' || p.object === 'strip'
        ? ['Что строим', 'Размеры', 'Грунт', 'Вывоз']
        : ['Что строим', 'Размеры', 'Фундамент и грунт', 'Вывоз']
      : ['Работа', 'Размеры'];
  const last = step === steps.length - 1;

  const setInput = (patch: Partial<ProjectInput>) =>
    setP((cur) => normalizeInput({ ...cur, ...patch }));
  const restart = () => {
    setPhase('form');
    setStep(0);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setStep(0);
    setPhase('form');
  };

  const calcLines =
    mode === 'project'
      ? [
          'Размечаем участок',
          ...project.stages.map((s) => s.title),
          'Подбираем технику СпецПласт16',
          'Считаем часы и сроки',
        ]
      : ['Считаем объём', ...(smeta?.rows.map((r) => r.name) ?? []), 'Считаем часы и цену'];

  const card =
    'flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5';

  const snab = useMemo(
    () =>
      audience !== 'snab'
        ? null
        : mode === 'project'
          ? projectSnab(project, new Date())
          : smeta
            ? jobSnab(smeta, input, new Date())
            : null,
    [audience, mode, project, smeta, input],
  );

  const tab = (active: boolean) =>
    `min-h-11 flex-1 rounded-full px-4 text-sm font-semibold sm:flex-none ${
      active ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-300'
    }`;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div
        className="flex gap-2 rounded-full bg-amber-100 p-1"
        role="group"
        aria-label="Для кого смета"
      >
        {(
          [
            ['foreman', 'Для прораба'],
            ['snab', '📦 Для снабженца'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={audience === id}
            onClick={() => setAudience(id)}
            className={`min-h-10 flex-1 rounded-full px-3 text-sm font-semibold ${
              audience === id ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="-mt-3 text-xs text-slate-500">
        {audience === 'snab'
          ? 'Материалы от СпецПласт16 с запасом и доставкой нашей техникой.'
          : 'Техника СпецПласт16 по этапам: машины, часы, сроки и цена с машинистом.'}
      </p>
      <div className="flex gap-2" role="tablist">
        {(
          [
            ['project', 'Проект целиком'],
            ['job', 'Одна работа'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => switchMode(id)}
            className={tab(mode === id)}
          >
            {label}
          </button>
        ))}
      </div>

      {phase === 'form' && (
        <section className={card}>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Шаг {step + 1} из {steps.length} · {steps[step]}
            </span>
            <span className="flex gap-1" aria-hidden>
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-6 rounded-full ${i <= step ? 'bg-amber-500' : 'bg-slate-200'}`}
                />
              ))}
            </span>
          </div>

          {mode === 'project' && step === 0 && (
            <Choice
              items={(Object.keys(OBJECTS) as ObjectType[]).map((id) => ({ id, ...OBJECTS[id] }))}
              value={p.object}
              onPick={(object) =>
                setP(
                  normalizeInput({
                    ...p,
                    object,
                    length: undefined,
                    width: undefined,
                    foundation: undefined,
                  }),
                )
              }
            />
          )}
          {mode === 'project' && step === 1 && (
            <>
              <h2 className="text-lg font-bold">{spec.title}: размеры</h2>
              <NumberField
                label="Длина"
                unit="м"
                value={p.length}
                min={2}
                max={p.object === 'site' ? 500 : 120}
                step={0.5}
                onChange={(length) => setP({ ...p, length })}
              />
              <NumberField
                label="Ширина"
                unit="м"
                value={p.width}
                min={2}
                max={p.object === 'site' ? 200 : 60}
                step={0.5}
                onChange={(width) => setP({ ...p, width })}
              />
              {spec.maxFloors > 1 && (
                <NumberField
                  label="Этажей"
                  unit="шт"
                  value={p.floors}
                  min={1}
                  max={spec.maxFloors}
                  step={1}
                  onChange={(floors) => setInput({ floors })}
                />
              )}
            </>
          )}
          {mode === 'project' && step === 2 && (
            <>
              {p.object !== 'site' && p.object !== 'strip' && (
                <>
                  <h2 className="font-bold">Фундамент</h2>
                  <Choice
                    cols="grid-cols-3"
                    items={(Object.keys(FOUNDATIONS) as Foundation[]).map((id) => ({
                      id,
                      title: FOUNDATIONS[id],
                    }))}
                    value={p.foundation}
                    onPick={(foundation) => setInput({ foundation })}
                  />
                </>
              )}
              <h2 className="font-bold">Грунт на участке</h2>
              <Choice
                cols="grid-cols-3"
                items={(Object.keys(SOILS) as Soil[]).map((id) => ({ id, title: SOILS[id].title }))}
                value={p.soil}
                onPick={(soil) => setInput({ soil })}
              />
              <p className="text-xs text-slate-500">
                Не знаете — оставьте суглинок, это самый частый грунт в Челнах.
              </p>
            </>
          )}
          {mode === 'project' && step === 3 && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={p.haul}
                  onChange={(e) => setInput({ haul: e.target.checked })}
                />
                Вывезти лишний грунт самосвалами
              </label>
              {p.haul && (
                <NumberField
                  label="До отвала"
                  unit="км"
                  value={p.distance}
                  min={1}
                  max={80}
                  step={1}
                  onChange={(distance) => setP({ ...p, distance })}
                />
              )}
            </>
          )}

          {mode === 'job' && step === 0 && (
            <Choice
              cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
              items={SMETA_JOBS.map((j) => ({ id: j.id, title: j.title, hint: j.hint }))}
              value={jobId}
              onPick={(id) => {
                setJobId(id);
                setValues({});
                setOptions({});
              }}
            />
          )}
          {mode === 'job' && step === 1 && (
            <>
              <h2 className="text-lg font-bold">{job.title}</h2>
              {job.fields.map((f) => (
                <NumberField
                  key={f.id}
                  label={f.label}
                  unit={f.unit}
                  value={values[f.id] ?? f.initial}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  onChange={(v) => setValues((c) => ({ ...c, [f.id]: v }))}
                />
              ))}
              {job.options.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={options[o.id] ?? o.initial}
                    onChange={(e) => setOptions((c) => ({ ...c, [o.id]: e.target.checked }))}
                  />
                  {o.label}
                </label>
              ))}
            </>
          )}

          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="min-h-12 rounded-full px-5 font-semibold ring-1 ring-slate-300"
              >
                Назад
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (last) {
                  setP(normalizeInput(p));
                  setPhase('calc');
                } else setStep(step + 1);
              }}
              className="min-h-12 flex-1 rounded-full bg-amber-500 px-6 font-semibold text-slate-950 hover:bg-amber-400 sm:flex-none"
            >
              {last ? 'Рассчитать смету' : 'Дальше'}
            </button>
          </div>
        </section>
      )}

      {phase === 'calc' && <Calculating lines={calcLines} onDone={() => setPhase('result')} />}

      {phase === 'result' && snab && (
        <SmetaSnabResult
          list={snab}
          onEdit={() => {
            setPhase('form');
            setStep(mode === 'job' ? 1 : 0);
          }}
        />
      )}

      {phase === 'result' && !snab && mode === 'project' && (
        <SmetaProjectResult project={project} onEdit={restart} onSnab={() => setAudience('snab')} />
      )}

      {phase === 'result' && !snab && mode === 'job' && smeta && scene && (
        <JobResult
          title={`${job.title}`}
          text={smetaText(smeta, input)}
          smeta={smeta}
          scene={scene}
          onEdit={() => {
            setPhase('form');
            setStep(1);
          }}
        />
      )}
    </div>
  );
}

function JobResult({
  title,
  text,
  smeta,
  scene,
  onEdit,
}: {
  title: string;
  text: string;
  smeta: NonNullable<ReturnType<typeof buildSmeta>>;
  scene: NonNullable<ReturnType<typeof jobScene>>;
  onEdit: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <Smeta3D scene={scene} title={title} />
      <section
        className="work-order flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-200 sm:p-5"
        aria-live="polite"
      >
        <div className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-amber-400">
          Примерная смета · {SITE.name}
        </div>
        <ul className="flex flex-col divide-y divide-dashed divide-slate-700 text-sm">
          {smeta.rows.map((r) => (
            <li key={r.machine + r.task} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-white">
                  {r.name} {SITE.name}
                </span>
                <span className="shrink-0 font-semibold text-white">{rub(r.sum)}</span>
              </div>
              <div className="text-xs text-slate-400">
                {r.hours} ч × {rub(r.rate)} · {r.task}
              </div>
              <a
                href={`/?m=${r.machine}#podbor`}
                className="text-xs font-semibold text-amber-300 underline"
              >
                Заказать у {SITE.name}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-700 pt-3">
          <span className="text-sm text-slate-400">Итого примерно</span>
          <span className="text-xl font-extrabold text-amber-400 sm:text-2xl">
            {rub(smeta.total)} – {rub(smeta.totalHigh)}
          </span>
        </div>
        <ul className="list-disc pl-4 text-xs text-slate-400">
          {smeta.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <SmetaDisclaimer />
        <button
          type="button"
          onClick={onEdit}
          className="self-start text-sm text-slate-300 underline"
        >
          Изменить размеры
        </button>
      </section>
      <div className="lg:col-span-2">
        <SmetaCtas text={text} machine={smeta.rows[0]?.machine} source="smeta" />
      </div>
    </div>
  );
}
