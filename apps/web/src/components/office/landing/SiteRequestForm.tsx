'use client';

import { useState } from 'react';
import { ConsentText } from '@/components/ConsentText';
import { Icon } from '@/components/Icon';
import { WhatsAppIcon } from '@/components/MessengerButtons';
import { SITE } from '@/lib/site';
import { leadErrorText, submitLead } from '@/lib/submitLead';
import { useHydrated } from '@/lib/useHydrated';
import { LANDING_LEAD_SOURCE, SITE_REQUEST_LIMITS, siteRequestMessage } from './siteRequest';

// «Хочу сайт» на странице услуги (S2): обычная заявка /api/leads через submitLead —
// в CRM с источником sajt-pod-klyuch и владельцу в Telegram. Имя, телефон, чем
// занимаетесь и город; согласие на обработку данных обязательно (152-ФЗ).

const INPUT =
  'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 sm:text-sm';

export function SiteRequestForm() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus('sending');
    try {
      await submitLead({
        name,
        phone,
        message: siteRequestMessage({ business, city }),
        source: LANDING_LEAD_SOURCE,
        consent,
        website,
      });
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(leadErrorText(err, SITE.phone));
    }
  }

  if (status === 'sent') {
    const hello = `Здравствуйте! Оставил заявку на сайт для своей компании${
      business.trim() ? ` (${business.trim()})` : ''
    }.`;
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl bg-slate-950 p-6 text-white">
        <p className="text-lg font-bold">Заявка принята</p>
        <p className="text-sm text-white/75">
          Мы позвоним, уточним, чем вы занимаетесь, и покажем, как будет выглядеть ваш сайт. Это
          бесплатно и ни к чему не обязывает. Не хотите ждать — позвоните или напишите сами.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={SITE.phoneHref}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-amber-500 px-5 font-semibold text-slate-950 hover:bg-amber-400"
          >
            <Icon name="phone" className="h-4 w-4" /> {SITE.phone}
          </a>
          <a
            href={`${SITE.whatsappHref}?text=${encodeURIComponent(hello)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/30 px-5 font-semibold text-white hover:bg-white/10"
          >
            <WhatsAppIcon className="h-4 w-4" /> WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      data-callback-form
      className="ym-hide-content flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
          Как к вам обращаться
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Имя"
            autoComplete="name"
            className={INPUT}
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
            maxLength={30}
            pattern="(?:\D*\d){10,15}\D*"
            title="Номер телефона: от 10 цифр"
            placeholder="+7 (___) ___-__-__"
            autoComplete="tel"
            inputMode="tel"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
          Чем занимаетесь
          <input
            name="business"
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            maxLength={SITE_REQUEST_LIMITS.business}
            placeholder="Например: стоматология, автосервис"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
          Город
          <input
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={SITE_REQUEST_LIMITS.city}
            placeholder="Например: Казань"
            autoComplete="address-level2"
            className={INPUT}
          />
        </label>
      </div>
      {/* Ловушка для ботов — не видна людям и экранным чтецам. */}
      <input
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        aria-hidden
        name="website"
      />
      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          required
          name="consent"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <ConsentText />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!hydrated || status === 'sending'}
        className="min-h-12 rounded-full bg-amber-500 px-6 py-3 text-base font-bold text-slate-950 shadow-lg shadow-amber-600/30 transition hover:bg-amber-400 disabled:opacity-60 sm:self-start"
      >
        {status === 'sending' ? 'Отправляем…' : 'Хочу сайт'}
      </button>
    </form>
  );
}
