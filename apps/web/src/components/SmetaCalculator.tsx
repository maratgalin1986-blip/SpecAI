'use client';

import { useMemo, useState } from 'react';
import { CallbackForm } from '@/components/CallbackForm';
import { MACHINE_WORKS } from '@/lib/machineWorks';
import { SITE } from '@/lib/site';
import {
  buildSmeta,
  SMETA_JOBS,
  smetaText,
  type FieldId,
  type Option,
  type SmetaInput,
} from '@/lib/smeta';

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

// The estimate builder on /smeta: job → sizes → machines, hours and money,
// live. «Примерная» everywhere: the dispatcher names the exact price.
export function SmetaCalculator({ initialJob }: { initialJob?: string }) {
  const [jobId, setJobId] = useState(
    SMETA_JOBS.some((job) => job.id === initialJob) ? initialJob! : SMETA_JOBS[0]!.id,
  );
  const job = SMETA_JOBS.find((item) => item.id === jobId)!;
  const [values, setValues] = useState<Partial<Record<FieldId, number>>>({});
  const [options, setOptions] = useState<Partial<Record<Option, boolean>>>({});
  const [sendText, setSendText] = useState<string | null>(null);

  const input: SmetaInput = { ...values, options };
  const smeta = useMemo(() => buildSmeta(jobId, { ...values, options }), [jobId, values, options]);
  if (!smeta) return null;
  const text = smetaText(smeta, input);
  const firstMachine = smeta.rows[0]?.machine;
  const wizard =
    firstMachine && MACHINE_WORKS[firstMachine] ? `/?m=${firstMachine}#podbor` : '/#podbor';

  function pick(id: string) {
    setJobId(id);
    setValues({});
    setOptions({});
    setSendText(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {SMETA_JOBS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => pick(item.id)}
            aria-pressed={item.id === jobId}
            className={`rounded-2xl border p-3 text-left text-sm transition ${
              item.id === jobId
                ? 'border-amber-500 bg-amber-50 text-slate-950'
                : 'border-slate-200 bg-white hover:border-slate-400'
            }`}
          >
            <span className="block font-semibold">{item.title}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{item.hint}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold">{job.title}</h2>
          {job.fields.map((f) => {
            const value = values[f.id] ?? f.initial;
            const set = (next: number) =>
              setValues((current) => ({
                ...current,
                [f.id]: Math.min(f.max, Math.max(f.min, Math.round(next / f.step) * f.step)),
              }));
            return (
              <label key={f.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">
                  {f.label}, {f.unit}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => set(value - f.step)}
                    className="h-10 w-10 rounded-full border border-slate-300 text-lg"
                    aria-label={`Меньше: ${f.label}`}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={value}
                    onChange={(event) => {
                      const next = Number(event.target.value.replace(',', '.'));
                      if (Number.isFinite(next)) setValues((c) => ({ ...c, [f.id]: next }));
                    }}
                    onBlur={() => set(value)}
                    aria-label={f.label}
                    className="h-10 w-20 rounded-lg border border-slate-300 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => set(value + f.step)}
                    className="h-10 w-10 rounded-full border border-slate-300 text-lg"
                    aria-label={`Больше: ${f.label}`}
                  >
                    +
                  </button>
                </span>
              </label>
            );
          })}
          {job.options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={options[o.id] ?? o.initial}
                onChange={(event) => setOptions((c) => ({ ...c, [o.id]: event.target.checked }))}
              />
              {o.label}
            </label>
          ))}
        </section>

        <section
          className="work-order hud-corners relative flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-200"
          aria-live="polite"
        >
          <div className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-amber-400">
            Примерная смета · {SITE.name}
          </div>
          <ul className="flex flex-col divide-y divide-dashed divide-slate-700 text-sm">
            {smeta.rows.map((r) => (
              <li key={r.machine + r.task} className="py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-white">{r.name}</span>
                  <span className="shrink-0 font-semibold text-white">{rub(r.sum)}</span>
                </div>
                <div className="text-xs text-slate-400">
                  {r.hours} ч × {rub(r.rate)} · {r.task}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t border-slate-700 pt-3">
            <span className="text-sm text-slate-400">Итого примерно</span>
            <span className="text-2xl font-extrabold text-amber-400">
              {rub(smeta.total)} – {rub(smeta.totalHigh)}
            </span>
          </div>
          <ul className="list-disc pl-4 text-xs text-slate-400">
            {smeta.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-200">
            Смета примерная и не является предложением. Точную цену назовёт диспетчер {SITE.name}{' '}
            после уточнения грунта, подъезда и сроков. Все цены — с машинистом.
          </p>
        </section>
      </div>

      {sendText ? (
        <CallbackForm
          source="smeta"
          defaultMessage={sendText}
          title="Отправить смету диспетчеру"
          subtitle={`Диспетчер ${SITE.name} проверит расчёт и назовёт точную цену.`}
        />
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setSendText(text)}
            className="inline-flex min-h-12 items-center rounded-full bg-amber-500 px-6 font-semibold text-slate-950 hover:bg-amber-400"
          >
            Отправить смету диспетчеру {SITE.name}
          </button>
          <a
            href={`${SITE.whatsappHref}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-12 items-center rounded-full bg-emerald-700 px-6 font-semibold text-white hover:bg-emerald-600"
          >
            Отправить в WhatsApp
          </a>
          <a
            href={wizard}
            className="inline-flex min-h-12 items-center rounded-full px-6 font-semibold ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Оформить наряд
          </a>
        </div>
      )}
    </div>
  );
}
