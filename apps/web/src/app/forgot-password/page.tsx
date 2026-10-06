'use client';

import { useState } from 'react';
import { Button, Card } from '@specai/ui';
import { CinemaBackdrop } from '@/components/CinemaHero';
import { useHydrated } from '@/lib/useHydrated';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hydrated = useHydrated();
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(typeof body?.error === 'string' ? body.error : 'Не удалось отправить запрос');
        return;
      }
      setIsSent(true);
    } catch {
      setError('Не удалось связаться с сервером. Попробуйте ещё раз');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-6 sm:py-12">
      <CinemaBackdrop clip="building-sun" />
      <Card className="cine-sub shadow-2xl">
        <h1 className="cine-title mb-4 text-xl font-bold">Восстановление пароля</h1>
        {isSent ? (
          <p className="text-sm text-slate-700">
            Если аккаунт с таким e-mail существует, мы отправили на него письмо со ссылкой для
            сброса пароля. Ссылка действует 1 час.
          </p>
        ) : (
          <form
            method="post"
            onSubmit={handleSubmit}
            className="ym-hide-content flex flex-col gap-3"
          >
            <p className="text-sm text-slate-600">
              Укажите e-mail, на который зарегистрирован аккаунт, — мы отправим ссылку для сброса
              пароля.
            </p>
            <label className="flex flex-col gap-1 text-sm">
              E-mail
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" disabled={!hydrated || isSubmitting}>
              {isSubmitting ? 'Отправляем…' : 'Отправить ссылку'}
            </Button>
          </form>
        )}
        <p className="mt-4 text-sm text-slate-500">
          <a href="/login" className="font-medium text-amber-700">
            Вернуться ко входу
          </a>
        </p>
      </Card>
    </div>
  );
}
