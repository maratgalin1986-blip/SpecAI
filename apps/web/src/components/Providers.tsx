'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

// Sign-in is back on the site (owner, 2026-10-11: «Заказать технику» /
// «Встать на линию»), so every page reads the session once: the header shows
// «Кабинет» to a signed-in visitor on the catalogue and the board as well, not
// only inside the cabinets. No refetch on focus keeps it to one request.
export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
