'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { DOCUMENT_PAGES } from '@/lib/sound';
import { isCabinetPage } from '@/lib/workPages';

// The site-wide cinema effects (CinemaEffects.tsx) draw nothing the first
// paint needs, so they arrive as one chunk after hydration instead of sitting
// in every page's first-load JS. Document pages (consent, policy, credits) are
// for reading and do not load them at all.
const CinemaEffects = dynamic(
  () => import('@/components/CinemaEffects').then((m) => m.CinemaEffects),
  { ssr: false },
);

export function CinemaLayer() {
  const pathname = usePathname() ?? '';
  if (DOCUMENT_PAGES.test(pathname)) return null;
  // Cabinets, order pages and the admin are for work: no sound director, so
  // nothing plays there even for a visitor who turned sound on elsewhere.
  return <CinemaEffects sound={!isCabinetPage(pathname)} />;
}
