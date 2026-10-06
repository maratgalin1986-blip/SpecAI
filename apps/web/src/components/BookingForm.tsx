'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@specai/ui';
import { pluralizeRu } from '@/lib/pluralize';
import { formatMoney } from '@/lib/money';
import { moscowDateKey } from '@/lib/bookingRules';

function todayInMoscow() {
  return moscowDateKey(new Date());
}

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
        <a
          href={`/login?callbackUrl=${encodeURIComponent(`/equipment/${equipmentId}`)}`}
          className="font-medium text-amber-700"
        >
          Войдите
        </a>
        , чтобы отправить заявку на бронирование.
      </p>
    );
  }

  // Both dates are included, as on the server: 1–3 March is 3 days.
  const days =
    startDate && endDate && endDate >= startDate
      ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1
      : 0;
  const estimatedTotal = days * dailyRate;
  const today = todayInMoscow();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    let response: Response;
    try {
      response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipmentId, startDate, endDate }),
      });
    } catch {
      setIsSubmitting(false);
      setError('Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.');
      return;
    }

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
    <form onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Дата начала
        <input
          type="date"
          required
          min={today}
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
          min={startDate || today}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      {days > 0 && (
        <p className="text-sm text-slate-600">
          {pluralizeRu(days, ['день', 'дня', 'дней'])} · ориентировочная стоимость{' '}
          {formatMoney(estimatedTotal, currency)}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Отправка…' : 'Забронировать'}
      </Button>
    </form>
  );
}
