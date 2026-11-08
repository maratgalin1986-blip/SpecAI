import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
import {
  dismissInstallHint,
  hasInstallMoment,
  INSTALL_DISMISSED_KEY,
  INSTALL_MOMENT_KEY,
  MOMENT_TTL_MS,
  INSTALL_TEXTS,
  INSTALL_VISITS_KEY,
  installButtonMode,
  installHintMode,
  isAndroidWebView,
  isAppInviteSearch,
  isBot,
  isInstallDismissed,
  isInstallHintPage,
  isIosSafari,
  isMobileUa,
  LEGACY_DISMISSED_KEY,
  markInstallMoment,
  nextVisits,
  parseVisits,
  recordVisit,
  VISIT_GAP_MS,
  type InstallHintInput,
} from './installHint';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneYandex:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 YaBrowser/24.6.4.580.10 SA/3 Mobile/15E148 Safari/604.1',
  iphoneWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneTelegram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 Telegram-iOS/10.14',
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidYandex:
    'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 YaBrowser/24.4.1.99.00 SA/3 Mobile Safari/537.36',
  cubot:
    'Mozilla/5.0 (Linux; Android 11; CUBOT X50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; SM-A546B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  desktopFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  yandexBot: 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
  googleBot:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  headless:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
};

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const blocked = {
  getItem(): string | null {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('SecurityError');
  },
};

function input(over: Partial<InstallHintInput> = {}): InstallHintInput {
  return {
    pathname: '/',
    standalone: false,
    dismissed: false,
    visits: 2,
    moment: false,
    ua: UA.androidChrome,
    webdriver: false,
    maxTouchPoints: 5,
    promptAvailable: true,
    ...over,
  };
}

describe('installHintMode', () => {
  it('offers the install button where the browser fired beforeinstallprompt', () => {
    expect(installHintMode(input())).toBe('native');
    expect(installHintMode(input({ ua: UA.androidYandex }))).toBe('native');
    expect(installHintMode(input({ ua: UA.desktopChrome, maxTouchPoints: 0 }))).toBe('native');
  });

  it('gives Safari on iPhone and iPad the two-tap instruction', () => {
    expect(installHintMode(input({ ua: UA.iphoneSafari, promptAvailable: false }))).toBe('ios');
    expect(installHintMode(input({ ua: UA.ipadOs, promptAvailable: false }))).toBe('ios');
  });

  it('shows nothing where neither is possible', () => {
    expect(installHintMode(input({ promptAvailable: false }))).toBeNull();
    expect(
      installHintMode(input({ ua: UA.desktopFirefox, maxTouchPoints: 0, promptAvailable: false })),
    ).toBeNull();
    // A Mac without a touch screen is not an iPad.
    expect(
      installHintMode(input({ ua: UA.ipadOs, maxTouchPoints: 0, promptAvailable: false })),
    ).toBeNull();
    for (const ua of [UA.iphoneChrome, UA.iphoneYandex, UA.iphoneWebView, UA.iphoneTelegram]) {
      expect(installHintMode(input({ ua, promptAvailable: false }))).toBeNull();
    }
  });

  it('is never shown inside the installed app', () => {
    expect(installHintMode(input({ standalone: true }))).toBeNull();
    expect(
      installHintMode(input({ standalone: true, ua: UA.iphoneSafari, promptAvailable: false })),
    ).toBeNull();
  });

  it('stays closed for good after ✕', () => {
    expect(installHintMode(input({ dismissed: true }))).toBeNull();
    expect(installHintMode(input({ dismissed: true, moment: true, visits: 9 }))).toBeNull();
  });

  it('waits for the second visit, or a lead or a sign-up', () => {
    expect(installHintMode(input({ visits: 0 }))).toBeNull();
    expect(installHintMode(input({ visits: 1 }))).toBeNull();
    expect(installHintMode(input({ visits: 1, moment: true }))).toBe('native');
    expect(installHintMode(input({ visits: 2 }))).toBe('native');
    expect(installHintMode(input({ visits: 7 }))).toBe('native');
  });

  it('skips the CRM, the Telegram mini-app, bots and WebViews', () => {
    expect(installHintMode(input({ pathname: '/admin' }))).toBeNull();
    expect(installHintMode(input({ pathname: '/admin/leads' }))).toBeNull();
    expect(installHintMode(input({ pathname: '/tg' }))).toBeNull();
    expect(installHintMode(input({ pathname: '/administration' }))).toBe('native');
    expect(installHintMode(input({ webdriver: true }))).toBeNull();
    for (const ua of [UA.yandexBot, UA.googleBot, UA.headless, UA.androidWebView]) {
      expect(installHintMode(input({ ua }))).toBeNull();
    }
  });
});

