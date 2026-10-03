'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { rub, SHIFT_HOURS } from '@/lib/equipmentCatalog';
import { SITE } from '@/lib/site';
import { submitLead, leadErrorText } from '@/lib/submitLead';
import { LeadSuccess } from '@/components/LeadSuccess';
import { ConsentText } from '@/components/ConsentText';
import { useHydrated } from '@/lib/useHydrated';

type Mode = 'hours' | 'shifts';

const LIMITS: Record<Mode, { min: number; max: number; initial: number }> = {
  hours: { min: 1, max: 240, initial: SHIFT_HOURS },
  shifts: { min: 1, max: 60, initial: 1 },
};

function unitLabel(mode: Mode, n: number) {
  if (mode === 'hours') return 'ч';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'смена';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'смены';
  return 'смен';
}

// Price box on the machine page: hours or shifts → live estimate from the
// listed rates, and a phone-only lead with the estimate in the message.
export function EstimateBox({
  equipmentId,
  equipmentName,
  hourlyRate,
  shiftRate,
  hammerRate,
  showVatNote,
  statusNote,
}: {
  equipmentId: string;
  equipmentName: string;
  hourlyRate: number | null;
  shiftRate: number | null;
  /** Hourly rate with a hydraulic hammer, when the listing's specs give one. */
  hammerRate?: number;
  /** «Работаем с НДС» — only for the company's own fleet. */
  showVatNote: boolean;
  /** Shown when the machine isn't free right now. */
  statusNote?: string;
}) {
  const modes: Mode[] = [
    ...(hourlyRate !== null ? (['hours'] as const) : []),
    ...(shiftRate !== null ? (['shifts'] as const) : []),
  ];
  const [mode, setMode] = useState<Mode>(modes[0] ?? 'shifts');
  const [quantity, setQuantity] = useState<Record<Mode, number>>({
    hours: LIMITS.hours.initial,
    shifts: LIMITS.shifts.initial,
  });
  const [hammer, setHammer] = useState(false);
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);

  const qty = quantity[mode];
  const withHammer = hammer && hammerRate !== undefined;
  // With the hammer a shift is billed as 8 hammer-hours.
  const rate =
    mode === 'hours'
      ? withHammer
        ? hammerRate!
        : hourlyRate
      : withHammer
        ? hammerRate! * SHIFT_HOURS
        : shiftRate;
  const total = rate !== null ? rate * qty : null;

  function setQty(value: number) {
    const { min, max } = LIMITS[mode];
    const next = Math.round(Number.isFinite(value) ? value : min);
    setQuantity((current) => ({ ...current, [mode]: Math.min(max, Math.max(min, next)) }));
  }

  const breakdown =
    rate !== null
      ? `${rub(rate)} × ${qty} ${unitLabel(mode, qty)}${withHammer ? ', гидромолот' : ''}`
      : '';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus('sending');
    try {
      await submitLead({
        phone,
        consent,
        website,
        source: `estimate:${equipmentId}`,
        message:
          `Интересует: ${equipmentName}${withHammer ? ' с гидромолотом' : ''}. ` +
          (total !== null
            ? `Расчёт на сайте: ${breakdown} = ${rub(total)} (предварительно, без доставки).`
            : 'Цена по запросу.'),
      });
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(leadErrorText(err, SITE.phone));
    }
  }

  const stepButton =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-300 text-lg font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-950 disabled:opacity-40';

  return (
    <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow text-[0.65rem] text-amber-700">Расчёт стоимости</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {hourlyRate !== null && (
              <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
                {rub(hourlyRate)}
                <span className="text-sm font-medium text-slate-500">/ч</span>
              </span>
            )}
            {shiftRate !== null && (
              <span
                className={`font-mono tabular-nums ${hourlyRate !== null ? 'text-sm text-slate-600' : 'text-2xl font-bold tracking-tight'}`}
              >
                {rub(shiftRate)}
                <span className="text-sm font-medium text-slate-500">/смена 8 ч</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {statusNote && (
        <p className="rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600">{statusNote}</p>
      )}

      {total !== null && (
        <>
          {modes.length > 1 && (
            <div
              role="radiogroup"
              aria-label="Считать"
              className="grid grid-cols-2 rounded-full bg-slate-100 p-1 text-sm font-semibold"
            >
              {modes.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={mode === option}
                  onClick={() => setMode(option)}
                  className={`rounded-full px-3 py-2 transition ${
                    mode === option
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {option === 'hours' ? 'По часам' : 'По сменам'}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              className={stepButton}
              onClick={() => setQty(qty - 1)}
              disabled={qty <= LIMITS[mode].min}
              aria-label="Меньше"
            >
              −
            </button>
            <label className="flex flex-1 flex-col items-center">
              <span className="sr-only">
                {mode === 'hours' ? 'Количество часов' : 'Количество смен'}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={LIMITS[mode].min}
                max={LIMITS[mode].max}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-full rounded-lg bg-transparent text-center font-mono text-3xl font-bold tabular-nums outline-none [appearance:textfield] focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2 [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="eyebrow text-[0.6rem] text-slate-500">
                {mode === 'hours' ? 'часов работы' : `${unitLabel(mode, qty)} по 8 ч`}
              </span>
            </label>
            <button
              type="button"
              className={stepButton}
              onClick={() => setQty(qty + 1)}
              disabled={qty >= LIMITS[mode].max}
              aria-label="Больше"
            >
              +
            </button>
          </div>

          {hammerRate !== undefined && (
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm">
              <span>
                С гидромолотом{' '}
                <span className="font-mono text-xs text-slate-500">{rub(hammerRate)}/ч</span>
              </span>
              <input
                type="checkbox"
                checked={hammer}
                onChange={(e) => setHammer(e.target.checked)}
                className="h-4 w-4 accent-amber-600"
              />
            </label>
          )}

          <div className="rounded-2xl bg-slate-950 p-4 text-white">
            <div className="flex items-baseline justify-between gap-3">
              <span className="eyebrow text-[0.6rem] text-slate-400">Итого примерно</span>
              <span className="font-mono text-xs text-slate-400">{breakdown}</span>
            </div>
            <div
              className="mt-1 font-mono text-4xl font-bold tabular-nums tracking-tight text-amber-400"
              aria-live="polite"
            >
              {rub(total)}
            </div>
            <ul className="mt-3 flex flex-col gap-1 text-xs text-slate-300">
              <li>Предварительно, без доставки</li>
              {showVatNote && <li>Работаем с НДС</li>}
            </ul>
          </div>
        </>
      )}

      {status === 'sent' ? (
        <LeadSuccess
          summary={`${equipmentName}${total !== null ? `, расчёт ${rub(total)}` : ''}`}
        />
      ) : (
        <form method="post" onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-3">
          <input
            required
            type="tel"
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            placeholder="Телефон, +7 (___) ___-__-__"
            autoComplete="tel"
            inputMode="tel"
            aria-label="Телефон"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-amber-700 focus:ring-2 focus:ring-amber-700"
          />
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="hidden"
            aria-hidden
            name="website"
          />
          <label className="flex items-start gap-2 text-xs leading-snug text-slate-600">
            <input
              type="checkbox"
              required
              name="consent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-amber-600"
            />
            <ConsentText />
          </label>
          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!hydrated || status === 'sending'}
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-5 py-3.5 text-base font-semibold text-slate-950 shadow-lg shadow-amber-500/30 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {status === 'sending'
              ? 'Отправляем…'
              : total !== null
                ? 'Заказать по расчёту'
                : 'Узнать цену'}
            <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" />
          </button>
          <p className="text-center text-xs text-slate-500">{SITE.callbackPromise}</p>
        </form>
      )}

      {/* Phones already have a fixed call / WhatsApp bar at the bottom. */}
      <div className="hidden grid-cols-2 gap-2 sm:grid">
        <a
          href={SITE.phoneHref}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 px-3 py-2.5 text-sm font-semibold transition hover:border-slate-900"
        >
          <Icon name="phone" className="h-4 w-4 text-amber-700" />
          Позвонить
        </a>
        <a
          href={SITE.whatsappHref}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-600/40 px-3 py-2.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-600 hover:bg-emerald-50"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z" />
          </svg>
          WhatsApp
        </a>
      </div>
    </div>
  );
}
