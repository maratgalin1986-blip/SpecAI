'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Overrides one AI decision through the admin PATCH (api/admin/orders/[id]):
 * «Вернуть» takes a published order off the board, «Опубликовать» puts a
 * rejected one on it.
 */
export function AiDecisionButton({
  orderId,
  action,
}: {
  orderId: string;
  action: 'withdraw' | 'publish';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withdraw = action === 'withdraw';
  const act = async () => {
    if (withdraw && !window.confirm('Снять заявку с торгов? Исполнители её больше не увидят.')) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: withdraw ? 'CANCELLED' : 'OPEN' }),
    }).catch(() => null);
    const body = response?.ok ? null : await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось сохранить');
    }
    router.refresh();
  };
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={act}
        className={
          withdraw
            ? 'min-h-11 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50 sm:min-h-9'
            : 'min-h-11 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white disabled:opacity-50 sm:min-h-9'
        }
      >
        {withdraw ? 'Вернуть' : 'Опубликовать'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
