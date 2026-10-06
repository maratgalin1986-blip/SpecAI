import { describe, expect, it } from 'vitest';
import {
  channelFrom,
  COOKIE_SNOOZE_MS,
  cookieStripDue,
  DIRECT,
  formLabel,
  goalOfHref,
  metrikaInitScript,
  metrikaTagSrc,
  type MetrikaWindow,
  snoozeValue,
  splitSource,
  startMetrika,
  stopMetrika,
  withChannel,
} from './marketing';

const HOST = 'spec-ai-web.vercel.app';
const home = (query = '') => `https://${HOST}/${query}`;

describe('channelFrom', () => {
  it('prefers UTM tags', () => {
    expect(channelFrom(home('?utm_source=yandex&utm_medium=cpc&utm_campaign=kran'), '', HOST)).toBe(
      'yandex/cpc/kran',
    );
  });

  it('recognises ad click ids', () => {
    expect(channelFrom(home('?yclid=123'), '', HOST)).toBe('Яндекс Директ');
    expect(channelFrom(home('?gclid=abc'), '', HOST)).toBe('Google Ads');
  });

  it('names known referrers', () => {
    expect(channelFrom(home(), 'https://yandex.ru/search/?text=кран', HOST)).toBe('Яндекс поиск');
    expect(channelFrom(home(), 'https://2gis.ru/chelny/firm/1', HOST)).toBe('2ГИС');
    expect(channelFrom(home(), 'https://www.avito.ru/item', HOST)).toBe('Авито');
    expect(channelFrom(home(), 'https://some-blog.ru/post', HOST)).toBe('some-blog.ru');
  });

  it('treats direct visits and own pages as no channel', () => {
    expect(channelFrom(home(), '', HOST)).toBeNull();
    expect(channelFrom(home(), `https://${HOST}/equipment`, HOST)).toBeNull();
  });
});

describe('lead source', () => {
  it('round-trips the form and the channel within 100 characters', () => {
    const source = withChannel('wizard', 'Яндекс поиск');
    expect(splitSource(source)).toEqual({ form: 'wizard', channel: 'Яндекс поиск' });
    expect(withChannel('home', 'x'.repeat(200)).length).toBe(100);
  });

  it('reads old leads without a channel as direct', () => {
    expect(splitSource('home')).toEqual({ form: 'home', channel: DIRECT });
    expect(splitSource(null).channel).toBe(DIRECT);
  });
});

describe('goalOfHref', () => {
  it('maps contact links to Metrika goals', () => {
    expect(goalOfHref('tel:+79272428088')).toBe('call');
    expect(goalOfHref('https://wa.me/79272428088')).toBe('whatsapp');
    expect(goalOfHref('https://t.me/specplast16_zayavki_bot')).toBe('telegram');
    expect(goalOfHref('mailto:specplast16@mail.ru')).toBe('email');
    expect(goalOfHref('/equipment')).toBeNull();
  });
});

describe('formLabel', () => {
  it('names forms by kind, ignoring the machine id', () => {
    expect(formLabel('estimate:sp16-jcb-4cx')).toBe('Расчёт на странице техники');
    expect(formLabel('wizard')).toBe('Подбор техники');
    expect(formLabel('—')).toBe('Без отметки');
    expect(formLabel('something-new')).toBe('something-new');
  });
});

const ID = '113179760';
const SRC = metrikaTagSrc(ID);

/** A minimal document: records the scripts startMetrika inserts. */
function fakeDocument() {
  const inserted: { src: string; async: boolean }[] = [];
  const parentNode = {
    insertBefore: (node: { src: string; async: boolean }) => inserted.push(node),
  };
  const doc = {
    scripts: inserted as unknown as HTMLCollectionOf<HTMLScriptElement>,
    createElement: () => ({ src: '', async: false }),
    getElementsByTagName: () => [{ parentNode }],
    head: { appendChild: (node: { src: string; async: boolean }) => inserted.push(node) },
  };
  return { doc: doc as unknown as Parameters<typeof startMetrika>[1], inserted };
}

/** Runs the inline script of YandexMetrika in a fake page. */
function bootPage({
  consent = null as string | null,
  path = '/',
  ab = null as string | null,
}: { consent?: string | null; path?: string; ab?: string | null } = {}) {
  const win: MetrikaWindow & Record<string, unknown> = {};
  const storage = {
    getItem: (key: string) => (key === 'cookie-consent' ? consent : key === 'sp_ab' ? ab : null),
    setItem: () => {},
  };
  const location = { pathname: path, search: '?yclid=42', href: `https://${HOST}${path}?yclid=42` };
  const document = { referrer: 'https://yandex.ru/', cookie: '' };
  new Function('window', 'localStorage', 'location', 'document', metrikaInitScript(ID))(
    win,
    storage,
    location,
    document,
  );
  return win;
}

