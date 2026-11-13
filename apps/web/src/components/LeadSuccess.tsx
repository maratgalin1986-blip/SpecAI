'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/Icon';
import { WhatsAppIcon } from '@/components/MessengerButtons';
import { PhotoShare } from '@/components/PhotoShare';
import {
  INSTALL_OFFER_ATTR,
  INSTALL_OPEN_EVENT,
  installLeadLine,
  noteInstallMoment,
} from '@/lib/installHint';
import { CALLBACK_IN, isOnShift, nextShiftText, SITE } from '@/lib/site';
import { TelegramButton } from '@/components/TelegramButton';

// The celebration is only needed once the заявка is sent: its own small chunk.
const Celebrate = dynamic(() => import('@/components/Celebrate').then((m) => m.Celebrate), {
  ssr: false,
});

// «Принято»: the screen after a lead is sent. A stamp lands once, the text
// says honestly when we call back, and the next step is right there.
export function LeadSuccess({ dark = false, summary }: { dark?: boolean; summary?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [onShift, setOnShift] = useState<boolean | null>(null);
  const [nextShift, setNextShift] = useState('');
  // The install button is on the page (InstallButton sets the attribute): offer it here too.
  const [installLabel, setInstallLabel] = useState<string | null>(null);
  useEffect(() => {
    setOnShift(isOnShift());
    setNextShift(nextShiftText());
    // A good moment to offer «Установить на экран» (InstallPrompt).
    noteInstallMoment();
    if (document.documentElement.hasAttribute(INSTALL_OFFER_ATTR)) {
      setInstallLabel(installLeadLine(navigator.userAgent, navigator.maxTouchPoints ?? 0));
    }
    // Focus without the browser's jump, then centre it: «Принято» never
    // ends up under the sticky header.
    const node = ref.current;
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: 'center' });
  }, []);
  // Two install offers at once is one too many: while this line is on screen
  // the floating button hides (globals.css, data-lead-install).
  const installRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = installRef.current;
    if (!installLabel || !node || typeof IntersectionObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      root.toggleAttribute('data-lead-install', !!last?.isIntersecting);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.removeAttribute('data-lead-install');
    };
  }, [installLabel]);
  const whatsapp = `${SITE.whatsappHref}?text=${encodeURIComponent(
    `Здравствуйте! Оставил заявку на сайте${summary ? `: ${summary}` : ''}.`,
  )}`;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      data-lead-form
      className={`show-glow relative scroll-mt-28 overflow-hidden rounded-2xl p-6 outline-none ${
        dark ? 'bg-slate-900 text-white ring-1 ring-white/10' : 'bg-slate-950 text-white'
      }`}
    >
      <Celebrate />
      <div className="hud-corners pointer-events-none absolute inset-3" aria-hidden />
      <div className="stamp w-fit" aria-hidden>
        Принято
      </div>
      <h2 className="mt-4 text-lg font-semibold">Заявка у диспетчера {SITE.name}</h2>
      <p className="mt-1 text-sm text-white/70">
        {onShift === false
          ? `Сейчас нерабочее время — диспетчер Иван перезвонит ${nextShift}.`
          : `Диспетчер Иван перезвонит в течение ${CALLBACK_IN}.`}{' '}
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
        <TelegramButton page="zayavka-prinyata" className="min-h-12" dark />
      </div>
      <p className="mt-2 text-xs text-white/60">
        В Telegram — цены и свободная техника.{' '}
        <a href="/privacy" className="underline">
          Политика конфиденциальности
        </a>
      </p>
      {installLabel && (
        <button
          ref={installRef}
          type="button"
          data-testid="lead-install"
          onClick={() => window.dispatchEvent(new Event(INSTALL_OPEN_EVENT))}
          className="install-line mt-4"
        >
          {installLabel}
        </button>
      )}
      <div className="mt-5 border-t border-white/10 pt-4">
        <PhotoShare role="client" dark />
      </div>
    </div>
  );
}
