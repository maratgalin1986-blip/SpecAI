'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COOKIE_CONSENT_KEY } from '@/lib/marketing';

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
    setVisible(true);
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  function choose(value: 'yes' | 'no') {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, value);
    } catch {
      // Ignore: the choice just lasts until the page is closed.
    }
    setVisible(false);
  }

  if (!visible || pathname?.startsWith('/admin')) return null;

  return (
    <div
      role="region"
      aria-label="Уведомление о cookie"
      className={`fixed inset-x-3 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-[45] rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-lg motion-safe:transition motion-safe:duration-300 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-sm ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 motion-reduce:translate-y-0'
      }`}
    >
      <p>
        Мы используем cookie и Яндекс.Метрику, чтобы сайт работал лучше. Подробнее — в{' '}
        <Link href="/privacy" className="text-amber-800 underline">
          политике конфиденциальности
        </Link>
        .
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => choose('yes')}
          className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        >
          Понятно
        </button>
        <button
          type="button"
          onClick={() => choose('no')}
          className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        >
          Отказаться
        </button>
      </div>
    </div>
  );
}
