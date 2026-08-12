'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@specai/ui';

const NEXT_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirm',
  ACTIVE: 'Mark active',
  COMPLETED: 'Mark completed',
  CANCELLED: 'Cancel',
};

export function BookingActionButtons({
  bookingId,
  availableTransitions,
}: {
  bookingId: string;
  availableTransitions: string[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(status: string) {
    setPending(status);
    setError(null);

    const response = await fetch(`/api/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    setPending(null);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Update failed');
      return;
    }

    router.refresh();
  }

  if (availableTransitions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {availableTransitions.map((status) => (
          <Button
            key={status}
            variant={status === 'CANCELLED' ? 'ghost' : 'secondary'}
            disabled={pending !== null}
            onClick={() => updateStatus(status)}
          >
            {pending === status ? '…' : NEXT_STATUS_LABEL[status]}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
