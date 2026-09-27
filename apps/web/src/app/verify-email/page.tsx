'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@specai/ui';

/**
 * Подтверждение выполняется только по явному клику (POST): переход по ссылке из письма
 * не должен «сжигать» одноразовый токен — почтовые сканеры открывают ссылки до пользователя.
 */
function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        redirectTo?: string;
        message?: string;
        error?: string;
      } | null;

      if (!response.ok || !body?.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Не удалось подтвердить email');
        return;
      }
      if (body.message) setMessage(body.message);
      router.push(body.redirectTo ?? '/login?verified=1');
      router.refresh();
    } catch {
      setError('Не удалось связаться с сервером. Попробуйте ещё раз');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-slate-700">
        Ссылка недействительна.{' '}
        <a href="/login" className="font-medium text-amber-700">
          Войти
        </a>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-700">
        Нажмите кнопку, чтобы подтвердить адрес электронной почты.
      </p>
      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && (
        <p className="text-sm text-red-600">
          {error}{' '}
          <a href="/login" className="font-medium text-amber-700">
            Войти
          </a>
        </p>
      )}
      <Button type="button" onClick={handleConfirm} disabled={isSubmitting}>
        {isSubmitting ? 'Подтверждаем…' : 'Подтвердить email'}
      </Button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="mb-4 text-xl font-bold">Подтверждение email</h1>
        <Suspense fallback={<p className="text-sm text-slate-500">Загрузка…</p>}>
          <VerifyEmailForm />
        </Suspense>
      </Card>
    </div>
  );
}
