'use client';

import { isStandalonePage } from '@/components/PublicOnly';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  attentionDelay,
  INSTALL_ATTENTION,
  INSTALL_BUTTON_TEXTS,
  INSTALL_IOS_STEPS,
  INSTALL_OFFER_ATTR,
  INSTALL_OPEN_EVENT,
  installButtonMode,
  installButtonText,
  isMobileUa,
  sparkOffsets,
  type InstallButtonMode,
  type InstallIosStepIcon,
} from '@/lib/installHint';
import { reachGoal } from '@/lib/marketing';
import { CONTROLS, coversContent, hasOwnText, watchOverlay } from '@/lib/overlayClear';

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

// Per page load, not per route: the layout keeps the button across navigation.
let attentionPasses = 0;
let shownReported = false;

const SPARKS = sparkOffsets(8, 46);
const DONE_MS = 2400;
/** The full pill with its label: the entrance and the first attention pass, then the round icon. */
const PILL_MS = 6000;
/** Set on <html> while the round icon sits in the phone contact bar's row (globals.css). */
const DOCK_ATTR = 'data-install-dock';

/**
 * Whether the button, as it is drawn now, lies on something of the page.
 * Computers: free only in the page's side margin; the pill never goes over the
 * content column, the icon may stand over an empty part of it. Phones: never
 * over a link, a button, a field or large text (a price, a heading, the phone).
 */
function onContent(el: HTMLElement, shape: 'pill' | 'icon', phone: boolean): boolean {
  const rect = el.getBoundingClientRect();
  const box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  if (phone) {
    return coversContent(box, (hit) => hit.matches(CONTROLS) || hasOwnText(hit, 20));
  }
  const main = document.querySelector('main');
  if (main) {
    const column =
      main.getBoundingClientRect().left + parseFloat(getComputedStyle(main).paddingLeft);
    if (box.right <= column) return false;
    if (shape === 'pill') return true;
  }
  return coversContent(box, (hit) => hit.matches(CONTROLS) || hasOwnText(hit, 0));
}

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function PhoneIcon() {
  return (
    <svg {...svgProps}>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M12 8v6m-3-3 3 3 3-3" />
    </svg>
  );
}

