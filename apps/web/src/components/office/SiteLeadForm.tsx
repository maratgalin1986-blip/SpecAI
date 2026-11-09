'use client';

import { useState } from 'react';
import {
  SITE_LEAD_ENDPOINT,
  SITE_LEAD_LIMITS,
  siteLeadConsentText,
  siteLeadOfflineText,
  siteLeadPayload,
  siteLeadReply,
} from '@/lib/office/clientSite';
import { useHydrated } from '@/lib/useHydrated';

// «Оставить заявку» на клиентском сайте (S4): имя, телефон, комментарий и согласие на
// передачу данных компании. Заявку принимает площадка (/api/office/site-lead, T3) и
// пересылает компании на почту. В превью и на примере форма видна, но выключена: заявки
// принимаются только у опубликованного сайта.

const FIELD =
  'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none disabled:bg-slate-50';

export function SiteLeadForm({
  slug,
  companyTitle,
  companyPhone,
  privacyHref,
  platformName,
  buttonClass,
  disabled = false,
}: {
  /** Адрес сайта /s/<slug>: по нему приём заявки находит компанию. */
  slug: string | null;
  companyTitle: string;
  /** Телефон компании — в подсказках, если заявка не ушла. */
  companyPhone: string;
  /** Абсолютная ссылка на политику конфиденциальности площадки. */
  privacyHref: string;
  platformName: string;
  /** Цвет кнопки по акценту сайта. */
  buttonClass: string;
  /** Превью и пример: поля видны, отправить нельзя. */
  disabled?: boolean;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  const off = disabled || !slug;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (off || !slug || status === 'sending') return;
    setError(null);
    setStatus('sending');
    try {
      const response = await fetch(SITE_LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(siteLeadPayload({ slug, name, phone, message, consent, website })),
      });
      const body: unknown = await response.json().catch(() => null);
      const reply = siteLeadReply(response.status, body, companyPhone);
      if (reply.ok) {
        setStatus('sent');
        return;
      }
      setStatus('idle');
      setError(reply.error);
    } catch {
      setStatus('idle');
      setError(siteLeadOfflineText(companyPhone));
    }
  }

  if (status === 'sent') {
    return (
      <div
        role="status"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"
      >
        <p className="text-lg font-bold">Заявка отправлена — с вами свяжутся</p>
        <p className="mt-1 text-sm text-emerald-800">
          Если вопрос срочный, позвоните: {companyPhone}
        </p>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-3">
      <fieldset disabled={off} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            Имя
            <input
              required
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={SITE_LEAD_LIMITS.name}
              autoComplete="name"
              placeholder="Как к вам обращаться"
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            Телефон
            <input
              required
              type="tel"
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={SITE_LEAD_LIMITS.phone}
              pattern="(?:\D*\d){10,15}\D*"
              title="Номер телефона: от 10 цифр"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+7 (___) ___-__-__"
              className={FIELD}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
          Комментарий (необязательно)
          <textarea
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={SITE_LEAD_LIMITS.message}
            rows={3}
            placeholder="Что вас интересует, когда удобно поговорить"
            className={FIELD}
          />
        </label>
        {/* Ловушка для ботов: людям и экранным дикторам не видна. */}
        <input
          tabIndex={-1}
          autoComplete="off"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="hidden"
          aria-hidden
        />
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            required
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span>{siteLeadConsentText(companyTitle)}</span>
        </label>
        <p className="text-xs text-slate-500">
          Заявку принимает {platformName} и передаёт компании.{' '}
          <a
            href={privacyHref}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-700"
          >
            Политика конфиденциальности
          </a>
        </p>
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={off || !hydrated || status === 'sending'}
          className={`inline-flex min-h-[52px] items-center justify-center rounded-2xl px-6 py-3 text-base font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 sm:self-start ${buttonClass}`}
        >
          {status === 'sending' ? 'Отправляем…' : 'Отправить заявку'}
        </button>
      </fieldset>
      {off && (
        <p className="text-sm font-semibold text-amber-800">Форма заработает после публикации</p>
      )}
    </form>
  );
}
