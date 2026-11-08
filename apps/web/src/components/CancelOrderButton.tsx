'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** «Отменить заявку» for the customer's open order (PATCH /api/orders/[id]). */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!window.confirm('Отменить заявку? Исполнители больше не смогут присылать предложения.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? 'Не удалось отменить заявку');
        return;
      }
      router.refresh();
    } catch {
      setError('Нет связи с сервером, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void cancel()}
        disabled={busy}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:border-red-400 disabled:opacity-60"
      >
        {busy ? 'Отменяем…' : 'Отменить заявку'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