const calls = (win: MetrikaWindow) => (win.ym?.a ?? []).map((call) => Array.from(call));

describe('Metrika before consent', () => {
  it('only creates the queue: nothing is started or loaded', () => {
    const win = bootPage();
    expect(win.__ymStarted).toBeUndefined();
    expect(win.ym).toBeTypeOf('function');
    expect(calls(win)).toEqual([]);
    expect(win.__ymSrc).toBe(SRC);
    expect(win.__ymBoot?.[0]?.[1]).toBe('init');
  });

  it('buffers goals in memory without an init call', () => {
    const win = bootPage();
    win.ym?.(Number(ID), 'reachGoal', 'call');
    expect(calls(win)).toEqual([[Number(ID), 'reachGoal', 'call']]);
  });

  it('starts at once when consent is stored, with Webvisor and the landing url', () => {
    const win = bootPage({ consent: 'yes', ab: 'calm' });
    expect(win.__ymStarted).toBe(true);
    const [init, params] = calls(win);
    expect(init?.[1]).toBe('init');
    expect(init?.[2]).toMatchObject({
      webvisor: true,
      url: `https://${HOST}/?yclid=42`,
      referrer: 'https://yandex.ru/',
    });
    expect(params).toEqual([Number(ID), 'params', { ab: 'calm' }]);
  });

  it('a stored refusal creates no queue; the snoozed strip is no consent', () => {
    const refused = bootPage({ consent: 'no' });
    expect(refused.ym).toBeUndefined();
    expect(refused.__ymOff).toBe(true);
    const later = bootPage({ consent: snoozeValue() });
    expect(later.__ymStarted).toBeUndefined();
    expect(calls(later)).toEqual([]);
  });

  it('does nothing on /admin', () => {
    const win = bootPage({ consent: 'yes', path: '/admin/leads' });
    expect(win.ym).toBeUndefined();
    const { doc, inserted } = fakeDocument();
    expect(startMetrika(win, doc)).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

describe('startMetrika on consent', () => {
  it('puts init first, then the goals buffered earlier, and loads tag.js once', () => {
    const win = bootPage();
    win.ym?.(Number(ID), 'reachGoal', 'lead');
    const { doc, inserted } = fakeDocument();
    expect(startMetrika(win, doc)).toBe(true);
    const queued = calls(win);
    expect(queued.map((call) => call[1])).toEqual(['init', 'params', 'reachGoal']);
    expect(queued[0]?.[2]).toMatchObject({ webvisor: true });
    expect(inserted).toEqual([{ src: SRC, async: true }]);
    expect(win.__ymStarted).toBe(true);
    // A second press does nothing.
    expect(startMetrika(win, doc)).toBe(false);
    expect(inserted).toHaveLength(1);
    expect(calls(win).filter((call) => call[1] === 'init')).toHaveLength(1);
  });

  it('does not start where the counter is not rendered (dev, previews)', () => {
    const { doc, inserted } = fakeDocument();
    expect(startMetrika({}, doc)).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it('after a refusal, «Включить» starts again with a fresh queue', () => {
    const win = bootPage({ consent: 'no' });
    const { doc, inserted } = fakeDocument();
    expect(startMetrika(win, doc)).toBe(true);
    expect(win.__ymOff).toBe(false);
    expect(calls(win)[0]?.[1]).toBe('init');
    expect(inserted).toHaveLength(1);
  });
});

describe('stopMetrika', () => {
  it('drops queued calls, blocks the loader and silences later calls', () => {
    const win = bootPage({ consent: 'yes' });
    const ym = win.ym;
    stopMetrika(win);
    expect(win.__ymOff).toBe(true);
    expect(win.__ymStarted).toBe(false);
    expect(ym?.a).toHaveLength(0);
    expect(win.ym).not.toBe(ym);
    win.ym?.(1, 'reachGoal', 'call');
    expect(calls(win)).toEqual([]);
  });

  it('tells the caller to reload when tag.js already runs', () => {
    expect(stopMetrika({ Ya: {} })).toBe(true);
    expect(stopMetrika({})).toBe(false);
  });
});

describe('cookie strip', () => {
  const now = 1_800_000_000_000;
  it('shows until answered, hides for a week after ✕', () => {
    expect(cookieStripDue(null, now)).toBe(true);
    expect(cookieStripDue('hidden', now)).toBe(true);
    expect(cookieStripDue('yes', now)).toBe(false);
    expect(cookieStripDue('no', now)).toBe(false);
    expect(cookieStripDue(snoozeValue(now - 1000), now)).toBe(false);
    expect(cookieStripDue(snoozeValue(now - COOKIE_SNOOZE_MS), now)).toBe(true);
  });
});
