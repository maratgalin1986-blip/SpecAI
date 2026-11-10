'use client';

import { useState } from 'react';

// Кнопка «Проверить ящик» на /admin/office/pisma: POST /api/admin/office/mail-test шлёт одно
// письмо с ящика офиса самому себе — до первой рассылки видно, что почта настроена верно.

interface TestAnswer {
  ok?: boolean;
  error?: string;
}

export function OfficeMailTest() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function check() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch('/api/admin/office/mail-test', { method: 'POST' }).catch(
      () => null,
    );
    const data = (await response?.json().catch(() => null)) as TestAnswer | null;
    setBusy(false);
    if (!response?.ok || !data?.ok) {
      setMessage({
        ok: false,
        text: typeof data?.error === 'string' ? data.error : 'Не получилось — попробуйте ещё раз',
      });
      return;
    }
    setMessage({ ok: true, text: 'Письмо ушло — проверьте входящие своего ящика' });
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-graphite-800">
        Проверка ящика: одно письмо с ящика офиса на него же. Компаниям при этом ничего не уходит.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="cab-action disabled:opacity-40"
          disabled={busy}
          onClick={() => void check()}
        >
          {busy ? 'Проверяю…' : 'Проверить ящик'}
        </button>
        {message && (
          <p
            role={message.ok ? 'status' : 'alert'}
            className={message.ok ? 'text-green-800' : 'text-red-700'}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
