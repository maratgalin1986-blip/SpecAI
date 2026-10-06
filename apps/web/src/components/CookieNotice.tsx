'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COOKIE_CHOICE_EVENT, COOKIE_CONSENT_KEY, enableWebvisorIfQueued } from '@/lib/marketing';

// A small strip at the bottom on arrival: consent to the processing of
// personal data and cookies (owner's request, 2026-10-03). The visitor either
// agrees («Согласен», Webvisor on) or hides it (✕, nothing changes: Metrika
// keeps working without Webvisor, as before an answer). Refusing Metrika is on
// /privacy. The choice is kept in localStorage; nothing is rendered on the
// server, and the strip is fixed, so it cannot shift the page.
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
    // Soon after arrival, once the intro has ended; scrolling shows it at once.
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
      // Chosen meanwhile on /privacy (CookieChoiceButtons): stay hidden.
      try {
        if (localStorage.getItem(COOKIE_CONSENT_KEY)) return;
      } catch {
        // Storage blocked: show the notice.
      }
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
    }, 1500);
    const poll = window.setInterval(check, 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // The choice made on /privacy hides the strip too.
  useEffect(() => {
    const hide = () => setVisible(false);
    window.addEventListener(COOKIE_CHOICE_EVENT, hide);
    return () => window.removeEventListener(COOKIE_CHOICE_EVENT, hide);
  }, []);

  // Lets the chat button sit above the strip (see globals.css).
  const open = visible && !pathname?.startsWith('/admin');
  useEffect(() => {
    if (!open) return;
    document.documentElement.setAttribute('data-cookie-strip', '');
    return () => document.documentElement.removeAttribute('data-cookie-strip');
  }, [open]);

  function choose(value: 'yes' | 'hidden') {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, value);
    } catch {
      // Ignore: the choice just lasts until the page is closed.
    }
    // «Согласен» switches Webvisor on when the counter has not started yet.
    if (value === 'yes') enableWebvisorIfQueued();
    setVisible(false);
  }

  if (!open) return null;

  return (
    <div
      role="region"
      aria-label="Согласие на обработку персональных данных"
      data-bottom-bar
      className={`fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[45] flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 py-1 pl-3 pr-1 text-xs text-slate-700 shadow-md backdrop-blur motion-safe:transition motion-safe:duration-300 sm:inset-x-auto sm:bottom-4 sm:right-6 ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 motion-reduce:translate-y-0'
      }`}
    >
      <p className="min-w-0 flex-1 leading-snug">
        Обработка персональных данных и cookie ·{' '}
        <Link href="/privacy" className="text-amber-800 underline">
          Подробнее
        </Link>
      </p>
      <button
        type="button"
        onClick={() => choose('yes')}
        className="min-h-9 shrink-0 rounded-full bg-slate-900 px-3 font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        Согласен
      </button>
      <button
        type="button"
        onClick={() => choose('hidden')}
        aria-label="Скрыть сообщение"
        title="Скрыть"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        ✕
      </button>
    </div>
  );
}
