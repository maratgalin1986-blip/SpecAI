'use client';

import { useState } from 'react';
import { Button } from '@specai/ui';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function VerifyEmailBanner() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    setStatus('sending');
    try {
      const response = await fetch('/api/auth/send-verification', { method: 'POST' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Не удалось отправить письмо');
        setStatus('error');
        return;
      }
      setStatus('sent');
    } catch {
      setError('Не удалось связаться с сервером. Попробуйте ещё раз');
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Подтвердите email</p>
        <p className="text-amber-800">
          {status === 'sent'
            ? 'Письмо отправлено. Проверьте почту и перейдите по ссылке из письма.'
            : 'Мы отправили ссылку для подтверждения на ваш e-mail. Не пришло? Отправим ещё раз.'}
        </p>
        {error && <p className="mt-1 text-red-700">{error}</p>}
      </div>
      {status !== 'sent' && (
        <Button onClick={handleSend} disabled={status === 'sending'}>
          {status === 'sending' ? 'Отправляем…' : 'Отправить письмо'}
        </Button>
      )}
    </div>
  );
}
