'use client';

import { useId, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { SITE } from '@/lib/site';
import { submitLead } from '@/lib/submitLead';

// Card actions: «Заказать» opens a short inline order form (phone, optional
// name, consent) that sends a lead without leaving the catalog; «Подробнее»
// goes to the machine page.
export function QuickOrder({
  equipmentId,
  equipmentName,
  priceSummary,
  detailsHref,
}: {
  equipmentId: string;
  equipmentName: string;
  /** Headline price shown on the card, repeated in the lead message. */
  priceSummary: string;
  detailsHref: string;
}) {
  const formId = useId();
  const phoneRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) requestAnimationFrame(() => phoneRef.current?.focus());
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus('sending');
    try {
      await submitLead({
        name,
        phone,
        consent,
        website,
        source: `catalog-card:${equipmentId}`,
        message: `Заказ из каталога: ${equipmentName}${priceSummary ? ` (${priceSummary})` : ''}`,
      });
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(
        `${err instanceof Error ? err.message : 'Не удалось отправить'}. Или позвоните: ${SITE.phone}`,
      );
    }
  }

  if (status === 'sent') {
    return (
      <div
        role="status"
        className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-600/15"
      >
        <p className="font-semibold">Заявка принята</p>
        <p className="mt-1 text-emerald-800">
          {SITE.callbackPromise}. Срочно —{' '}
          <a href={SITE.phoneHref} className="font-semibold underline">
            {SITE.phone}
          </a>
        </p>
      </div>
    );
  }

  const input =
    'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={formId}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            open
              ? 'bg-slate-900 text-white hover:bg-slate-800'
              : 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 hover:bg-amber-400'
          }`}
        >
          {open ? 'Свернуть' : 'Заказать'}
        </button>
        <a
          href={detailsHref}
          className="group inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:border-slate-900"
        >
          Подробнее
          <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </a>
      </div>

      {open && (
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3"
        >
          <p className="text-xs text-slate-600">{SITE.callbackPromise}.</p>
          <input
            ref={phoneRef}
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            placeholder="Телефон, +7 (___) ___-__-__"
            autoComplete="tel"
            inputMode="tel"
            aria-label="Телефон"
            className={input}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Имя (необязательно)"
            autoComplete="name"
            aria-label="Имя (необязательно)"
            className={input}
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
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-amber-600"
            />
            <span>
              Согласен(на) на обработку персональных данных по{' '}
              <a href="/privacy" className="underline" target="_blank">
                политике конфиденциальности
              </a>
            </span>
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={status === 'sending'}
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {status === 'sending' ? 'Отправляем…' : 'Жду звонка'}
            <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
        </form>
      )}
    </div>
  );
}
