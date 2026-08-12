'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@specai/ui';
import { pluralizeRu } from '@/lib/pluralize';

export function BookingForm({
  equipmentId,
  dailyRate,
  currency,
}: {
  equipmentId: string;
  dailyRate: number;
  currency: string;
}) {
  const router = useRouter();
  const { status } = useSession();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (status === 'unauthenticated') {
    return (
      <p className="text-sm text-slate-600">
        <a href="/login" className="font-medium text-amber-700">
          Войдите
        </a>{' '}
        , чтобы отправить заявку на бронирование.
      </p>
    );
  }

  const days =
    startDate && endDate
      ? Math.max(1, Math.ceil((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000))
      : 0;
  const estimatedTotal = days * dailyRate;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipmentId, startDate, endDate }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(
        typeof body?.error === 'string'
          ? body.error
          : 'Не удалось создать бронирование. Попробуйте ещё раз.',
      );
      return;
    }

    setSuccess(true);
    router.refresh();
  }

  if (success) {
    return (
      <p className="text-sm text-green-700">Заявка отправлена — статус: ожидает подтверждения.</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Дата начала
        <input
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Дата окончания
        <input
          type="date"
          required
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      {days > 0 && (
        <p className="text-sm text-slate-600">
          {pluralizeRu(days, ['день', 'дня', 'дней'])} · ориентировочная стоимость {estimatedTotal}{' '}
          {currency}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Отправка…' : 'Забронировать'}
      </Button>
    </form>
  );
}
