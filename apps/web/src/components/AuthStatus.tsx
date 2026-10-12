'use client';

import { useSession, signOut } from 'next-auth/react';

export function AuthStatus() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return null;
  }

  if (!session) {
    return (
      <a href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
        Войти
      </a>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3 text-sm">
      <a
        href={session.user.role === 'PROVIDER_ADMIN' ? '/provider' : '/dashboard'}
        className="auth-email min-w-0 truncate font-medium text-slate-700 hover:text-slate-900"
        title={session.user.email ?? undefined}
      >
        Кабинет
      </a>
      <button
        onClick={() => signOut({ callbackUrl: '/' })}
        className="shrink-0 font-medium text-slate-600 hover:text-slate-900"
      >
        Выйти
      </button>
    </div>
  );
}
