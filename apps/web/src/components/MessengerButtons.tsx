'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/Icon';
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
  if (pathname?.startsWith('/admin')) return null;
  return (
    <>
      <nav
        aria-label="Быстрая связь"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-slate-200 bg-white/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden"
      >
        {onShift !== null && (
          <a
            href={onShift ? SITE.phoneHref : '/#callback'}
            className="col-span-2 flex items-center justify-center gap-2 text-xs text-slate-600"
          >
            <span
              className={`radio-led h-2 w-2 rounded-full ${onShift ? 'bg-emerald-500' : 'bg-amber-500'}`}
              aria-hidden
            />
            {onShift
              ? `Диспетчер на связи до ${SHIFT.to}:00`
              : `Ответим с ${SHIFT.from}:00 — оставьте номер, перезвоним`}
          </a>
        )}
        <a
          href={SITE.phoneHref}
          className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-amber-500 text-base font-bold text-slate-950"
        >
          <Icon name="phone" className="h-5 w-5" /> Позвонить
        </a>
        <a
          href={SITE.whatsappHref}
          target="_blank"
          rel="noopener"
          className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-emerald-700 text-base font-semibold text-white"
        >
          <WhatsAppIcon /> WhatsApp
        </a>
      </nav>
      <a
        href={SITE.whatsappHref}
        target="_blank"
        rel="noopener"
        aria-label="Написать в WhatsApp"
        className="fixed bottom-20 right-6 z-50 hidden h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg transition hover:scale-105 hover:bg-emerald-600 sm:flex"
      >
        <WhatsAppIcon className="h-6 w-6" />
      </a>
    </>
  );
}

export { WhatsAppIcon };