describe('platform detection', () => {
  it('tells bots from browsers', () => {
    expect(isBot(UA.yandexBot)).toBe(true);
    expect(isBot(UA.googleBot)).toBe(true);
    expect(isBot(UA.headless)).toBe(true);
    expect(isBot(UA.androidChrome, true)).toBe(true);
    expect(isBot(UA.androidChrome)).toBe(false);
    expect(isBot(UA.androidYandex)).toBe(false);
    expect(isBot(UA.iphoneYandex)).toBe(false);
    expect(isBot(UA.iphoneSafari)).toBe(false);
    // Phone models ending in «bot» are people.
    expect(isBot(UA.cubot)).toBe(false);
    expect(isBot('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')).toBe(
      true,
    );
  });

  it('finds Android WebViews', () => {
    expect(isAndroidWebView(UA.androidWebView)).toBe(true);
    expect(isAndroidWebView(UA.androidChrome)).toBe(false);
  });

  it('finds Safari on iOS only', () => {
    expect(isIosSafari(UA.iphoneSafari)).toBe(true);
    expect(isIosSafari(UA.ipadOs, 5)).toBe(true);
    expect(isIosSafari(UA.ipadOs, 0)).toBe(false);
    expect(isIosSafari(UA.iphoneChrome)).toBe(false);
    expect(isIosSafari(UA.androidChrome)).toBe(false);
  });

  it('tells phones from computers for the wording', () => {
    expect(isMobileUa(UA.androidChrome)).toBe(true);
    expect(isMobileUa(UA.iphoneSafari)).toBe(true);
    expect(isMobileUa(UA.ipadOs, 5)).toBe(true);
    expect(isMobileUa(UA.desktopChrome)).toBe(false);
  });

  it('keeps the hint off the CRM and the mini-app only', () => {
    expect(isInstallHintPage('/')).toBe(true);
    expect(isInstallHintPage('/orders')).toBe(true);
    expect(isInstallHintPage(null)).toBe(true);
    expect(isInstallHintPage('/admin')).toBe(false);
    expect(isInstallHintPage('/tg/order')).toBe(false);
  });
});

describe('visits', () => {
  it('counts a new visit only after half an hour of silence', () => {
    const t0 = 1_700_000_000_000;
    let v = nextVisits({ count: 0, last: 0 }, t0);
    expect(v).toEqual({ count: 1, last: t0 });
    v = nextVisits(v, t0 + 60_000);
    expect(v.count).toBe(1);
    v = nextVisits(v, t0 + 60_000 + VISIT_GAP_MS + 1);
    expect(v.count).toBe(2);
  });

  it('reads garbage as no visits', () => {
    expect(parseVisits(null)).toEqual({ count: 0, last: 0 });
    expect(parseVisits('not json')).toEqual({ count: 0, last: 0 });
    expect(parseVisits('{"count":-3,"last":"x"}')).toEqual({ count: 0, last: 0 });
    expect(parseVisits('{"count":2.7,"last":5}')).toEqual({ count: 2, last: 5 });
  });

  it('records page views in storage', () => {
    const storage = new MemoryStorage();
    const t0 = 1_700_000_000_000;
    expect(recordVisit(storage, t0)).toBe(1);
    expect(recordVisit(storage, t0 + 5_000)).toBe(1);
    expect(recordVisit(storage, t0 + 5_000 + VISIT_GAP_MS + 1)).toBe(2);
    expect(JSON.parse(storage.getItem(INSTALL_VISITS_KEY) ?? '{}').count).toBe(2);
  });

  it('never throws with blocked storage (and then never shows)', () => {
    expect(recordVisit(null, 1)).toBe(0);
    expect(recordVisit(blocked, 1)).toBe(0);
    expect(isInstallDismissed(blocked)).toBe(false);
    expect(hasInstallMoment(blocked, 1)).toBe(false);
    expect(() => dismissInstallHint(blocked)).not.toThrow();
    expect(() => markInstallMoment(blocked, 1)).not.toThrow();
  });
});

