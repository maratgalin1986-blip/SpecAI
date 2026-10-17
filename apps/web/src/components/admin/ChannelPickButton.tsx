'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** «Сводка заявок сюда»: the chat where the daily «Заявки за сутки» post goes (lib/channelTarget.ts). */
export function ChannelPickButton({
  chatId,
  title,
  picked,
}: {
  chatId: string;
  title: string;
  picked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async () => {
    // Only the owner's own chat: a stranger's group must never get the daily post.
    if (
      !picked &&
      !window.confirm(
        `Публиковать сводку заявок каждый вечер в «${title}»? Только если это ваш чат.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch('/api/admin/settings/channel', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: picked ? null : chatId }),
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
        className={
          picked
            ? 'min-h-11 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50 sm:min-h-9'
            : 'min-h-11 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white disabled:opacity-50 sm:min-h-9'
        }
      >
        {picked ? 'Сводка идёт сюда · выключить' : 'Сводка заявок сюда'}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
