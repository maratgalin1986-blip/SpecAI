'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// «Радиус выезда и подача» in the provider cabinet: how far from the base
// the company goes (new orders farther away are not announced to it) and
// the price of a kilometre of the trip (prefills «подача» in the bid form).
// Saved with PATCH /api/companies/me.

export function DeliverySettingsForm({
  initial,
}: {
  initial: { deliveryRadiusKm: number; deliveryPricePerKm: string | null };
}) {
  const router = useRouter();
  const [radius, setRadius] = useState(String(initial.deliveryRadiusKm));
  const [pricePerKm, setPricePerKm] = useState(initial.deliveryPricePerKm ?? '');
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
        body: JSON.stringify({
          deliveryRadiusKm: Number(radius),
          deliveryPricePerKm: pricePerKm.trim() === '' ? null : Number(pricePerKm),
        }),
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
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-graphite-800">
          Радиус выезда, км
          <input
            type="number"
            min={5}
            max={1000}
            step={5}
            required
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            className="min-h-[44px] rounded-xl border border-graphite-200 px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-graphite-800">
          Подача, ₽ за км
          <input
            type="number"
            min={0}
            max={100000}
            step={1}
            value={pricePerKm}
            onChange={(e) => setPricePerKm(e.target.value)}
            placeholder="например, 80"
            className="min-h-[44px] rounded-xl border border-graphite-200 px-3"
          />
        </label>
      </div>
      <p className="text-xs text-graphite-500">
        Заявки дальше радиуса от вашей базы вам не присылаются. Цена за км подставляется в «подачу»
        предложения: расстояние от базы до объекта × цена.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="cab-action">
          {saving ? 'Сохраняем…' : 'Сохранить радиус и подачу'}
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
