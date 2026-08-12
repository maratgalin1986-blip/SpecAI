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
        Sign in
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-slate-600">{session.user.email}</span>
      <button
        onClick={() => signOut({ callbackUrl: '/' })}
        className="font-medium text-slate-600 hover:text-slate-900"
      >
        Sign out
      </button>
    </div>
  );
}
