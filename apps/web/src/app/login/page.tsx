'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@specai/ui';

/** Сообщение после перехода с подтверждения email (?verified=1|0). */
function VerifiedNotice() {
  const verified = useSearchParams().get('verified');
  if (verified === '1') {
    return (
      <p className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        Email подтверждён, войдите
      </p>
    );
  }
  if (verified === '0') {
    return (
      <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        Ссылка недействительна или устарела
      </p>
    );
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn('credentials', { email, password, redirect: false });
    setIsSubmitting(false);

    if (result?.error) {
      setError('Неверный e-mail или пароль');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="mb-4 text-xl font-bold">Вход</h1>
        <Suspense fallback={null}>
          <VerifiedNotice />
        </Suspense>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
          <label className="flex flex-col gap-1 text-sm">
            Пароль
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Выполняется вход…' : 'Войти'}
          </Button>
        </form>
        <p className="mt-3 text-sm">
          <a href="/forgot-password" className="font-medium text-amber-700">
            Забыли пароль?
          </a>
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Нет аккаунта?{' '}
          <a href="/register" className="font-medium text-amber-700">
            Зарегистрироваться
          </a>
        </p>
      </Card>
    </div>
  );
}
