'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  COOKIE_CHOICE_EVENT,
  COOKIE_CONSENT_KEY,
  cookieStripDue,
  snoozeValue,
  startMetrika,
} from '@/lib/marketing';
import { coversContent, KEY_ACTIONS, watchOverlay } from '@/lib/overlayClear';
import { hidesContactBar } from '@/lib/workPages';

// A small strip at the bottom on arrival: consent to the processing of
// personal data and cookies (owner's request, 2026-10-03). Yandex.Metrika
// starts only after «Согласен» (2026-10-04), on the same page (startMetrika).
// ✕ means «not now»: Metrika stays off and the strip comes back after a week
// (COOKIE_SNOOZE_MS). A firm refusal is on /privacy. The choice is kept in
// localStorage; nothing is rendered on the
// server, and the strip is fixed, so it cannot shift the page. Both buttons
// are 44 px tap targets. On a phone it stands under the header (data-cookie-top);
// on pages without the contact bar and on wider screens at the bottom
// (data-cookie-strip: extra bottom padding and scroll padding, globals.css).
// It never lies on the phone number, an order or submit button or a field:
// while one of them is under it, it is hidden (lib/overlayClear.ts).
export function CookieNotice() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let due = true;
    try {
      due = cookieStripDue(localStorage.getItem(COOKIE_CONSENT_KEY));
    } catch {
      // Storage blocked: the notice is shown on every visit.
    }
    if (!due) return;
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
        if (!cookieStripDue(localStorage.getItem(COOKIE_CONSENT_KEY))) return;
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
  const stripRef = useRef<HTMLDivElement>(null);
  // Phones with the contact bar: the strip goes to the top, under the header.
  // At the bottom it lay, with the bar, on the hero's phone number and on
  // «Жду звонка»; there the bottom edge is the bar alone. The bottom rules of
  // globals.css (data-cookie-strip: page padding, lifted buttons) then do not
  // apply, hence the separate attribute.
  const stroykaPage = pathname?.startsWith('/stroyka') ?? false;
  const topOnPhone = !stroykaPage && !hidesContactBar(pathname);
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const phone = window.matchMedia('(max-width: 639px)');
    const mark = () => {
      const top = topOnPhone && phone.matches;
      root.toggleAttribute('data-cookie-top', top);
      root.toggleAttribute('data-cookie-strip', !top);
    };
    mark();
    phone.addEventListener('change', mark);
    // The strip wraps to two or three lines on a narrow phone: the buttons above it
    // (globals.css, .install-fab) follow its real height instead of a guess.
    const el = stripRef.current;
    const measure = () => {
      if (el) root.style.setProperty('--cookie-strip-h', `${Math.ceil(el.offsetHeight)}px`);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (el) observer?.observe(el);
    // The strip is fixed over the page: while the phone number, an order or
    // submit button or a field is under it, it waits out of the way (globals.css,
    // data-away) and comes back as soon as the visitor scrolls on.
    const stopWatch = watchOverlay(() => {
      if (!el || getComputedStyle(el).position !== 'fixed') return;
      const rect = el.getBoundingClientRect();
      const away = coversContent(
        { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        (hit) => hit.matches(KEY_ACTIONS),
      );
      el.toggleAttribute('data-away', away);
    });
    return () => {
      stopWatch();
      observer?.disconnect();
      phone.removeEventListener('change', mark);
      root.removeAttribute('data-cookie-top');
      root.removeAttribute('data-cookie-strip');
      root.style.removeProperty('--cookie-strip-h');
    };
  }, [open, topOnPhone]);

  function choose(value: 'yes' | 'later') {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, value === 'yes' ? 'yes' : snoozeValue());
    } catch {
      // Ignore: the choice just lasts until the page is closed.
    }
    // «Согласен» starts Metrika right here; ✕ leaves it off.
    if (value === 'yes') startMetrika();
    setVisible(false);
  }

  if (!open) return null;

  // /stroyka is a full-screen layer at z-80 with its order panel at z-95: the
  // strip goes between them, at the top under the bar (the dialogue and the
  // zone card live lower), in one compact line on phones; on wide screens the
  // zone tabs take the top, so it goes to the free bottom-left corner.
  const stroyka = stroykaPage;
  const place = stroyka
    ? 'inset-x-2 top-[calc(max(0.5rem,env(safe-area-inset-top))+3rem)] z-[90] sm:inset-x-auto sm:left-1/2 sm:w-[30rem] sm:-ml-[15rem] lg:bottom-4 lg:left-4 lg:top-auto lg:ml-0 lg:w-[17rem] lg:rounded-2xl'
    : topOnPhone
      ? // Under the header (66 px on a phone) and below it in the stack, so the open menu covers it.
        'inset-x-2 top-[4.5rem] z-[39] sm:inset-x-auto sm:top-auto sm:bottom-4 sm:right-6 sm:z-[45]'
      : 'inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[45] sm:inset-x-auto sm:bottom-4 sm:right-6';
  const hiddenShift = stroyka
    ? '-translate-y-4'
    : topOnPhone
      ? 'max-sm:-translate-y-4 sm:translate-y-4'
      : 'translate-y-4';

  return (
    <div
      role="region"
      aria-label="Согласие на обработку персональных данных"
      ref={stripRef}
      data-testid="cookie-strip"
      data-platform-chrome
      data-bottom-bar={stroyka ? undefined : true}
      className={`fixed ${place} flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 py-1 pl-3 pr-1 text-xs text-slate-700 shadow-md backdrop-blur motion-safe:transition motion-safe:duration-300 ${
        shown ? 'translate-y-0 opacity-100' : `${hiddenShift} opacity-0 motion-reduce:translate-y-0`
      }`}
    >
      {stroyka ? (
        <p className="flex min-w-0 flex-1 items-center gap-1 whitespace-nowrap text-[11px] leading-snug sm:text-xs lg:flex-wrap lg:whitespace-normal">
          <span className="truncate lg:whitespace-normal">Cookie — после «Согласен» ·</span>
          <Link
            href="/privacy"
            prefetch={false}
            className="relative shrink-0 font-medium text-amber-800 underline after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
          >
            Подробнее
          </Link>
        </p>
      ) : (
        <p className="min-w-0 flex-1 leading-snug">
          Cookie и Метрика — только после «Согласен» ·{' '}
          <Link
            href="/privacy"
            prefetch={false}
            className="relative font-medium text-amber-800 underline after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
          >
            Подробнее
          </Link>
        </p>
      )}
      <button
        type="button"
        onClick={() => choose('yes')}
        className="min-h-11 shrink-0 rounded-full bg-slate-900 px-4 font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        Согласен
      </button>
      <button
        type="button"
        onClick={() => choose('later')}
        aria-label="Не сейчас: скрыть, Метрика останется выключенной"
        title="Не сейчас"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        ✕
      </button>
    </div>
  );
}
