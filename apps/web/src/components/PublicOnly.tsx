'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** Parts of the public site that the CRM (/admin/*) does without: the footer with the catalogue. */
export function isAdminArea(pathname: string | null | undefined): boolean {
  return /^\/admin(\/|$)/.test(pathname ?? '');
}

/**
 * Pages made by the office for other companies (/s/<slug> — a client's own
 * site, /preview/<token> — its preview, /kp/<token> — the offer made for it,
 * /oplata/<token> — its invoice, a document that is printed to PDF): they carry
 * their own header and footer, so the platform's chrome and widgets stay off them.
 */
export function isStandalonePage(pathname: string | null | undefined): boolean {
  return /^\/(s|preview|kp|oplata)(\/|$)/.test(pathname ?? '');
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isAdminArea(pathname) || isStandalonePage(pathname)) return null;
  return <>{children}</>;
}
