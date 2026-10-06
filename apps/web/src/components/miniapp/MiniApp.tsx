'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { reachGoal } from '@/lib/marketing';
import { machineByType } from '@/lib/miniApp';
import type { MachineType } from '@/lib/machinePhotos';
import { SITE } from '@/lib/site';
import { Catalogue } from './Catalogue';
import { Feed } from './Feed';
import { OrderFlow } from './OrderFlow';
import { telegramApp, type TgWebApp } from './telegram';

// The Telegram Mini App (/tg): «Наши работы», «Техника», «Заказать». It covers
// the site's own header, footer and floating buttons the same way /stroyka
// does (a fixed full-screen layer), and works as a plain mobile page outside
// Telegram. Telegram's script is the only third-party script, on this page only.

type Tab = 'feed' | 'catalogue' | 'order';

const TABS: { id: Tab; label: string }[] = [
  { id: 'feed', label: 'Наши работы' },
  { id: 'catalogue', label: 'Техника' },
  { id: 'order', label: 'Заказать' },
];

/** The site's slate-950: Telegram's header and background match the page. */
const DARK = '#020617';

export function MiniApp() {
  const [tab, setTab] = useState<Tab>('feed');
  const [tg, setTg] = useState<TgWebApp | null>(null);
  const [startParam, setStartParam] = useState('');
  const [preselect, setPreselect] = useState<{ slug: string | null; at: number }>({
    slug: null,
    at: 0,
  });
  const counted = useRef(false);

  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    reachGoal('miniapp_open');
  }, []);

  // The page scrolls inside its own panels; the site page under it stays still.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev;
      document.body.style.overflow = '';
    };
  }, []);

  // next/script calls this once the script has loaded and again on every
  // mount (client-side navigation back to /tg).
  const connect = useCallback(() => {
    const app = telegramApp();
    if (!app) return;
    app.ready();
    app.expand();
    app.setHeaderColor?.(DARK);
    app.setBackgroundColor?.(DARK);
    app.setBottomBarColor?.(DARK);
    setStartParam(app.initDataUnsafe?.start_param ?? '');
    setTg(app);
  }, []);

  const order = useCallback((slug: string | null) => {
    setPreselect({ slug, at: Date.now() });
    setTab('order');
  }, []);
  const orderType = useCallback(
    (type?: MachineType) => order(machineByType(type)?.slug ?? null),
    [order],
  );

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-slate-950 text-white">
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onReady={connect}
      />
      <header className="shrink-0 border-b border-slate-800 bg-slate-950/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex items-center justify-between px-4 pt-2">
          <p className="min-w-0 truncate text-sm font-bold tracking-tight">
            <span className="text-amber-400">{SITE.name}</span>
            <span className="text-slate-400"> · техника с машинистом</span>
          </p>
          <a href={SITE.phoneHref} className="shrink-0 pl-3 text-xs font-semibold text-amber-400">
            Позвонить
          </a>
        </div>
        <nav role="tablist" aria-label="Разделы" className="flex px-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`flex-1 border-b-2 px-2 py-2.5 text-sm font-semibold transition ${
                tab === item.id
                  ? 'border-amber-500 text-white'
                  : 'border-transparent text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="relative min-h-0 flex-1">
        {/* Panels stay mounted, so the feed keeps its place between tabs. */}
        <div className={tab === 'feed' ? 'h-full' : 'hidden'} role="tabpanel">
          <Feed onOrder={orderType} />
        </div>
        <div className={tab === 'catalogue' ? 'h-full' : 'hidden'} role="tabpanel">
          <Catalogue onOrder={order} />
        </div>
        <div className={tab === 'order' ? 'h-full' : 'hidden'} role="tabpanel">
          <OrderFlow
            tg={tg}
            active={tab === 'order'}
            initialSlug={preselect}
            startParam={startParam}
          />
        </div>
      </div>
    </div>
  );
}
