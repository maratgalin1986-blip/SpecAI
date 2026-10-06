'use client';

import { SessionProvider } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// The public site has no sign-in (owner, 2026-10-03): only the admin and the
// account pages that still read the session (/orders forms, /dashboard,
// /provider) ask /api/auth/session. Everywhere else the provider starts with
// «no session» and never fetches it, so a visitor gets no next-auth request or
// cookie; useSession() still works there and reads «unauthenticated».
const SESSION_PATHS = ['/admin', '/orders', '/dashboard', '/provider'];

export function needsSession(pathname: string | null): boolean {
  if (!pathname) return false;
  return SESSION_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The key remounts the provider when a navigation crosses between the two,
  // so an account page fetches the session it needs.
  if (needsSession(pathname)) return <SessionProvider key="session">{children}</SessionProvider>;
  return (
    <SessionProvider key="public" session={null} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
