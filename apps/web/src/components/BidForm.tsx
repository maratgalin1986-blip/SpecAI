'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@specai/ui';

interface EquipmentOption {
  id: string;
  name: string;
  dailyRate: string;
}

export function BidForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [equipmentId, setEquipmentId] = useState('');
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!session?.user.companyId) return;
    fetch(`/api/equipment?companyId=${session.user.companyId}&status=AVAILABLE`)
      .then((res) => res.json())
      .then((data) => setEquipmentOptions(data.equipment ?? []));
  }, [session?.user.companyId]);

  if (status !== 'authenticated' || session.user.role !== 'PROVIDER_ADMIN') {
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

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось отправить предложение');
      return;
    }

    setSubmitted(true);
    router.refresh();
  }

  if (submitted) {
    return <p className="text-sm text-green-700">Предложение отправлено.</p>;
  }

  if (equipmentOptions.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Нет доступной техники для предложения. Добавьте технику в{' '}
        <a href="/provider" className="font-medium text-amber-700">
          кабинете поставщика
        </a>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
              {item.name} (${item.dailyRate}/день)
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Цена за весь период, $
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
        {isSubmitting ? 'Отправка…' : 'Предложить'}
      </Button>
    </form>
  );
}
