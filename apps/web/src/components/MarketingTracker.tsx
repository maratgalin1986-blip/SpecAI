'use client';

import { useEffect } from 'react';
import { goalOfHref, reachGoal, rememberVisit } from '@/lib/marketing';

// Remembers where the visitor came from and counts clicks on the phone,
// WhatsApp, Telegram and e-mail links as Metrika goals, site-wide.
export function MarketingTracker() {
  useEffect(() => {
    rememberVisit();
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href]');
      const goal = link ? goalOfHref(link.getAttribute('href') ?? '') : null;
      if (goal) reachGoal(goal);
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);
  return null;
}
