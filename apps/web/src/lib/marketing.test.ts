import { describe, expect, it, vi } from 'vitest';
import {
  channelFrom,
  DIRECT,
  enableWebvisorIfQueued,
  formLabel,
  goalOfHref,
  splitSource,
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

function queuedYm() {
  const ym = Object.assign(vi.fn(), { a: [] as unknown[][] });
  ym.a.push([1, 'init', { webvisor: false }], [1, 'reachGoal', 'lead']);
  return ym;
}

describe('cookie choice and the Metrika queue', () => {
  it('«Нет» drops queued calls, blocks the loader and silences later calls', () => {
    const ym = queuedYm();
    const win: { ym?: typeof ym; __ymOff?: boolean } = { ym };
    stopMetrika(win);
    expect(ym.a).toHaveLength(0);
    expect(win.__ymOff).toBe(true);
    expect(win.ym).not.toBe(ym);
    win.ym?.(1, 'reachGoal', 'call');
    expect(ym).not.toHaveBeenCalled();
  });

  it('«OK» before tag.js loads switches Webvisor on in the queued init', () => {
    const ym = queuedYm();
    enableWebvisorIfQueued({ ym });
    expect(ym.a[0]?.[2]).toEqual({ webvisor: true });
    expect(ym.a[1]).toEqual([1, 'reachGoal', 'lead']);
  });

  it('does nothing without a counter', () => {
    expect(() => stopMetrika({})).not.toThrow();
    expect(() => enableWebvisorIfQueued({})).not.toThrow();
  });
});
