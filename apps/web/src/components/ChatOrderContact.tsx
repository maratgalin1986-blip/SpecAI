'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@specai/ui';

/**
 * «Показать телефон» on an order found in an open chat: the number is masked
 * until a provider asks for it (logged on the server, limited per day).
 */
export function RevealPhoneButton({
  orderId,
  maskedPhone,
}: {
  orderId: string;
  maskedPhone: string | null;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'shown' | 'error'>('idle');
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    setState('loading');
    setError(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/phone`, {
        method: 'POST',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Не удалось открыть телефон');
        setState('error');
        return;
      }
      setPhone(body.phone ?? null);
      setName(body.name ?? null);
      setNote(body.note ?? null);
      setState('shown');
    } catch {
      setError('Нет связи с сервером');
      setState('error');
    }
  }

  if (state === 'shown' && phone) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        {name && <p>Автор: {name}</p>}
        <p>
          Телефон:{' '}
          <a href={`tel:${phone}`} className="font-semibold text-amber-700">
            {phone}
          </a>
        </p>
        {note && <p className="text-xs text-slate-500">{note}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
      <span className="font-mono text-slate-700">{maskedPhone ?? 'Телефон скрыт'}</span>
      <Button onClick={reveal} disabled={state === 'loading'}>
        {state === 'loading' ? 'Открываем…' : 'Показать телефон'}
      </Button>
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
}

/** Admin: erase an order from a chat on its author's request. */
export function EraseOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function erase() {
    if (!window.confirm('Удалить заявку по запросу автора? Контакты и текст будут стёрты.')) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/erase`, {
        method: 'POST',
      });
      const body = await response.json().catch(() => null);
      setMessage(
        response.ok
          ? 'Удалено'
          : typeof body?.error === 'string'
            ? body.error
            : 'Не удалось удалить',
      );
      if (response.ok) router.refresh();
    } catch {
      setMessage('Нет связи с сервером');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={erase}
        disabled={busy}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Удалить по запросу
      </button>
      {message && <span className="text-xs text-slate-600">{message}</span>}
    </span>
  );
}
