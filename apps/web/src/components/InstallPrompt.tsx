'use client';

import { useEffect, useState } from 'react';
import { COOKIE_CONSENT_KEY } from '@/lib/marketing';
import { SITE } from '@/lib/site';

const DISMISS_KEY = 'specai:install-prompt-dismissed-at';
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type Mode = 'hidden' | 'native' | 'ios';

function isDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
}

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>('hidden');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    // Chrome offers installation right away; the banner still waits (below).
    let offered = false;
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      offered = true;
    };
    const onInstalled = () => {
      setMode('hidden');
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // Not on arrival: the first screen belongs to the site and the call
    // button. The hint comes after half a minute, once the cookie notice is
    // answered, so the two never stack over the content.
    const timer = window.setTimeout(() => {
      let cookieAnswered = true;
      try {
        cookieAnswered = !!window.localStorage.getItem(COOKIE_CONSENT_KEY);
      } catch {
        // Storage blocked: the cookie notice shows every visit, skip the hint.
        cookieAnswered = false;
      }
      if (!cookieAnswered) return;
      if (offered) setMode('native');
      else if (isIosSafari()) setMode('ios');
    }, 30_000);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (mode === 'hidden') return null;

  const dismiss = () => {
    rememberDismiss();
    setMode('hidden');
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setMode('hidden');
    else dismiss();
  };

  return (
    <div
      role="dialog"
      aria-label="Установить приложение"
      className="fixed inset-x-3 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:inset-x-auto sm:bottom-3 sm:left-4"
    >
      <img
        src="/icons/icon-192.png"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 rounded-lg"
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-slate-900">Установить приложение</p>
        {mode === 'ios' ? (
          <p className="text-slate-600">
            Нажмите «Поделиться» <span aria-hidden="true">⎋</span> → «На экран „Домой“».
          </p>
        ) : (
          <p className="text-slate-600">{SITE.name} на главном экране, без браузера.</p>
        )}
      </div>
      {mode === 'native' && (
        <button
          type="button"
          onClick={install}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Установить
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Закрыть"
        className="flex h-9 w-9 items-center justify-center rounded-md text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        ×
      </button>
    </div>
  );
}
