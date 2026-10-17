// «Установить на экран» (owner, 2026-10-17): a slim card that offers to put
// the site on the home screen. Never on the first look at the site: from the
// second visit on, or right after a lead or a sign-up. ✕ hides it for good.
// Everything here is pure (a Storage-like object, a user-agent string), so the
// rules are unit-tested and the reads never throw (private mode, blocked
// storage). Only a visit counter and two flags are kept, no personal data.

import { SITE } from './site';

/** ✕, the browser's own «Отмена» or a finished install: never again. */
export const INSTALL_DISMISSED_KEY = 'specai:install-hint-dismissed';
/** The earlier 7-day version of the hint: closing it once is enough. */
export const LEGACY_DISMISSED_KEY = 'specai:install-prompt-dismissed-at';
/** `{count, last}`: visits to the site and the last page view (ms). */
export const INSTALL_VISITS_KEY = 'specai:visits';
/** When a lead or a customer's sign-up went through (ms): the hint may show at once. */
export const INSTALL_MOMENT_KEY = 'specai:install-moment';
/** How long that moment lasts: this page and the next ones within half an hour. */
export const MOMENT_TTL_MS = 30 * 60_000;
/** Sent on window after a lead, so the hint on the same page can show. */
export const INSTALL_MOMENT_EVENT = 'specai:install-moment';

/** A new visit starts after half an hour without page views (as in Metrika). */
export const VISIT_GAP_MS = 30 * 60_000;
/** The hint is offered from this visit on. */
export const MIN_VISITS = 2;

export const INSTALL_TEXTS = {
  phone: `Установить ${SITE.platform} на телефон — заказ техники в один тап`,
  desktop: `Установить ${SITE.platform} на компьютер — заказ техники в один клик`,
  ios: 'Нажмите «Поделиться» ⬆︎ → «На экран „Домой“»',
  button: 'Установить',
  close: 'Закрыть подсказку об установке',
} as const;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface Visits {
  count: number;
  last: number;
}

export function parseVisits(raw: string | null): Visits {
  if (!raw) return { count: 0, last: 0 };
  try {
    const value = JSON.parse(raw) as Partial<Visits>;
    const count = Number(value?.count);
    const last = Number(value?.last);
    return {
      count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
      last: Number.isFinite(last) && last > 0 ? last : 0,
    };
  } catch {
    return { count: 0, last: 0 };
  }
}

/** A page view: counts a new visit after VISIT_GAP_MS of silence. */
export function nextVisits(previous: Visits, now: number): Visits {
  const fresh = previous.count === 0 || now - previous.last > VISIT_GAP_MS;
  return { count: fresh ? previous.count + 1 : previous.count, last: now };
}

/** Records this page view and returns the visit count (0 when storage is blocked). */
export function recordVisit(storage: StorageLike | null, now: number): number {
  if (!storage) return 0;
  try {
    const visits = nextVisits(parseVisits(storage.getItem(INSTALL_VISITS_KEY)), now);
    storage.setItem(INSTALL_VISITS_KEY, JSON.stringify(visits));
    return visits.count;
  } catch {
    return 0;
  }
}

function read(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Blocked storage: the choice lasts until the page is closed.
  }
}

export function isInstallDismissed(storage: StorageLike | null): boolean {
  return !!(read(storage, INSTALL_DISMISSED_KEY) || read(storage, LEGACY_DISMISSED_KEY));
}

export function dismissInstallHint(storage: StorageLike | null) {
  write(storage, INSTALL_DISMISSED_KEY, '1');
}

/** localStorage, or null where the browser blocks it (private mode, settings). */
export function installStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** A lead or a sign-up within the last half hour (the page after it included). */
export function hasInstallMoment(storage: StorageLike | null, now: number): boolean {
  const at = Number(read(storage, INSTALL_MOMENT_KEY));
  return Number.isFinite(at) && at > 0 && at <= now && now - at <= MOMENT_TTL_MS;
}

/** After a lead or a sign-up; the hint shows on this page or the next one. */
export function markInstallMoment(storage: StorageLike | null, now: number) {
  write(storage, INSTALL_MOMENT_KEY, String(now));
}

/** Browser-side wrapper for forms: sets the flag and wakes the hint. */
export function noteInstallMoment() {
  if (typeof window === 'undefined') return;
  // Blocked storage: the event alone still shows the hint on this page.
  markInstallMoment(installStorage(), Date.now());
  window.dispatchEvent(new Event(INSTALL_MOMENT_EVENT));
}

// «…bot/» (YandexBot/, Googlebot/, bingbot/) or a separate word «bot»; phone
// models such as «CUBOT X50» are people.
const BOT_RE =
  /[a-z]bot\/|(?:^|[^a-z])bot\b|crawl|spider|slurp|bingpreview|facebookexternalhit|yandex(?:images|metrika|webmaster|favicons)|lighthouse|headlesschrome|phantomjs|prerender/i;

/** Search robots, previews and automated browsers (navigator.webdriver). */
export function isBot(ua: string, webdriver = false): boolean {
  return webdriver || BOT_RE.test(ua);
}

/** Android WebView (the app's map, messengers' in-app pages): no install there. */
export function isAndroidWebView(ua: string): boolean {
  return /Android/.test(ua) && /; wv\)/.test(ua);
}

export function isIos(ua: string, maxTouchPoints = 0): boolean {
  // iPadOS 13+ reports a Mac; only the touch screen gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

/**
 * Safari itself on iPhone/iPad: only it has «На экран „Домой“» where the hint
 * says. Chrome, Firefox, Edge, Opera, Яндекс and the in-app browsers of
 * Telegram, VK, Instagram and Google are left out; WebViews lack «Version/…
 * Safari».
 */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  if (!isIos(ua, maxTouchPoints)) return false;
  if (!/Version\/[\d.]+.*Safari\//.test(ua)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|GSA\/|Instagram|FBAN|FBAV|VKClient|Telegram|DuckDuckGo/.test(
    ua,
  );
}

export function isMobileUa(ua: string, maxTouchPoints = 0): boolean {
  return /Android|Mobi/.test(ua) || isIos(ua, maxTouchPoints);
}

/** Pages without the hint: the CRM and the Telegram mini-app. */
export function isInstallHintPage(pathname: string | null | undefined): boolean {
  return !/^\/(admin|tg)(\/|$)/.test(pathname ?? '');
}

export type InstallHintMode = 'native' | 'ios';

export interface InstallHintInput {
  pathname: string | null | undefined;
  /** Opened from the home screen already (display-mode: standalone, navigator.standalone). */
  standalone: boolean;
  dismissed: boolean;
  visits: number;
  /** A lead or a sign-up just went through. */
  moment: boolean;
  ua: string;
  webdriver?: boolean;
  maxTouchPoints?: number;
  /** The browser fired `beforeinstallprompt` (Chrome, Edge, Яндекс Браузер on Android/desktop). */
  promptAvailable: boolean;
}

/** Which card to show, or null for none. */
export function installHintMode(input: InstallHintInput): InstallHintMode | null {
  if (input.standalone || input.dismissed) return null;
  if (!isInstallHintPage(input.pathname)) return null;
  if (isBot(input.ua, input.webdriver) || isAndroidWebView(input.ua)) return null;
  if (input.visits < MIN_VISITS && !input.moment) return null;
  if (input.promptAvailable) return 'native';
  if (isIosSafari(input.ua, input.maxTouchPoints)) return 'ios';
  return null;
}
