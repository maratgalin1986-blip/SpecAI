'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  dismissInstallHint,
  hasInstallMoment,
  INSTALL_MOMENT_EVENT,
  INSTALL_TEXTS,
  isAppInviteSearch,
  installHintMode,
  installStorage,
  isInstallDismissed,
  isInstallHintPage,
  isMobileUa,
  markInstallMoment,
  recordVisit,
  type InstallHintMode,
} from '@/lib/installHint';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Set by the inline script in app/layout.tsx: the event can fire before React. */
type InstallWindow = Window & { __installPrompt?: BeforeInstallPromptEvent | null };

/** On a second visit the page gets a few seconds of its own first. */
const VISIT_DELAY_MS = 6_000;
/** Right after a lead or a sign-up the moment is now. */
const MOMENT_DELAY_MS = 2_500;
/** How long the card waits for a free slot (one look a second). */
const MAX_WAIT_TICKS = 300;

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * The intro is still playing, or on a phone the bottom slot is taken by the
 * cookie strip or the Telegram chip: wait, so two cards never stack. On a
 * computer the card is at the top and those two are at the bottom.
 */
function slotBusy(): boolean {
  const root = document.documentElement;
  const intro = document.getElementById('intro');
  if (intro && !intro.hidden) return true;
  const phone = window.matchMedia?.('(max-width: 639px)').matches === true;
  return phone && (root.hasAttribute('data-cookie-strip') || root.hasAttribute('data-tg-chip'));
}

/**
 * «Установить на экран»: a slim card, on a phone above the call bar, on a
 * computer at the top right under the header (the hero's buttons are on the
 * left and at the bottom). Chrome, Edge and Яндекс Браузер (Android and
 * desktop) get the «Установить» button with the browser's own dialog; Safari
 * on iPhone has no such API, so it gets the two taps to make. Not on the first
 * visit (lib/installHint.ts), never inside the installed app, the CRM, bots or
 * WebViews; ✕ hides it for good. Renders nothing until mounted. On a phone the
 * card hides while a field is focused (data-bottom-bar), lifts the chat button
 * and pads the page end (data-install-hint, globals.css); on pages without the
 * call bar it stands at the end of the page instead of over the form.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<InstallHintMode | null>(null);
  const [desktop, setDesktop] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  // Looks again after a move inside the site (e.g. from /admin to /).
  const retry = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    const win = window as InstallWindow;
    const storage = installStorage();
    const visits = recordVisit(storage, Date.now());
    // Came by an «install the app» link: the moment is now, and it lasts for
    // the next pages too (the card may wait for a free slot).
    const invited = isAppInviteSearch(window.location.search);
    if (invited) markInstallMoment(storage, Date.now());
    let moment = invited || hasInstallMoment(storage, Date.now());
    let ready = false;
    let shown = false;
    let timer = 0;
    let poll = 0;
    let ticks = 0;

    deferred.current = win.__installPrompt ?? null;

    const stopPoll = () => {
      window.clearInterval(poll);
      poll = 0;
    };
    const tryShow = () => {
      if (!ready || shown) return;
      const next = installHintMode({
        pathname: window.location.pathname,
        standalone: isStandalone(),
        dismissed: isInstallDismissed(storage),
        visits,
        moment,
        ua: navigator.userAgent,
        webdriver: navigator.webdriver === true,
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
        promptAvailable: !!deferred.current,
      });
      // Nothing to offer (yet): `beforeinstallprompt`, a lead or a move calls again.
      if (!next) return stopPoll();
      // The slot is taken: look again every second, for a few minutes at most.
      if (slotBusy()) {
        if (!poll) {
          ticks = 0;
          poll = window.setInterval(() => {
            ticks += 1;
            if (ticks > MAX_WAIT_TICKS) stopPoll();
            else tryShow();
          }, 1_000);
        }
        return;
      }
      shown = true;
      stopPoll();
      setDesktop(!isMobileUa(navigator.userAgent, navigator.maxTouchPoints ?? 0));
      setMode(next);
    };
    const start = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        ready = true;
        tryShow();
      }, delay);
    };
    retry.current = tryShow;

    const onBeforeInstall = (event: Event) => {
      // Our card comes at the right time instead of the browser's mini-infobar;
      // after ✕ the browser's own offer is left alone.
      if (!isInstallDismissed(storage)) event.preventDefault();
      deferred.current = event as BeforeInstallPromptEvent;
      tryShow();
    };
    const onInstalled = () => {
      dismissInstallHint(storage);
      deferred.current = null;
      shown = true;
      setMode(null);
    };
    const onMoment = () => {
      if (moment || shown || isInstallDismissed(storage)) return;
      moment = true;
      start(MOMENT_DELAY_MS);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener(INSTALL_MOMENT_EVENT, onMoment);
    if (!isInstallDismissed(storage)) start(moment ? MOMENT_DELAY_MS : VISIT_DELAY_MS);

    return () => {
      retry.current = null;
      window.clearTimeout(timer);
      stopPoll();
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener(INSTALL_MOMENT_EVENT, onMoment);
    };
  }, []);

  useEffect(() => {
    retry.current?.();
  }, [pathname]);

  const open = mode !== null && isInstallHintPage(pathname);
  useEffect(() => {
    if (!open) return;
    document.documentElement.setAttribute('data-install-hint', '');
    return () => document.documentElement.removeAttribute('data-install-hint');
  }, [open]);

  if (!open) return null;

  const dismiss = () => {
    dismissInstallHint(installStorage());
    setMode(null);
  };

  const install = async () => {
    const event = deferred.current;
    if (!event) {
      dismiss();
      return;
    }
    deferred.current = null;
    (window as InstallWindow).__installPrompt = null;
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // The browser refused to show its dialog again: nothing more to offer.
    }
    // Installed or «Отмена» in the browser's dialog: either way, not again.
    dismiss();
  };

  return (
    <div
      role="region"
      aria-label="Установка на экран"
      data-testid="install-hint"
      data-bottom-bar
      className="install-hint fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[44] flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 py-1 pl-2 pr-1 text-slate-800 shadow-lg backdrop-blur sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[5.5rem] sm:max-w-sm"
    >
      <img
        src="/icons/icon-192.png"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1 py-1 text-[13px] leading-snug">
        <p className="font-semibold">{desktop ? INSTALL_TEXTS.desktop : INSTALL_TEXTS.phone}</p>
        {mode === 'ios' && <p className="text-slate-600">{INSTALL_TEXTS.ios}</p>}
      </div>
      {mode === 'native' && (
        <button
          type="button"
          onClick={install}
          className="min-h-11 shrink-0 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        >
          {INSTALL_TEXTS.button}
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label={INSTALL_TEXTS.close}
        title="Закрыть"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
      >
        ✕
      </button>
    </div>
  );
}
