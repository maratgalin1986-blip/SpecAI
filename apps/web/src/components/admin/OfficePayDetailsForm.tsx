'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// «Реквизиты для оплаты» на /admin/office/clients (S6): свободный текст владельца (получатель,
// ИНН, счёт, банк или перевод по номеру) → PUT /api/admin/office/settings { payDetails }.
// Клиент видит его на странице счёта /oplata/<token>; пусто — там «пришлём в ответ на письмо».

export function OfficePayDetailsForm({
  value,
  max,
  vatRate,
  vatRates,
}: {
  value: string;
  /** PAY_DETAILS_MAX из lib/office/settings.ts (модуль серверный — передаёт страница). */
  max: number;
  /** Ставка НДС в счёте-оферте, % (К8); 0 — «НДС не облагается». */
  vatRate: number;
  /** VAT_RATES из lib/office/settings.ts. */
  vatRates: readonly number[];
}) {
  const router = useRouter();
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(value);
  const [rate, setRate] = useState(vatRate);
  const [savedRate, setSavedRate] = useState(vatRate);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = text !== saved || rate !== savedRate;

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/admin/office/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(text !== saved ? { payDetails: text } : {}),
        ...(rate !== savedRate ? { vatRate: rate } : {}),
      }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    setSaving(false);
    if (!response?.ok || !data?.ok) {
      setMessage({
        ok: false,
        text: typeof data?.error === 'string' ? data.error : 'Не сохранилось — попробуйте ещё раз',
      });
      return;
    }
    const done: string[] = [];
    if (text !== saved) done.push(text.trim() ? 'реквизиты сохранены' : 'реквизиты убраны');
    if (rate !== savedRate) {
      done.push(rate === 0 ? 'в счёте будет «НДС не облагается»' : `ставка НДС — ${rate} %`);
    }
    setSaved(text);
    setSavedRate(rate);
    const line = done.join('; ');
    setMessage({ ok: true, text: line.charAt(0).toUpperCase() + line.slice(1) });
    router.refresh();
  }

  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-graphite-600">
        Реквизиты для оплаты
        <textarea
          value={text}
          maxLength={max}
          rows={6}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            'Получатель, ИНН, расчётный счёт, банк, БИК\nили «Перевод по номеру телефона …»'
          }
          className="w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-sm text-graphite-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-graphite-600">
        Ставка НДС в счёте
        <select
          value={rate}
          onChange={(event) => setRate(Number(event.target.value))}
          className="w-48 rounded-md border border-slate-300 px-2 py-1 text-sm text-graphite-900"
        >
          {vatRates.map((option) => (
            <option key={option} value={option}>
              {option === 0 ? 'НДС не облагается' : `${option} %`}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving || !dirty}
          className="cab-action disabled:opacity-40"
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <span className="text-[11px] text-graphite-500">
          {text.length} / {max}
        </span>
        {message && (
          <span className={`text-xs ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
