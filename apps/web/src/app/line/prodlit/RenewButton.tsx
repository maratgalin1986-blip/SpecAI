'use client';

import { useState } from 'react';
import { Button } from '@specai/ui';

/** «Продлить на 5 рабочих дней»: POST /api/line/renew with the signed token from the reminder. */
export function RenewButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [until, setUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function renew() {
    setState('busy');
    setError(null);
    try {
      const response = await fetch('/api/line/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        until?: string;
      } | null;
      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Не удалось продлить');
        setState('idle');
        return;
      }
      setUntil(typeof body?.until === 'string' ? body.until : null);
      setState('done');
    } catch {
      setError('Не удалось связаться с сервером. Попробуйте ещё раз');
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <p role="status" className="text-sm font-medium text-green-800">
        {until
          ? `Готово: машина на линии до ${until} включительно.`
          : 'Готово: машина на линии, пока вы её не отключите.'}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={() => void renew()} disabled={state === 'busy'}>
        {state === 'busy' ? 'Продлеваем…' : 'Продлить на 5 рабочих дней'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
