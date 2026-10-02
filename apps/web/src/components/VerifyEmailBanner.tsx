'use client';

import { useState } from 'react';
import { Button } from '@specai/ui';

type Status = 'idle' | 'sending' | 'sent' | 'error';

/** `emailEnabled` — whether the site can send letters at all (Resend configured). */
export function VerifyEmailBanner({ emailEnabled = true }: { emailEnabled?: boolean }) {
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
            : emailEnabled
              ? 'Ссылка для подтверждения уходит на ваш e-mail при регистрации. Не пришло? Отправим ещё раз.'
              : 'Отправка писем пока не настроена — подтвердить e-mail можно будет позже.'}
        </p>
        {error && <p className="mt-1 text-red-700">{error}</p>}
      </div>
      {status !== 'sent' && emailEnabled && (
        <Button onClick={handleSend} disabled={status === 'sending'}>
          {status === 'sending' ? 'Отправляем…' : 'Отправить письмо'}
        </Button>
      )}
    </div>
  );
}
