'use client';

import { useEffect, useState } from 'react';
import { SITE } from '@/lib/site';
import { readLeadDraft, submitLead } from '@/lib/submitLead';
import { LeadSuccess } from '@/components/LeadSuccess';
import { PointPicker } from '@/components/PointPicker';
import { POINT_LINE_PREFIX, withPointLine, type MapPoint } from '@/lib/mapPoint';
import { ConsentText } from '@/components/ConsentText';
import { useHydrated } from '@/lib/useHydrated';

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
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  // A lead that did not go through last time (bad connection) comes back.
  useEffect(() => {
    const draft = readLeadDraft();
    if (!draft?.phone) return;
    setPhone(draft.phone);
    if (draft.name) setName(draft.name);
    if (draft.message) setMessage(draft.message);
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus('sending');
    try {
      await submitLead({ name, phone, message, source, consent, website });
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
    return <LeadSuccess dark={dark} summary={message || undefined} />;
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-3">
      <div>
        <h2 className={`text-lg font-semibold ${dark ? 'text-white' : ''}`}>{title}</h2>
        <p className={`mt-1 text-sm ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          required
          name="name"
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
          name="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={30}
          pattern="(?:\D*\d){10,15}\D*"
          title="Номер телефона: 10–11 цифр"
          placeholder="+7 (___) ___-__-__"
          autoComplete="tel"
          inputMode="tel"
          aria-label="Телефон"
          className={input}
        />
      </div>
      <textarea
        name="message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Что нужно сделать? Например: траншея под водопровод, Набережные Челны, на следующей неделе"
        aria-label="Комментарий"
        className={input}
      />
      <PointPicker
        value={point}
        dark={dark}
        label="📍 Объекта нет на карте? Отметьте место точкой"
        onPick={(next) => {
          setPoint(next);
          setMessage((current) =>
            next
              ? withPointLine(current, next)
              : current
                  .split('\n')
                  .filter((line) => !line.startsWith(POINT_LINE_PREFIX))
                  .join('\n'),
          );
        }}
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
          name="consent"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <ConsentText />
      </label>
      {error && (
        <p role="alert" className={`text-sm ${dark ? 'text-red-300' : 'text-red-700'}`}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!hydrated || status === 'sending'}
        className="rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-600/30 transition hover:bg-amber-400 disabled:opacity-60"
      >
        {status === 'sending' ? 'Отправляем…' : 'Жду звонка'}
      </button>
    </form>
  );
}
