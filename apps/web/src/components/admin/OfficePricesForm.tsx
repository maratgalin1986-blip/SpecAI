'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// «Цены сайта под ключ» на /admin/office (R16): разовая цена и поддержка в месяц →
// PUT /api/admin/office/settings. Текст звонка и письма берут цены отсюда.

export function OfficePricesForm({
  setup,
  monthly,
  yearly,
}: {
  setup: number;
  monthly: number;
  yearly: number;
}) {
  const router = useRouter();
  const [setupValue, setSetup] = useState(String(setup));
  const [monthlyValue, setMonthly] = useState(String(monthly));
  const [yearlyValue, setYearly] = useState(String(yearly));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    setupValue !== String(setup) ||
    monthlyValue !== String(monthly) ||
    yearlyValue !== String(yearly);

  async function save() {
    if (saving || !dirty) return;
    const sitePrice = Number(setupValue.replace(/\s+/g, ''));
    const siteMonthly = Number(monthlyValue.replace(/\s+/g, ''));
    const siteYearly = Number(yearlyValue.replace(/\s+/g, ''));
    if (
      !Number.isInteger(sitePrice) ||
      sitePrice <= 0 ||
      !Number.isInteger(siteMonthly) ||
      siteMonthly <= 0 ||
      !Number.isInteger(siteYearly) ||
      siteYearly <= 0
    ) {
      setMessage({ ok: false, text: 'Цены — целые числа рублей больше нуля' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/admin/office/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sitePrice, siteMonthly, siteYearly }),
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
    setMessage({ ok: true, text: 'Цены сохранены' });
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
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          Сайт под ключ, ₽
          <input
            inputMode="numeric"
            value={setupValue}
            maxLength={9}
            onChange={(event) => setSetup(event.target.value)}
            className="w-32 rounded-md border border-slate-300 px-2 py-1 font-mono text-sm text-graphite-900"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          Поддержка в месяц, ₽
          <input
            inputMode="numeric"
            value={monthlyValue}
            maxLength={9}
            onChange={(event) => setMonthly(event.target.value)}
            className="w-32 rounded-md border border-slate-300 px-2 py-1 font-mono text-sm text-graphite-900"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          Поддержка сразу за год, ₽
          <input
            inputMode="numeric"
            value={yearlyValue}
            maxLength={9}
            onChange={(event) => setYearly(event.target.value)}
            className="w-32 rounded-md border border-slate-300 px-2 py-1 font-mono text-sm text-graphite-900"
          />
        </label>
        <button
          type="submit"
          disabled={saving || !dirty}
          className="cab-action disabled:opacity-40"
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
      {message && (
        <p className={`text-xs ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
