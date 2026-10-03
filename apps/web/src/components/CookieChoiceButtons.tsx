'use client';

import { useEffect, useState } from 'react';
import { COOKIE_CHOICE_EVENT, COOKIE_CONSENT_KEY, stopMetrika } from '@/lib/marketing';

type Choice = 'yes' | 'no' | null;

// The cookie choice on /privacy, for visitors who closed the notice: shows
// the current answer and changes it. «Отключить» stops Metrika right away
// (lib/marketing.ts); «Включить» takes effect from the next page load, with
// Webvisor, because Metrika is initialised only when a page loads.
export function CookieChoiceButtons() {
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const value = localStorage.getItem(COOKIE_CONSENT_KEY);
      setChoice(value === 'yes' || value === 'no' ? value : null);
    } catch {
      // Storage blocked: the choice cannot be kept, show the buttons anyway.
    }
    setReady(true);
  }, []);

  function save(value: 'yes' | 'no') {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, value);
    } catch {
      // Ignore: the choice lasts until the page is closed.
    }
    if (value === 'no') stopMetrika();
    setChoice(value);
    window.dispatchEvent(new Event(COOKIE_CHOICE_EVENT));
  }

  if (!ready) return null;

  const status =
    choice === 'yes'
      ? 'Метрика и Вебвизор включены.'
      : choice === 'no'
        ? 'Метрика отключена.'
        : 'Вы ещё не сделали выбор: Метрика работает без Вебвизора.';

  return (
    <div className="not-prose my-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="w-full text-slate-700 sm:w-auto sm:flex-1" role="status">
        {status}
      </p>
      <button
        type="button"
        onClick={() => save('yes')}
        disabled={choice === 'yes'}
        className="min-h-10 rounded-full bg-slate-900 px-4 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        Включить Метрику
      </button>
      <button
        type="button"
        onClick={() => save('no')}
        disabled={choice === 'no'}
        className="min-h-10 rounded-full border border-slate-300 bg-white px-4 font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
      >
        Отключить Метрику
      </button>
    </div>
  );
}