describe('dismissal and the moment', () => {
  it('remembers ✕ forever, and the earlier 7-day choice too', () => {
    const storage = new MemoryStorage();
    expect(isInstallDismissed(storage)).toBe(false);
    dismissInstallHint(storage);
    expect(storage.getItem(INSTALL_DISMISSED_KEY)).toBe('1');
    expect(isInstallDismissed(storage)).toBe(true);

    const legacy = new MemoryStorage();
    legacy.setItem(LEGACY_DISMISSED_KEY, String(Date.now() - 30 * 86_400_000));
    expect(isInstallDismissed(legacy)).toBe(true);
  });

  it('marks the moment after a lead or a sign-up, for half an hour', () => {
    const storage = new MemoryStorage();
    const t0 = 1_700_000_000_000;
    expect(hasInstallMoment(storage, t0)).toBe(false);
    markInstallMoment(storage, t0);
    expect(hasInstallMoment(storage, t0)).toBe(true);
    expect(hasInstallMoment(storage, t0 + MOMENT_TTL_MS)).toBe(true);
    expect(hasInstallMoment(storage, t0 + MOMENT_TTL_MS + 1)).toBe(false);
    // The flag of the first version ('1') counts as long gone.
    storage.setItem(INSTALL_MOMENT_KEY, '1');
    expect(hasInstallMoment(storage, t0)).toBe(false);
  });

  it('treats an «install the app» link as the moment, and nothing else', () => {
    expect(isAppInviteSearch('?utm_source=specplast16&utm_medium=site&utm_campaign=app')).toBe(
      true,
    );
    expect(isAppInviteSearch('?utm_campaign=APP')).toBe(true);
    expect(isAppInviteSearch('?app=1')).toBe(true);
    expect(isAppInviteSearch('')).toBe(false);
    expect(isAppInviteSearch(null)).toBe(false);
    expect(isAppInviteSearch('?utm_campaign=direct')).toBe(false);
    expect(isAppInviteSearch('?utm_campaign=application')).toBe(false);
    expect(isAppInviteSearch('?app=0')).toBe(false);
  });

  it('the inline script in the layout reads the same keys', () => {
    const layout = readFileSync(
      fileURLToPath(new URL('../app/layout.tsx', import.meta.url)),
      'utf8',
    );
    expect(layout).toContain(`localStorage.getItem('${INSTALL_DISMISSED_KEY}')`);
    expect(layout).toContain(`localStorage.getItem('${LEGACY_DISMISSED_KEY}')`);
  });
});

describe('texts and the web manifest', () => {
  it('names the platform in the hint', () => {
    expect(INSTALL_TEXTS.phone).toBe(
      'Установить ИИСтройка24 на телефон — заказ техники в один тап',
    );
    expect(INSTALL_TEXTS.ios).toBe('Нажмите «Поделиться» ⬆︎ → «На экран „Домой“»');
  });

  it('describes an installable app', () => {
    const m = manifest();
    expect(m.short_name).toBe('ИИСтройка24');
    expect(m.name).toBe('ИИСтройка24 от СпецПласт16');
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    const icons = m.icons ?? [];
    const any = icons.filter((i) => (i.purpose ?? 'any') === 'any').map((i) => i.sizes);
    expect(any).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true);
  });
});

describe('installButtonMode (always-on button)', () => {
  const base = { pathname: '/', standalone: false, ua: UA.androidChrome, promptAvailable: false };

  it('is hidden only inside the installed app, the mini-app and WebViews', () => {
    expect(installButtonMode({ ...base, standalone: true, promptAvailable: true })).toBeNull();
    expect(installButtonMode({ ...base, pathname: '/tg' })).toBeNull();
    expect(installButtonMode({ ...base, pathname: '/tg/orders' })).toBeNull();
    expect(installButtonMode({ ...base, ua: UA.androidWebView })).toBeNull();
  });

  it('shows on every other page, also on the first visit and in the CRM', () => {
    expect(installButtonMode({ ...base, pathname: '/admin' })).toBe('manual');
    expect(installButtonMode({ ...base, pathname: '/orders' })).toBe('manual');
  });

  it('uses the browser dialog when there is one', () => {
    expect(installButtonMode({ ...base, promptAvailable: true })).toBe('native');
  });

  it('gives iPhone the Safari steps, and other iPhone browsers «open in Safari»', () => {
    expect(installButtonMode({ ...base, ua: UA.iphoneSafari })).toBe('ios');
    expect(installButtonMode({ ...base, ua: UA.ipadOs, maxTouchPoints: 5 })).toBe('ios');
    expect(installButtonMode({ ...base, ua: UA.iphoneChrome })).toBe('ios-other');
    expect(installButtonMode({ ...base, ua: UA.iphoneTelegram })).toBe('ios-other');
  });
});
