'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// «Профиль компании» in the provider cabinet: a few lines about the company
// for its public page (/providers/[id]) and the phone customers get once the
// booking is confirmed. Saved with PATCH /api/companies/me.

export function CompanyProfileForm({
  initial,
}: {
  initial: { description: string | null; phone: string | null };
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initial.description ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/companies/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, phone }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setMessage({ ok: false, text: body?.error ?? 'Не удалось сохранить' });
        return;
      }
      setMessage({ ok: true, text: 'Сохранено' });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: 'Нет связи с сервером, попробуйте ещё раз' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-graphite-800">
        О компании
        <textarea
          rows={3}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Например: 6 единиц техники, свои машинисты с допусками, работаем с НДС, выезд по Челнам и району"
          className="rounded-xl border border-graphite-200 px-3 py-2"
        />
        <span className="text-xs text-graphite-500">
          Видно на вашей публичной странице. Телефоны и ссылки в тексте скрываются — контакты
          заказчик получает после подтверждения брони.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm text-graphite-800">
        Телефон для заказчиков
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+7 900 000-00-00"
          autoComplete="tel"
          maxLength={30}
          className="min-h-[44px] rounded-xl border border-graphite-200 px-3"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="cab-action">
          {saving ? 'Сохраняем…' : 'Сохранить профиль'}
        </button>
        {message && (
          <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
