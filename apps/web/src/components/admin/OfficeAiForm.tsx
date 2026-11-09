'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// «ИИ-аналитик» на /admin/office (U2, U3): выключатель и лимит переписанных предложений в
// сутки → PUT /api/admin/office/settings (office.aiOffers, office.aiDailyCap). Состояние ключа
// приходит со страницы только как «есть / нет» — значения ключа здесь нет и быть не может.

export function OfficeAiForm({
  enabled,
  dailyCap,
  maxCap,
  keyConfigured,
}: {
  enabled: boolean;
  dailyCap: number;
  maxCap: number;
  keyConfigured: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [cap, setCap] = useState(String(dailyCap));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = on !== enabled || cap !== String(dailyCap);

  async function save() {
    if (saving || !dirty) return;
    const aiDailyCap = Number(cap.replace(/\s+/g, ''));
    if (!Number.isInteger(aiDailyCap) || aiDailyCap < 0 || aiDailyCap > maxCap) {
      setMessage({ ok: false, text: `Лимит в сутки — целое число от 0 до ${maxCap}` });
      return;
    }
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/admin/office/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiOffers: on, aiDailyCap }),
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
    setMessage({ ok: true, text: 'Сохранено' });
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
      <p className="text-xs text-graphite-600">
        Ключ ИИ на сервере:{' '}
        <span className={keyConfigured ? 'font-semibold text-emerald-700' : 'text-red-700'}>
          {keyConfigured ? 'есть' : 'нет — письма уходят без ИИ'}
        </span>
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          className="h-4 w-4"
        />
        Переписывать вступление и пункты письма
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          Предложений в сутки
          <input
            inputMode="numeric"
            value={cap}
            maxLength={3}
            onChange={(event) => setCap(event.target.value)}
            className="w-24 rounded-md border border-slate-300 px-2 py-1 font-mono text-sm text-graphite-900"
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
