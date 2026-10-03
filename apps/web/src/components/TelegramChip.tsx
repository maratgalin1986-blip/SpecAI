'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { reachGoal } from '@/lib/marketing';
import { useTelegramLink } from '@/components/TelegramButton';

const DISMISS_KEY = 'sp16_tg_chip';

/**
 * Phones only: a small pinned chip «Цены и свободная техника — в Telegram»
 * above the call bar. It waits until the visitor has scrolled a bit, never
 * shows together with the consent strip, hides while a field is focused
 * (data-bottom-bar, see globals.css) and closes for good with ✕.
 */
export function TelegramChip() {
  const pathname = usePathname();
  const href = useTelegramLink();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }
    const check = () => {
      const strip = document.documentElement.hasAttribute('data-cookie-strip');
      const intro = document.getElementById('intro');
      if (window.scrollY > 600 && !strip && (!intro || intro.hidden)) {
        setShown(true);
        window.removeEventListener('scroll', check);
      }
    };
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, []);

  const hidden = ['/admin', '/stroyka', '/tg'].some((p) => pathname?.startsWith(p));
  const open = shown && !hidden;
  // Lifts the chat button above the chip (globals.css).
  useEffect(() => {
    if (!open) return;
    document.documentElement.setAttribute('data-tg-chip', '');
    return () => document.documentElement.removeAttribute('data-tg-chip');
  }, [open]);
  if (!open) return null;

  const close = () => {
    setShown(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* closes for this page only */
    }
  };

  return (
    <div
      data-bottom-bar
      className="fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[44] flex items-center gap-1 rounded-full bg-[#2aabee] py-1 pl-4 pr-1 text-sm font-semibold text-white shadow-lg sm:hidden"
    >
      <a
        href={href}
        target="_blank"
        rel="noopener"
        data-telegram-link
        onClick={() => reachGoal('telegram_click')}
        className="min-h-9 flex-1 py-2"
      >
        Цены и свободная техника — в Telegram
      </a>
      <button
        type="button"
        onClick={close}
        aria-label="Скрыть"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
      >
        ✕
      </button>
    </div>
  );
}
