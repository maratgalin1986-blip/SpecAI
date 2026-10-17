import { describe, expect, it } from 'vitest';
import {
  GENERIC_NEED,
  cleanCityName,
  orderCardCity,
  orderCardDate,
  orderCardText,
  orderNeed,
  orderOgText,
  orderShareText,
  orderShareUrl,
} from './orderCard';

const BRAND = 'ИИСтройка24 от СпецПласт16';
// 20 October in Moscow (00:00 MSK is 21:00 UTC the day before).
const START = new Date('2026-10-19T21:00:00Z');

describe('orderNeed', () => {
  it('turns a plural category into one machine', () => {
    expect(orderNeed('Экскаваторы-погрузчики')).toBe('Нужен экскаватор-погрузчик');
    expect(orderNeed('Экскаваторы гусеничные')).toBe('Нужен экскаватор');
    expect(orderNeed('Мини-экскаваторы')).toBe('Нужен мини-экскаватор');
    expect(orderNeed('Автовышки (АГП)')).toBe('Нужна автовышка');
    expect(orderNeed('Краны-манипуляторы (КМУ)')).toBe('Нужен кран-манипулятор');
    expect(orderNeed('Самосвалы')).toBe('Нужен самосвал');
  });

  it('falls back to the generic phrase', () => {
    expect(orderNeed('Бытовки и блок-контейнеры')).toBe(GENERIC_NEED);
    expect(orderNeed(null)).toBe(GENERIC_NEED);
    expect(orderNeed('  ')).toBe(GENERIC_NEED);
  });
});

describe('cleanCityName', () => {
  it('keeps a plain city name', () => {
    expect(cleanCityName('Елабуга')).toBe('Елабуга');
    expect(cleanCityName('г. Казань')).toBe('Казань');
    expect(cleanCityName('г.Москва')).toBe('Москва');
    expect(cleanCityName('Ростов-на-Дону')).toBe('Ростов-на-Дону');
    expect(cleanCityName('Набережные Челны, ул. Мира 5')).toBe('Набережные Челны');
  });

  it('never returns a street, a house, a village or a district', () => {
    expect(cleanCityName('ул. Ленина 5')).toBeNull();
    expect(cleanCityName('улица Ленина')).toBeNull();
    expect(cleanCityName('деревня Малые Дербышки')).toBeNull();
    expect(cleanCityName('с. Ташлык')).toBeNull();
    expect(cleanCityName('Тукаевский район')).toBeNull();
    expect(cleanCityName('СНТ Строитель')).toBeNull();
    expect(cleanCityName('Москва 123')).toBeNull();
    expect(cleanCityName('+7 927 000-00-00')).toBeNull();
    expect(cleanCityName('ivan@example.com')).toBeNull();
    expect(cleanCityName('')).toBeNull();
    expect(cleanCityName(null)).toBeNull();
  });
});

describe('orderCardCity', () => {
  it('prefers a known city found in the place, else a clean name', () => {
    expect(orderCardCity({ city: 'Елабуга, Окружное шоссе 1' })).toBe('Елабуга');
    expect(orderCardCity({ city: 'Екатеринбург' })).toBe('Екатеринбург');
    expect(orderCardCity({ city: 'ул. Мира 12' })).toBeNull();
    expect(orderCardCity(null)).toBeNull();
  });
});

describe('orderCardText', () => {
  it('builds «Нужен … · город · дата» from the Moscow day', () => {
    expect(orderCardDate(START)).toBe('20 октября');
    const text = orderCardText({
      categoryName: 'Экскаваторы гусеничные',
      location: { city: 'Елабуга' },
      desiredStartDate: START,
    });
    expect(text.line).toBe('Нужен экскаватор · Елабуга · 20 октября');
    expect(text.category).toBeNull();
  });

  it('names the category under the generic phrase and skips an unknown city', () => {
    const text = orderCardText({
      categoryName: 'Бытовки и блок-контейнеры',
      location: { city: 'ул. Мира 12' },
      desiredStartDate: START,
    });
    expect(text.need).toBe(GENERIC_NEED);
    expect(text.category).toBe('Бытовки и блок-контейнеры');
    expect(text.line).toBe('Нужна спецтехника: бытовки и блок-контейнеры · 20 октября');
  });
});

describe('orderShareText and orderShareUrl', () => {
  it('asks for help with the kind, city and date only', () => {
    expect(
      orderShareText({
        categoryName: 'Автокраны',
        location: { city: 'Елабуга' },
        desiredStartDate: START,
      }),
    ).toBe('Помогите найти технику: нужен автокран · Елабуга · 20 октября');
  });

  it('tags the link for the source', () => {
    expect(orderShareUrl('https://spec-ai-web.vercel.app', 'abc', 'telegram', 'channel')).toBe(
      'https://spec-ai-web.vercel.app/orders/abc?utm_source=telegram&utm_medium=channel',
    );
  });
});

describe('orderOgText', () => {
  it('shows the kind, the city, the day, the status and the brand', () => {
    const og = orderOgText(
      {
        status: 'OPEN',
        categoryName: 'Экскаваторы гусеничные',
        location: { city: 'Елабуга' },
        desiredStartDate: START,
      },
      BRAND,
    );
    expect(og).toMatchObject({
      title: 'Нужен экскаватор',
      subtitle: null,
      details: 'Елабуга · 20 октября',
      status: 'Ждёт предложений',
      brand: BRAND,
    });
  });

  it('carries nothing personal even when the place holds an address', () => {
    const og = orderOgText(
      {
        status: 'MATCHED',
        categoryName: 'Самосвалы',
        location: { city: 'Казань, ул. Баумана 15, кв. 3' },
        desiredStartDate: START,
      },
      BRAND,
    );
    const all = Object.values(og).join(' ');
    expect(all).not.toMatch(/Баумана|15|кв/);
    expect(og.details).toBe('Казань · 20 октября');
    expect(og.status).toBe('Исполнитель выбран');
  });

  it('gives a missing or hidden order the generic card', () => {
    const hidden = orderOgText(
      {
        status: 'PENDING_REVIEW',
        categoryName: 'Самосвалы',
        location: { city: 'Казань' },
        desiredStartDate: START,
      },
      BRAND,
    );
    expect(hidden.details).toBeNull();
    expect(hidden.status).toBeNull();
    expect(Object.values(hidden).join(' ')).not.toMatch(/Казань|самосвал/i);
    expect(orderOgText(null, BRAND).title).toBe('Нужна спецтехника?');
  });
});
