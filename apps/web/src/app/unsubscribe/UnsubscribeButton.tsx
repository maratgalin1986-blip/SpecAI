'use client';

import { useState } from 'react';
import { Button } from '@specai/ui';

/** «Отписаться»: POST /api/unsubscribe with the signed token from the letter. */
export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setState('busy');
    setError(null);
    try {
      const response = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Не удалось отписаться');
        setState('idle');
        return;
      }
      setState('done');
    } catch {
      setError('Не удалось связаться с сервером. Попробуйте ещё раз');
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <p role="status" className="text-sm font-medium text-green-800">
        Готово: вы отписаны. Подписаться снова можно в настройках уведомлений.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={() => void confirm()} disabled={state === 'busy'}>
        {state === 'busy' ? 'Отписываем…' : 'Отписаться'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
