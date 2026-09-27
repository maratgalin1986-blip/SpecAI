'use client';

import { useState } from 'react';
import { SITE } from '@/lib/site';

// "Call me back" form. Works without an account and without the AI features.
export function CallbackForm({
  source,
  defaultMessage = '',
  title = 'Заявка на звонок',
  subtitle = 'Оставьте телефон — менеджер перезвонит, подберёт технику и назовёт цену.',
  dark = false,
}: {
  source: string;
  defaultMessage?: string;
  title?: string;
  subtitle?: string;
  dark?: boolean;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus('sending');
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, message, source, consent, website }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.error === 'string' ? body.error : 'Не удалось отправить');
      }
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(
        `${err instanceof Error ? err.message : 'Не удалось отправить'}. Или позвоните: ${SITE.phone}`,
      );
    }
  }

  const input = `w-full rounded-md border px-3 py-2 text-sm ${
    dark
      ? 'border-slate-600 bg-slate-900/60 text-white placeholder:text-slate-400'
      : 'border-slate-300 bg-white'
  }`;

  if (status === 'sent') {
    return (
      <div
        className={`rounded-xl p-6 text-center ${dark ? 'bg-emerald-900/40 text-emerald-100' : 'bg-emerald-50 text-emerald-900'}`}
        role="status"
      >
        <div className="text-3xl">✅</div>
        <h3 className="mt-2 text-lg font-semibold">Заявка отправлена!</h3>
        <p className="mt-1 text-sm">
          Перезвоним в рабочее время ({SITE.workingHours.split(' · ')[0]}). Срочно — звоните{' '}
          <a href={SITE.phoneHref} className="font-semibold underline">
            {SITE.phone}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <h3 className={`text-lg font-semibold ${dark ? 'text-white' : ''}`}>{title}</h3>
        <p className={`mt-1 text-sm ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="Ваше имя"
          autoComplete="name"
          aria-label="Ваше имя"
          className={input}
        />
        <input
          required
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={30}
          placeholder="+7 (___) ___-__-__"
          autoComplete="tel"
          inputMode="tel"
          aria-label="Телефон"
          className={input}
        />
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Что нужно сделать? Например: котлован под фундамент, Казань, на следующей неделе"
        aria-label="Комментарий"
        className={input}
      />
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
      <label
        className={`flex items-start gap-2 text-xs ${dark ? 'text-slate-300' : 'text-slate-600'}`}
      >
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Согласен(на) на обработку персональных данных в соответствии с{' '}
          <a href="/privacy" className="underline" target="_blank">
            политикой конфиденциальности
          </a>
        </span>
      </label>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="rounded-md bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-600/30 transition hover:bg-amber-500 disabled:opacity-60"
      >
        {status === 'sending' ? 'Отправляем…' : 'Жду звонка'}
      </button>
    </form>
  );
}
