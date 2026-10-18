'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** «Тихий режим» of one group chat: answers under orders on or off (lib/groupBot.ts). */
export function ChatSilentButton({ chatId, silent }: { chatId: string; silent: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async () => {
    if (
      silent &&
      !window.confirm(
        'Бот начнёт отвечать в этом чате под заявками — его увидят участники. Включить?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch('/api/admin/bot-chats/silent', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, silent: !silent }),
    }).catch(() => null);
    const body = response?.ok ? null : await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось сохранить');
      return;
    }
    router.refresh();
  };
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={act}
        className="min-h-11 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50 sm:min-h-9"
      >
        {silent ? 'Включить ответы' : 'Тихий режим'}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
