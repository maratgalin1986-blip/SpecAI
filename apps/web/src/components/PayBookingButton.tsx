'use client';

import { useState } from 'react';
import { Button } from '@specai/ui';

export function PayBookingButton({ bookingId }: { bookingId: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/bookings/${bookingId}/checkout`, { method: 'POST' });
    const body = await response.json().catch(() => null);

    if (!response.ok || typeof body?.url !== 'string') {
      setIsSubmitting(false);
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось перейти к оплате');
      return;
    }

    window.location.assign(body.url);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={isSubmitting} onClick={handlePay}>
        {isSubmitting ? 'Переходим к оплате…' : 'Оплатить'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
