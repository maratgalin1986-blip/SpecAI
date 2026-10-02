'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

// The site-wide cinema effects (CinemaEffects.tsx) draw nothing the first
// paint needs, so they arrive as one chunk after hydration instead of sitting
// in every page's first-load JS. Document pages (consent, policy, credits) are
// for reading and do not load them at all.
const CinemaEffects = dynamic(
  () => import('@/components/CinemaEffects').then((m) => m.CinemaEffects),
  { ssr: false },
);

const DOCUMENT_PAGES = /^\/(soglasie|privacy|credits)(\/|$)/;

export function CinemaLayer() {
  const pathname = usePathname() ?? '';
  return DOCUMENT_PAGES.test(pathname) ? null : <CinemaEffects />;
}
