'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1.5 text-xs">
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded border border-slate-300 px-2 text-xs hover:bg-slate-50"
        >
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
    </div>
  );
}

export function TelegramSetupButton({ configured }: { configured: boolean }) {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={!configured || busy}
        onClick={async () => {
          setBusy(true);
          const response = await fetch('/api/admin/telegram-setup', { method: 'POST' });
          const body = await response.json().catch(() => null);
          setBusy(false);
          setState(
            response.ok
              ? { ok: true, text: `Бот @${body?.bot} подключён. Теперь добавьте его в группы.` }
              : { ok: false, text: body?.error ?? 'Ошибка' },
          );
        }}
        className="w-fit rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Подключаем…' : 'Подключить Telegram-бота'}
      </button>
      {!configured && (
        <p className="text-xs text-slate-500">Сначала добавьте TELEGRAM_BOT_TOKEN в Vercel.</p>
      )}
      {state && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-red-600'}`}>{state.text}</p>
      )}
    </div>
  );
}

/** PATCH /api/admin/orders/[id]; the server's refusal (409: already handled) as text. */
async function setOrderStatus(orderId: string, status: 'OPEN' | 'CANCELLED') {
  const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).catch(() => null);
  if (response?.ok) return null;
  const body = await response?.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : 'Не удалось сохранить';
}

/** «Закрыть»: takes an open order off the board (a stale one, its dates passed). */
export function CloseOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm('Закрыть заявку? Она уйдёт с доски, исполнители её больше не увидят.')
          )
            return;
          setBusy(true);
          setError(await setOrderStatus(orderId, 'CANCELLED'));
          setBusy(false);
          router.refresh();
        }}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? 'Закрываем…' : 'Закрыть'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function ModerationButtons({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (status: 'OPEN' | 'CANCELLED') => {
    setBusy(true);
    setError(await setOrderStatus(orderId, status));
    setBusy(false);
    router.refresh();
  };
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {error && <p className="basis-full text-xs text-red-600">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => act('OPEN')}
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Опубликовать
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => act('CANCELLED')}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
      >
        Отклонить
      </button>
    </div>
  );
}
