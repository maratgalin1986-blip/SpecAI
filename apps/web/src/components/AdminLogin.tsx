'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/useHydrated';

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hydrated = useHydrated();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        // 401 — wrong password; 429 — too many attempts (the server explains);
        // anything else is a server failure, not the password's fault.
        setError(
          response.status === 401
            ? 'Неверный пароль'
            : response.status === 429 && typeof body?.error === 'string'
              ? body.error
              : 'Сервис временно недоступен, попробуйте позже',
        );
        return;
      }
    } catch {
      setError('Нет связи с сервером, попробуйте позже');
      return;
    } finally {
      setIsSubmitting(false);
    }
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-3">
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль администратора"
        aria-label="Пароль администратора"
        className="rounded-md border border-slate-300 px-3 py-2"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!hydrated || isSubmitting}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Войти
      </button>
    </form>
  );
}

export function AdminLogout() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/admin/logout', { method: 'POST' });
        router.refresh();
      }}
      className="text-sm text-slate-500 hover:text-slate-900"
    >
      Выйти
    </button>
  );
}
