'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useJourneyInView } from '@/components/useJourneyInView';
import { isOnShift, SHIFT, SITE } from '@/lib/site';

function WhatsAppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z" />
    </svg>
  );
}

// Mobile: a sticky bar with the two most-used contact actions.
// Desktop: a round WhatsApp button above the AI assistant.
export function MessengerButtons() {
  const pathname = usePathname();
  // Known only on the client (the server does not know the visitor's time).
  const [onShift, setOnShift] = useState<boolean | null>(null);
  useEffect(() => {
    const update = () => setOnShift(isOnShift());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // While a text field has focus the bottom bars step aside (see globals.css),
  // so they never cover the form or float above the keyboard.
  useEffect(() => {
    const root = document.documentElement;
    const isField = (el: Element | null) =>
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLInputElement &&
        !['checkbox', 'radio', 'button', 'submit'].includes(el.type));
    const onFocusIn = (event: FocusEvent) => {
      if (isField(event.target as Element)) root.setAttribute('data-typing', '');
    };
    const onFocusOut = () => {
      window.setTimeout(() => {
        if (!isField(document.activeElement)) root.removeAttribute('data-typing');
      }, 0);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      root.removeAttribute('data-typing');
    };
  }, []);
  const inJourney = useJourneyInView(pathname);
  // /stroyka is full-screen with its own call buttons and no outbound links.
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/stroyka')) return null;
  return (
    <>
      <nav
        aria-label="Быстрая связь"
        data-bottom-bar
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-slate-200 bg-white/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden"
      >
        <a
          href={SITE.phoneHref}
          className="flex min-h-12 flex-col items-center justify-center rounded-lg bg-amber-500 leading-tight text-slate-950"
        >
          <span className="flex items-center gap-2 text-base font-bold">
            <Icon name="phone" className="h-5 w-5" /> Позвонить
          </span>
          {onShift !== null && (
            <span className="flex items-center gap-1 text-[0.65rem] font-medium">
              <span
                className={`radio-led h-1.5 w-1.5 rounded-full ${onShift ? 'bg-emerald-700' : 'bg-slate-700'}`}
                aria-hidden
              />
              {onShift ? `на связи до ${SHIFT.to}:00` : `ответим с ${SHIFT.from}:00`}
            </span>
          )}
        </a>
        <a
          href={SITE.whatsappHref}
          target="_blank"
          rel="noopener"
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-700 text-base font-semibold text-white"
        >
          <WhatsAppIcon /> WhatsApp
        </a>
      </nav>
      <aside aria-label="WhatsApp">
        <a
          href={SITE.whatsappHref}
          target="_blank"
          rel="noopener"
          aria-label="Написать в WhatsApp"
          className={`wa-fab fixed bottom-20 right-6 z-50 hidden h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg transition hover:scale-105 hover:bg-emerald-600 sm:flex ${
            inJourney ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <WhatsAppIcon className="h-6 w-6" />
        </a>
      </aside>
    </>
  );
}

export { WhatsAppIcon };
