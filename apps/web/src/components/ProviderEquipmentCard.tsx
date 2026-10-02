'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@specai/ui';
import { EquipmentForm, type EditableEquipment } from '@/components/NewEquipmentForm';
import {
  EQUIPMENT_STATUS_OPTIONS,
  isPublished,
  type EquipmentStatusValue,
} from '@/lib/equipmentEdit';
import { formatMoney } from '@/lib/money';
import { isDisplayableImage } from '@/lib/providerMap';

// One machine in «Ваша техника» (/provider): a link to its public card, the
// hour and shift prices, a quick status switch and «Изменить» with the full
// form. Saved with PATCH /api/equipment/[id].

export function ProviderEquipmentCard({
  item,
  categoryName,
}: {
  item: EditableEquipment;
  categoryName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<EquipmentStatusValue>(item.status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const photo = item.imageUrls.find(isDisplayableImage);

  async function changeStatus(next: EquipmentStatusValue) {
    const previous = status;
    setStatus(next);
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/equipment/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setStatus(previous);
        setMessage({ ok: false, text: body?.error ?? 'Не удалось изменить статус' });
        return;
      }
      setMessage({
        ok: true,
        text: isPublished(next)
          ? 'Статус сохранён'
          : 'Снята с публикации — в каталоге и на карте её не видно',
      });
      router.refresh();
    } catch {
      setStatus(previous);
      setMessage({ ok: false, text: 'Нет связи с сервером, попробуйте ещё раз' });
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Card className="sm:col-span-2">
        <p className="mb-3 font-semibold">Изменить: {item.name}</p>
        <EquipmentForm initial={{ ...item, status }} onDone={() => setEditing(false)} />
      </Card>
    );
  }

  return (
    <Card className={`flex flex-col gap-3 ${isPublished(status) ? '' : 'opacity-75'}`}>
      <a href={`/equipment/${item.id}`} className="group flex min-w-0 items-start gap-3">
        {photo ? (
          <img
            src={photo}
            alt=""
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-lg bg-slate-100 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[0.65rem] text-slate-400">
            Нет фото
          </div>
        )}
        <div className="min-w-0">
          <p className="break-words font-medium group-hover:text-amber-700 group-hover:underline">
            {item.name}
          </p>
          <p className="text-sm text-slate-500">{categoryName}</p>
          <p className="text-sm text-slate-700">
            {item.hourlyRate ? `${formatMoney(item.hourlyRate)}/ч · ` : ''}
            {formatMoney(item.dailyRate)}/смена
          </p>
        </div>
      </a>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span className="sr-only">Статус</span>
          <select
            value={status}
            disabled={saving}
            onChange={(e) => void changeStatus(e.target.value as EquipmentStatusValue)}
            aria-label={`Статус: ${item.name}`}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {EQUIPMENT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:border-slate-900"
        >
          Изменить
        </button>
      </div>
      {message && (
        <p className={`text-xs ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </Card>
  );
}
