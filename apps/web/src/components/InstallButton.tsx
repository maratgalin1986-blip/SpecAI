'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { INSTALL_BUTTON_TEXTS, installButtonMode, type InstallButtonMode } from '@/lib/installHint';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Set by the inline script in app/layout.tsx: the event can fire before React. */
type InstallWindow = Window & { __installPrompt?: BeforeInstallPromptEvent | null };

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * «На рабочий стол» (owner, 2026-10-28: the install button must always be
 * there): a small button at the bottom left of every page until the site is
 * installed. Chrome, Edge and Яндекс Браузер open their own install dialog;
 * Safari on iPhone and the other browsers get a short instruction. Hidden in
 * the installed app, the Telegram mini-app, Android WebViews and while the
 * «Установить» card (InstallPrompt) is on screen (globals.css, .install-fab).
 */
export function InstallButton() {
  const pathname = usePathname();
  const [mode, setMode] = useState<InstallButtonMode | null>(null);
  const [help, setHelp] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const win = window as InstallWindow;
    deferred.current = win.__installPrompt ?? null;
    const update = () =>
      setMode(
        installButtonMode({
          pathname: window.location.pathname,
          standalone: isStandalone(),
          ua: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints ?? 0,
          promptAvailable: !!deferred.current,
        }),
      );
    const onBeforeInstall = (event: Event) => {
      deferred.current = event as BeforeInstallPromptEvent;
      update();
    };
    const onInstalled = () => {
      deferred.current = null;
      setMode(null);
    };
    update();
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [pathname]);

  if (!mode) return null;

  const onClick = async () => {
    const event = deferred.current ?? (window as InstallWindow).__installPrompt ?? null;
    if (mode !== 'native' || !event) {
      setHelp((v) => !v);
      return;
    }
    deferred.current = null;
    (window as InstallWindow).__installPrompt = null;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') {
        setMode(null);
        return;
      }
    } catch {
      // The browser will not show its dialog again on this page.
    }
    // «Отмена» or a refused dialog: the button stays, now with the instruction.
    setMode('manual');
  };

  const text =
    mode === 'ios'
      ? INSTALL_BUTTON_TEXTS.ios
      : mode === 'ios-other'
        ? INSTALL_BUTTON_TEXTS.iosOther
        : INSTALL_BUTTON_TEXTS.manual;

  return (
    <div data-bottom-bar data-testid="install-fab" className="install-fab fixed left-3 z-[45]">
      {help && (
        <div
          role="dialog"
          aria-label={INSTALL_BUTTON_TEXTS.title}
          data-testid="install-fab-help"
          className="absolute bottom-full left-0 mb-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-3 text-[13px] leading-snug text-slate-800 shadow-xl"
        >
          <p className="font-semibold">{INSTALL_BUTTON_TEXTS.title}</p>
          <p className="mt-1 text-slate-600">{text}</p>
          <button
            type="button"
            onClick={() => setHelp(false)}
            className="mt-2 min-h-11 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"
          >
            {INSTALL_BUTTON_TEXTS.close}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label={INSTALL_BUTTON_TEXTS.label}
        aria-expanded={mode === 'native' ? undefined : help}
        className="flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 py-1 pl-1 pr-3 text-[13px] font-semibold text-slate-800 shadow-lg backdrop-blur hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        <img
          src="/icons/icon-192.png"
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 rounded-full"
        />
        {INSTALL_BUTTON_TEXTS.button}
      </button>
    </div>
  );
}
