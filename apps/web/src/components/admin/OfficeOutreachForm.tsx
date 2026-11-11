'use client';

import { useState } from 'react';

export interface OfficeOutreachSettings {
  /** Рассылка на паузе: крон ничего не отправляет. */
  outreachPaused: boolean;
  /** Сколько сообщений в день на каждый канал. */
  dailyCap: number;
  /** Адрес, на который приходят ответы на письма (Reply-To). */
  replyTo: string;
  /** Писать в WhatsApp и на обычный мобильный из карточки, не только на номер с меткой WhatsApp. */
  whatsappToPhone: boolean;
}

/**
 * Настройки рассылки кандидатам офиса (R18): PUT /api/admin/office/settings с полями
 * outreachPaused, dailyCap, replyTo, whatsappToPhone. Маршрут принимает и другие поля
 * настроек офиса, поэтому отправляем только свои.
 */
export function OfficeOutreachForm({ settings }: { settings: OfficeOutreachSettings }) {
  const [paused, setPaused] = useState(settings.outreachPaused);
  const [cap, setCap] = useState(String(settings.dailyCap));
  const [replyTo, setReplyTo] = useState(settings.replyTo);
  const [toPhone, setToPhone] = useState(settings.whatsappToPhone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    const dailyCap = Number(cap.trim());
    if (!Number.isInteger(dailyCap) || dailyCap < 0 || dailyCap > 500) {
      setMessage({ ok: false, text: 'Лимит в день — целое число от 0 до 500' });
      return;
    }
    const address = replyTo.trim().toLowerCase();
    if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setMessage({
        ok: false,
        text: 'Укажите адрес почты для ответов, например office@example.ru',
      });
      return;
    }
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/admin/office/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outreachPaused: paused,
        dailyCap,
        replyTo: address,
        whatsappToPhone: toPhone,
      }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      setMessage({
        ok: false,
        text: typeof body?.error === 'string' ? body.error : 'Не удалось сохранить настройки',
      });
      return;
    }
    setReplyTo(address);
    setMessage({
      ok: true,
      text: paused
        ? 'Сохранено. Рассылка на паузе: кандидатам ничего не отправляется.'
        : `Сохранено. В день — до ${dailyCap} сообщений на каждый канал.`,
    });
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={paused}
          onChange={(event) => setPaused(event.target.checked)}
          className="h-5 w-5"
        />
        <span>
          <span className="font-medium">Пауза</span> — кандидатам ничего не отправлять
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Сообщений в день на каждый канал</span>
        <input
          inputMode="numeric"
          value={cap}
          onChange={(event) => setCap(event.target.value)}
          className="w-32 rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">
          Адрес для ответов на письма (пусто — ответы придут в ящик, с которого ушло письмо)
        </span>
        <input
          type="email"
          autoComplete="off"
          value={replyTo}
          maxLength={120}
          onChange={(event) => setReplyTo(event.target.value)}
          placeholder="office@example.ru"
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={toPhone}
          onChange={(event) => setToPhone(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        <span>
          Писать в WhatsApp и на обычный мобильный из карточки (не только на указанный как WhatsApp)
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {message && (
          <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
