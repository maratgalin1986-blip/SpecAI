'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** Parts of the public site that the CRM (/admin/*) does without: the footer with the catalogue. */
export function isAdminArea(pathname: string | null | undefined): boolean {
  return /^\/admin(\/|$)/.test(pathname ?? '');
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isAdminArea(pathname)) return null;
  return <>{children}</>;
}
