'use client';

import { useState } from 'react';
import { Button } from '@specai/ui';

export function PayBookingButton({ bookingId }: { bookingId: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setError(null);
    setIsSubmitting(true);

    let redirectUrl: string | null = null;
    try {
      const response = await fetch(`/api/bookings/${bookingId}/checkout`, { method: 'POST' });
      const body = await response.json().catch(() => null);

      if (!response.ok || typeof body?.url !== 'string') {
        setError(typeof body?.error === 'string' ? body.error : 'Не удалось перейти к оплате');
        return;
      }

      redirectUrl = body.url;
    } catch {
      setError('Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз');
    } finally {
      // Кнопку оставляем заблокированной только на время редиректа на оплату.
      if (!redirectUrl) setIsSubmitting(false);
    }

    if (redirectUrl) window.location.assign(redirectUrl);
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
