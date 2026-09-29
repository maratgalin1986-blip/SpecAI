import { describe, expect, it } from 'vitest';
import { channelFrom, DIRECT, formLabel, goalOfHref, splitSource, withChannel } from './marketing';

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