function DesktopIcon() {
  return (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4M12 7v5m-2.5-2.5L12 12l2.5-2.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...svgProps} strokeWidth={3}>
      <path className="install-check" d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function StepIcon({ name }: { name: InstallIosStepIcon }) {
  if (name === 'share') {
    return (
      <svg {...svgProps}>
        <path d="M12 15V3m-4 4 4-4 4 4M7 10H6a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18 10h-1" />
      </svg>
    );
  }
  if (name === 'plus') {
    return (
      <svg {...svgProps}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    );
  }
  return (
    <svg {...svgProps} strokeWidth={2.5}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * «На экран телефона» / «На рабочий стол» (owner, 2026-10-28: the install
 * button must always be there; 2026-11-10: more visible and with an effect):
 * a dark pill with an amber icon on every page until the site is installed. It
 * enters as the full pill with a bounce, draws the eye (a glow, a light sweep, a
 * light jump) and then folds into a 48 px round icon with a soft glow: on a
 * phone the icon stands in the contact bar's own row, on a computer in the
 * page's side margin, so it never covers an order button, a price, the phone or
 * a field (lib/overlayClear.ts; where there is no free place it waits, hidden,
 * until the page under it is empty). A press throws sparks and a
 * finished install draws a check. Chrome, Edge and Яндекс Браузер open their own
 * install dialog; Safari on iPhone gets three pictured steps, the other
 * browsers a short instruction. Hidden in the installed app, the Telegram
 * mini-app, Android WebViews, while the «Установить» card (InstallPrompt) or
 * Сторож is on screen, and while a field is focused (globals.css, .install-fab;
 * look and effects in install.css).
 */
export function InstallButton() {
  const pathname = usePathname();
  const [mode, setMode] = useState<InstallButtonMode | null>(null);
  const [label, setLabel] = useState<string>(INSTALL_BUTTON_TEXTS.button);
  const [phone, setPhone] = useState(false);
  const [help, setHelp] = useState(false);
  const [attn, setAttn] = useState(false);
  const [done, setDone] = useState(false);
  const [burst, setBurst] = useState(0);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const helpOpen = useRef(false);
  helpOpen.current = help;
  const press = useRef<() => void>(() => {});
  const fabRef = useRef<HTMLDivElement>(null);
  // The first seconds on the page: the full pill. Per page load, as the attention passes.
  const [entrance, setEntrance] = useState(true);

  const visible = !!mode && !isStandalonePage(pathname);

  useEffect(() => {
    const win = window as InstallWindow;
    deferred.current = win.__installPrompt ?? null;
    const maxTouchPoints = navigator.maxTouchPoints ?? 0;
    const update = () => {
      setMode(
        installButtonMode({
          pathname: window.location.pathname,
          standalone: isStandalone(),
          ua: navigator.userAgent,
          maxTouchPoints,
          promptAvailable: !!deferred.current,
        }),
      );
      setLabel(installButtonText(navigator.userAgent, maxTouchPoints));
      setPhone(isMobileUa(navigator.userAgent, maxTouchPoints));
    };
    const onBeforeInstall = (event: Event) => {
      deferred.current = event as BeforeInstallPromptEvent;
      update();
    };
    const onInstalled = () => {
      deferred.current = null;
      setDone(true);
    };
    update();
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [pathname]);

  // The check stays for a moment, then the button goes for good.
  useEffect(() => {
    if (!done) return;
    reachGoal('install_done');
    const timer = window.setTimeout(() => setMode(null), DONE_MS);
    return () => window.clearTimeout(timer);
  }, [done]);

  // Goal «shown» once per page load; other entry points look for the attribute.
  useEffect(() => {
    if (!visible) return;
    if (!shownReported) {
      shownReported = true;
      reachGoal('install_shown');
    }
    const root = document.documentElement;
    root.setAttribute(INSTALL_OFFER_ATTR, '');
    return () => root.removeAttribute(INSTALL_OFFER_ATTR);
  }, [visible]);

  // Attention: a few passes, then calm (INSTALL_ATTENTION). Not while the help is open.
  useEffect(() => {
    if (!visible) return;
    let timer = 0;
    const schedule = () => {
      const delay = attentionDelay(attentionPasses);
      if (delay === null) return;
      timer = window.setTimeout(() => {
        if (!helpOpen.current && !document.hidden) {
          attentionPasses += 1;
          setAttn(true);
          timer = window.setTimeout(() => {
            setAttn(false);
            schedule();
          }, INSTALL_ATTENTION.activeMs);
        } else {
          schedule();
        }
      }, delay);
    };
    schedule();
    return () => {
      window.clearTimeout(timer);
      setAttn(false);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setEntrance(false), PILL_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  // Pill or icon, and where: decided against what the page shows under the
  // button, again on every scroll. The attributes are set here, not by React,
  // so the measuring and the result land in the same frame.
  useEffect(() => {
    const el = fabRef.current;
    if (!visible || !el) return;
    const root = document.documentElement;
    // A pill that met an obstacle stays an icon for the rest of this phase.
    let folded = false;
    const settle = () => {
      const phone = window.matchMedia('(max-width: 639px)').matches;
      const dock = phone && !root.hasAttribute('data-no-contact-bar');
      // In the contact bar the label shows only on arrival; elsewhere on every attention pass too.
      const wantPill = (entrance || (attn && !dock)) && !folded;
      let shape: 'pill' | 'icon' = wantPill ? 'pill' : 'icon';
      el.dataset.shape = shape;
      delete el.dataset.away;
      // The open instruction hangs on the button: it stays where it is.
      if (helpOpen.current) return;
      if (shape === 'pill' && onContent(el, 'pill', phone)) {
        folded = true;
        shape = 'icon';
        el.dataset.shape = shape;
      }
      const docked = dock && shape === 'icon';
      root.toggleAttribute(DOCK_ATTR, docked);
      if (shape === 'icon' && !docked && onContent(el, 'icon', phone)) el.dataset.away = '';
    };
    const stop = watchOverlay(settle);
    return () => {
      stop();
      root.removeAttribute(DOCK_ATTR);
    };
  }, [visible, entrance, attn, help, pathname]);

  // «Другие места» (the lead screen) ask the button to do what a press does.
  useEffect(() => {
    const onOpen = () => press.current();
    window.addEventListener(INSTALL_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(INSTALL_OPEN_EVENT, onOpen);
  }, []);

  press.current = async () => {
    reachGoal('install_click');
    setAttn(false);
    setBurst((n) => n + 1);
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
        setDone(true);
        return;
      }
    } catch {
      // The browser will not show its dialog again on this page.
    }
    // «Отмена» or a refused dialog: the button stays, now with the instruction.
    setMode('manual');
  };

  // Страницы офиса для других компаний (/s, /preview, /kp) — без кнопки установки площадки.
  if (!visible) return null;

  const text =
    mode === 'ios-other'
      ? INSTALL_BUTTON_TEXTS.iosOther
      : mode === 'manual'
        ? INSTALL_BUTTON_TEXTS.manual
        : null;

  return (
    <div
      ref={fabRef}
      data-bottom-bar
      data-platform-chrome
      data-testid="install-fab"
      data-help={help ? '' : undefined}
      data-attn={attn ? '' : undefined}
      className="install-fab fixed left-3 z-[45]"
    >
      {help && !done && (
        <div
          role="dialog"
          aria-label={INSTALL_BUTTON_TEXTS.title}
          data-testid="install-fab-help"
          className="install-help absolute bottom-full left-0 mb-3 w-[min(19rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-3.5 text-[13px] leading-snug text-slate-800 shadow-xl"
        >
          <p className="text-sm font-bold text-slate-950">{INSTALL_BUTTON_TEXTS.title}</p>
          {mode === 'ios' ? (
            <>
              <ol className="install-steps" data-testid="install-steps">
                {INSTALL_IOS_STEPS.map((step, i) => (
                  <li key={step.icon} className="install-step" style={{ '--i': i } as never}>
                    <span className="install-step__icon">
                      <StepIcon name={step.icon} />
                      <span className="install-step__n">{i + 1}</span>
                    </span>
                    <span className="font-medium">{step.text}</span>
                  </li>
                ))}
              </ol>
              <svg {...svgProps} className="install-arrow">
                <path d="M12 5v14m-5-5 5 5 5-5" />
              </svg>
            </>
          ) : (
            <p className="mt-1 text-slate-600">{text}</p>
          )}
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
        onClick={() => press.current()}
        aria-label={INSTALL_BUTTON_TEXTS.label}
        aria-expanded={mode === 'native' ? undefined : help}
        data-done={done ? '' : undefined}
        className="install-btn focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <span className="install-btn__icon">
          {done ? <CheckIcon /> : phone ? <PhoneIcon /> : <DesktopIcon />}
        </span>
        <span className="install-btn__label">{done ? INSTALL_BUTTON_TEXTS.done : label}</span>
        <span className="install-btn__sweep" aria-hidden />
      </button>
      <span className="install-glow" aria-hidden />
      {burst > 0 && (
        <span key={burst} className="install-sparks" aria-hidden>
          {SPARKS.map((spark, i) => (
            <span
              key={i}
              className="install-spark"
              style={{ '--dx': `${spark.dx}px`, '--dy': `${spark.dy}px` } as never}
            />
          ))}
        </span>
      )}
    </div>
  );
}
