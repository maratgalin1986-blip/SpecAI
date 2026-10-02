'use client';

import { Suspense, useState } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@specai/ui';
import { CinemaBackdrop } from '@/components/CinemaHero';
import { homeForRole, loginErrorMessage } from '@/lib/loginErrors';
import { useHydrated } from '@/lib/useHydrated';

// Where to go after signing in: the page that sent the user here (same site
// only, to avoid open redirects), otherwise null — then the user's own cabinet.
function safeCallbackUrl(): string | null {
  const raw = new URLSearchParams(window.location.search).get('callbackUrl');
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const target = url.pathname + url.search;
    // /dashboard is the customer's cabinet; providers go to their own one.
    return target === '/dashboard' ? null : target;
  } catch {
    return null;
  }
}

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
  const hydrated = useHydrated();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    let result: Awaited<ReturnType<typeof signIn>>;
    try {
      result = await signIn('credentials', { email, password, redirect: false });
    } catch {
      result = { error: 'NetworkError', ok: false, status: 0, url: null };
    }

    if (!result || result.error) {
      setIsSubmitting(false);
      // Wrong password, too many attempts, or the service is down.
      setError(loginErrorMessage(result?.error ?? 'NetworkError'));
      return;
    }

    const target = safeCallbackUrl() ?? homeForRole((await getSession())?.user?.role);
    setIsSubmitting(false);
    router.push(target);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm py-6 sm:py-12">
      <CinemaBackdrop clip="tower-glass" />
      <Card className="cine-sub shadow-2xl">
        <h1 className="cine-title mb-4 text-xl font-bold">Вход</h1>
        <Suspense fallback={null}>
          <VerifiedNotice />
        </Suspense>
        <form method="post" onSubmit={handleSubmit} className="flex flex-col gap-3">
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
          <Button type="submit" disabled={!hydrated || isSubmitting}>
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
