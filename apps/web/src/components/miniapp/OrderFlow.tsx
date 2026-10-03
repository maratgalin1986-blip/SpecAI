'use client';

import { useEffect, useRef, useState } from 'react';
import { ConsentText } from '@/components/ConsentText';
import {
  MINI_APP_MACHINES,
  WHEN_OPTIONS,
  WHERE_OPTIONS,
  machineBySlug,
  miniAppSource,
  orderMessage,
  phoneOk,
  priceLine,
} from '@/lib/miniApp';
import { SHIFT_HOURS } from '@/lib/prices';
import { isOnShift, SITE } from '@/lib/site';
import { ANONYMOUS_LEAD_NAME, leadErrorText, readLeadDraft, submitLead } from '@/lib/submitLead';
import type { TgWebApp } from './telegram';

// «Заказать»: machine → when and where → contacts. Inside Telegram the main
// action is Telegram's MainButton (and BackButton goes a step back); in a
// browser the same actions are ordinary buttons. The lead goes through the
// site's usual pipeline (lib/submitLead.ts → /api/leads).

type Step = 1 | 2 | 3;

const chip = (on: boolean) =>
  `rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
    on
      ? 'border-amber-400 bg-amber-500 text-slate-950'
      : 'border-slate-700 bg-slate-900 text-slate-100 active:bg-slate-800'
  }`;

