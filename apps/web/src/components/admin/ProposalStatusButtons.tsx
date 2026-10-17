'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** «Прочитано» (only for new messages) and «В архив» for one proposal. */
export function ProposalStatusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (next: 'READ' | 'ARCHIVED') => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/proposals/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);
    setBusy(false);
    // 404/409: already archived or decided elsewhere — the fresh list shows it.
    if (!response?.ok && response?.status !== 404 && response?.status !== 409) {
      setError('Не удалось сохранить');
      return;
    }
    router.refresh();
  };
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-2">
        {status === 'NEW' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act('READ')}
            className="min-h-11 rounded-md bg-graphite-900 px-3 text-sm font-medium text-white disabled:opacity-50 sm:min-h-9"
          >
            Прочитано
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => act('ARCHIVED')}
          className="min-h-11 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50 sm:min-h-9"
        >
          В архив
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
