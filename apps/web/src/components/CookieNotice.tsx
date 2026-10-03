'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COOKIE_CONSENT_KEY, enableWebvisorIfQueued, stopMetrika } from '@/lib/marketing';

// Notice about cookies and Yandex.Metrika (152-ФЗ). Metrika works until the
// visitor refuses; the choice is kept in localStorage and read by the counter's
// init script and by reachGoal. Nothing is rendered on the server, and the
// card is fixed, so it cannot shift the page.
export function CookieNotice() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let chosen = false;
    try {
      chosen = !!localStorage.getItem(COOKIE_CONSENT_KEY);
    } catch {
      // Storage blocked: the notice is shown on every visit.
    }
    if (chosen) return;
    // Not on first paint: only after the intro has ended and the visitor
    // has scrolled (or 6 s have passed).
    let scrolled = false;
    let timedOut = false;
    let frame = 0;
    let revealed = false;
    const introOn = () => {
      const intro = document.getElementById('intro');
      return !!intro && !intro.hidden;
    };
    const check = () => {
      if (revealed || !(scrolled || timedOut) || introOn()) return;
      revealed = true;
      window.clearInterval(poll);
      setVisible(true);
      frame = requestAnimationFrame(() => setShown(true));
    };
    const onScroll = () => {
      if (window.scrollY > 4) {
        scrolled = true;
        check();
      }
    };
    const timeout = window.setTimeout(() => {
      timedOut = true;
      check();
    }, 6000);
    const poll = window.setInterval(check, 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Lets the chat button sit above the strip (see globals.css).
  const open = visible && !pathname?.startsWith('/admin');
  useEffect(() => {
    if (!open) return;
    document.documentElement.setAttribute('data-cookie-strip', '');
    return () => document.documentElement.removeAttribute('data-cookie-strip');
  }, [open]);

  function choose(value: 'yes' | 'no') {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, value);
    } catch {
      // Ignore: the choice just lasts until the page is closed.
    }
    // «Нет» stops Metrika on this page too; «OK» switches Webvisor on when
    // the counter has not started yet (lib/marketing.ts).
    if (value === 'no') stopMetrika();
    else enableWebvisorIfQueued();
    setVisible(false);
  }

  if (!open) return null;

  return (
    <div
      role="region"
      aria-label="Уведомление о cookie"
      data-bottom-bar
      className={`fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[45] flex min-h-10 items-center gap-2 border-t border-slate-200 bg-white/95 px-3 py-1 text-xs text-slate-700 shadow-md backdrop-blur motion-safe:transition motion-safe:duration-300 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:rounded-full sm:border sm:py-1.5 sm:pl-4 sm:pr-2 ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 motion-reduce:translate-y-0'
      }`}
    >
      <p className="min-w-0 flex-1 leading-snug">
        Cookie и Метрика ·{' '}
        <Link href="/privacy" className="text-amber-800 underline">
          Политика
        </Link>
      </p>
      <button
        type="button"
        onClick={() => choose('yes')}
        className="min-h-9 shrink-0 rounded-full bg-slate-900 px-4 py-1.5 font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        OK
      </button>
      <button
        type="button"
        onClick={() => choose('no')}
        aria-label="Нет, отключить Метрику"
        title="Отключить Яндекс.Метрику и Вебвизор"
        className="min-h-9 shrink-0 px-2 py-1.5 text-slate-600 underline hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        Нет
      </button>
    </div>
  );
}
