'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { WhatsAppIcon } from '@/components/MessengerButtons';
import { isOnShift, SHIFT, SITE } from '@/lib/site';

// «Принято»: the screen after a lead is sent. A stamp lands once, the text
// says honestly when we call back, and the next step is right there.
export function LeadSuccess({ dark = false, summary }: { dark?: boolean; summary?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [onShift, setOnShift] = useState<boolean | null>(null);
  useEffect(() => {
    setOnShift(isOnShift());
    ref.current?.focus();
  }, []);
  const whatsapp = `${SITE.whatsappHref}?text=${encodeURIComponent(
    `Здравствуйте! Оставил заявку на сайте${summary ? `: ${summary}` : ''}.`,
  )}`;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className={`relative overflow-hidden rounded-2xl p-6 outline-none ${
        dark ? 'bg-slate-900 text-white ring-1 ring-white/10' : 'bg-slate-950 text-white'
      }`}
    >
      <div className="hud-corners pointer-events-none absolute inset-3" aria-hidden />
      <div className="stamp w-fit" aria-hidden>
        Принято
      </div>
      <h2 className="mt-4 text-lg font-semibold">Заявка у диспетчера {SITE.name}</h2>
      <p className="mt-1 text-sm text-white/70">
        {onShift === false
          ? `Сейчас нерабочее время — перезвоним утром, с ${SHIFT.from}:00.`
          : 'Перезвоним в течение 15 минут и назовём цену.'}{' '}
        Не хотите ждать — позвоните или напишите сами.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={SITE.phoneHref}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-amber-500 px-5 font-semibold text-slate-950 hover:bg-amber-400"
        >
          <Icon name="phone" className="h-4 w-4" /> Позвонить сейчас
        </a>
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-600"
        >
          <WhatsAppIcon className="h-4 w-4" /> WhatsApp
        </a>
      </div>
    </div>
  );
}
