'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@specai/ui';
import { formatMoney } from '@/lib/money';
import { isProvider } from '@/lib/fleet';

interface EquipmentOption {
  id: string;
  name: string;
  dailyRate: string;
}

/** The company's pending bid on this order: one bid per company, a repeat updates it. */
export interface ExistingBid {
  price: number;
  currency: string;
  message: string | null;
  equipmentId: string;
}

export function BidForm({ orderId, existing }: { orderId: string; existing?: ExistingBid }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [equipmentId, setEquipmentId] = useState(existing?.equipmentId ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [message, setMessage] = useState(existing?.message ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user.companyId) return;
    fetch(`/api/equipment?companyId=${session.user.companyId}&status=AVAILABLE`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(typeof data?.error === 'string' ? data.error : 'Не удалось загрузить технику');
          return;
        }
        setEquipmentOptions(data?.equipment ?? []);
      })
      .catch(() => setError('Не удалось загрузить технику, проверьте связь'));
  }, [session?.user.companyId]);

  if (status !== 'authenticated' || !isProvider(session.user)) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/orders/${orderId}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipmentId, price: Number(price), message: message || undefined }),
    });

    setIsSubmitting(false);

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось отправить предложение');
      return;
    }

    setSubmitted(
      typeof body?.message === 'string'
        ? body.message
        : response.status === 200
          ? 'Предложение обновлено'
          : 'Предложение отправлено',
    );
    router.refresh();
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-green-700">{submitted}.</p>
        <button
          type="button"
          onClick={() => setSubmitted(null)}
          className="font-medium text-amber-700 hover:underline"
        >
          Изменить предложение
        </button>
      </div>
    );
  }

  if (equipmentOptions.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Нет доступной техники для предложения. Добавьте технику в{' '}
        <a href="/provider" className="font-medium text-amber-700">
          кабинете парка
        </a>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-3">
      {existing && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Вы уже предложили {formatMoney(existing.price, existing.currency)} — можно изменить цену,
          машину или сообщение.
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Ваша техника
        <select
          required
          value={equipmentId}
          onChange={(e) => setEquipmentId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="" disabled>
            Выберите технику
          </option>
          {equipmentOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({formatMoney(item.dailyRate)}/смена)
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Цена за весь период, ₽
        <input
          type="number"
          required
          min={1}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Сообщение (необязательно)
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Отправка…' : existing ? 'Обновить предложение' : 'Предложить'}
      </Button>
    </form>
  );
}
