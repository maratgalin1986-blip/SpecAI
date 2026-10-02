'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@specai/ui';

export function AcceptBidButton({ bidId }: { bidId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState(false);

  async function handleAccept() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/bids/${bidId}/accept`, { method: 'POST' });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось принять предложение');
      return;
    }

    setCreated(true);
    router.refresh();
  }

  if (created) {
    return (
      <p className="text-sm text-green-700">
        Бронь создана —{' '}
        <a href="/dashboard#bookings" className="font-semibold underline">
          мои брони
        </a>
        . Исполнитель подтвердит её и свяжется с вами.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button disabled={isSubmitting} onClick={handleAccept}>
        {isSubmitting ? 'Принимаем…' : 'Принять'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