export function OrderFlow({
  tg,
  active,
  initialSlug,
  startParam,
}: {
  tg: TgWebApp | null;
  /** The «Заказать» tab is shown (Telegram's buttons belong to it only). */
  active: boolean;
  /** Preselected machine; a new value restarts the form at step 2. */
  initialSlug: { slug: string | null; at: number };
  startParam: string;
}) {
  const [step, setStep] = useState<Step>(1);
  const [slug, setSlug] = useState<string | null>(null);
  const [when, setWhen] = useState('');
  const [where, setWhere] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [onShift, setOnShift] = useState(true);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const draft = readLeadDraft();
    if (draft?.phone) setPhone(draft.phone);
    if (draft?.name && draft.name !== ANONYMOUS_LEAD_NAME) setName(draft.name);
  }, []);

  useEffect(() => {
    if (!initialSlug.at) return;
    const machine = machineBySlug(initialSlug.slug);
    setSlug(machine?.slug ?? null);
    setStep(machine ? 2 : 1);
    setStatus('idle');
    setError(null);
  }, [initialSlug]);

  useEffect(() => {
    topRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const machine = machineBySlug(slug);
  const price = machine ? priceLine(machine.type) : null;
  const canNext =
    step === 1 ? Boolean(machine) : step === 2 ? Boolean(when && where) : phoneOk(phone) && consent;

  async function send() {
    if (!machine || status === 'sending') return;
    setError(null);
    setStatus('sending');
    try {
      await submitLead({
        name,
        phone,
        message: orderMessage({ machine, when, where }),
        source: miniAppSource(startParam),
        consent,
        website,
      });
      setOnShift(isOnShift());
      setStatus('sent');
      tg?.HapticFeedback?.notificationOccurred?.('success');
    } catch (err) {
      setStatus('idle');
      setError(leadErrorText(err, SITE.phone));
      tg?.HapticFeedback?.notificationOccurred?.('error');
    }
  }

  function next() {
    if (!canNext) return;
    if (step < 3) setStep((step + 1) as Step);
    else void send();
  }

  function back() {
    if (step > 1) setStep((step - 1) as Step);
  }

  // Telegram's MainButton and BackButton mirror the form's own buttons.
  const nextRef = useRef(next);
  const backRef = useRef(back);
  nextRef.current = next;
  backRef.current = back;
  useEffect(() => {
    const main = tg?.MainButton;
    const backButton = tg?.BackButton;
    if (!main) return;
    const onMain = () => nextRef.current();
    const onBack = () => backRef.current();
    main.onClick(onMain);
    backButton?.onClick(onBack);
    return () => {
      main.offClick(onMain);
      main.hide();
      backButton?.offClick(onBack);
      backButton?.hide();
    };
  }, [tg]);

  useEffect(() => {
    const main = tg?.MainButton;
    if (!main) return;
    if (!active || status === 'sent') {
      main.hide();
      tg?.BackButton?.hide();
      return;
    }
    main.setParams({
      text: step === 3 ? 'Отправить заявку' : 'Далее',
      color: canNext ? '#f59e0b' : '#334155',
      text_color: canNext ? '#020617' : '#94a3b8',
      is_active: canNext && status !== 'sending',
      is_visible: true,
    });
    if (status === 'sending') main.showProgress?.(false);
    else main.hideProgress?.();
    if (step > 1) tg?.BackButton?.show();
    else tg?.BackButton?.hide();
  }, [tg, active, step, canNext, status]);

  if (status === 'sent') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-3xl text-slate-950">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-white">Заявка принята</h2>
        <p className="text-slate-300">
          {onShift
            ? `${SITE.callbackPromise}.`
            : 'Сейчас нерабочее время — позвоним с 8:00 по Москве.'}
        </p>
        <a
          href={SITE.phoneHref}
          className="mt-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-white"
        >
          Позвонить: {SITE.phone}
        </a>
        <button
          type="button"
          onClick={() => {
            setStatus('idle');
            setStep(1);
            setSlug(null);
            setWhen('');
            setWhere('');
            setConsent(false);
          }}
          className="text-sm text-amber-400 underline"
        >
          Новая заявка
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={topRef}
        className="ym-hide-content flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4"
      >
        <ol className="mb-4 flex gap-1.5" aria-label={`Шаг ${step} из 3`}>
          {[1, 2, 3].map((n) => (
            <li
              key={n}
              className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-amber-500' : 'bg-slate-800'}`}
            />
          ))}
        </ol>

        {step === 1 && (
          <section>
            <h2 className="mb-3 text-xl font-bold text-white">Какая техника нужна?</h2>
            <div className="grid grid-cols-2 gap-2">
              {MINI_APP_MACHINES.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  aria-pressed={slug === item.slug}
                  onClick={() => {
                    setSlug(item.slug);
                    tg?.HapticFeedback?.impactOccurred?.('light');
                  }}
                  className={`${chip(slug === item.slug)} text-left`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-col gap-5">
            <div>
              <h2 className="mb-3 text-xl font-bold text-white">Когда?</h2>
              <div className="grid grid-cols-2 gap-2">
                {WHEN_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={when === option}
                    onClick={() => setWhen(option)}
                    className={chip(when === option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-3 text-xl font-bold text-white">Где?</h2>
              <div className="grid grid-cols-2 gap-2">
                {WHERE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={where === option}
                    onClick={() => setWhere(option)}
                    className={chip(where === option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              next();
            }}
          >
            <h2 className="text-xl font-bold text-white">Куда перезвонить?</h2>
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Имя (необязательно)"
              autoComplete="name"
              aria-label="Имя (необязательно)"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-base text-white placeholder:text-slate-500"
            />
            <input
              required
              type="tel"
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
              placeholder="+7 (___) ___-__-__"
              autoComplete="tel"
              inputMode="tel"
              aria-label="Телефон"
              aria-invalid={phone !== '' && !phoneOk(phone)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-base text-white placeholder:text-slate-500"
            />
            {phone !== '' && !phoneOk(phone) && (
              <p className="text-xs text-slate-400">Номер полностью: от 10 цифр</p>
            )}
            {/* Honeypot for bots — hidden from people and screen readers. */}
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="hidden"
              aria-hidden
              name="website"
            />
            <label className="flex items-start gap-2 text-xs text-slate-300 [&_a]:text-amber-400">
              <input
                type="checkbox"
                required
                name="consent"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-amber-500"
              />
              <ConsentText />
            </label>
            {/* Enter in a field submits; the visible button is below (or Telegram's). */}
            <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
          </form>
        )}

        {machine && price && (
          <p className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">
            <span className="font-semibold text-white">{machine.label}</span>: ориентировочно{' '}
            <span className="font-semibold text-amber-400">{price.hour}</span>, смена {SHIFT_HOURS}{' '}
            ч {price.shift}. Точную цену с подачей назовёт диспетчер.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>

      {!tg && (
        <div className="flex gap-2 border-t border-slate-800 bg-slate-950 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
          {step > 1 && (
            <button
              type="button"
              onClick={back}
              className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200"
            >
              Назад
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={!canNext || status === 'sending'}
            className="flex-1 rounded-xl bg-amber-500 px-5 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-amber-600/30 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
          >
            {step < 3 ? 'Далее' : status === 'sending' ? 'Отправляем…' : 'Отправить заявку'}
          </button>
        </div>
      )}
    </div>
  );
}
