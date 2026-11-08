import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SITE_URL,
  orderShareLink,
  orderShareMessage,
  orderShareText,
  shareBaseUrl,
  shareCity,
  shareDate,
} from './orderShare';

// 20 октября по Москве (00:00 МСК = 21:00 UTC накануне).
const START = '2026-10-19T21:00:00.000Z';

describe('orderShare', () => {
  it('текст: вид техники, город и дата — и больше ничего', () => {
    expect(
      orderShareText({ categoryName: 'Автокраны', city: 'Елабуга', desiredStartDate: START }),
    ).toBe('Помогите найти технику: автокраны · Елабуга · 20 октября');
    expect(
      orderShareText({
        categoryName: 'Самосвалы',
        city: 'Казань, ул. Баумана 15, кв. 3',
        desiredStartDate: START,
      }),
    ).toBe('Помогите найти технику: самосвалы · Казань · 20 октября');
    expect(
      orderShareText({ categoryName: null, city: 'ул. Мира 5', desiredStartDate: START }),
    ).toBe('Помогите найти технику: спецтехника · 20 октября');
  });

  it('город: улица, село и цифры не проходят', () => {
    expect(shareCity('г. Казань')).toBe('Казань');
    expect(shareCity('деревня Малые Дербышки')).toBeNull();
    expect(shareCity('Москва 123')).toBeNull();
    expect(shareCity(undefined)).toBeNull();
  });

  it('дата по Москве; битая дата пропускается', () => {
    expect(shareDate(START)).toBe('20 октября');
    expect(shareDate('2026-10-20T20:59:00Z')).toBe('20 октября');
    expect(shareDate('not a date')).toBeNull();
  });

  it('ссылка — на сайт, с метками; локальный адрес API заменяется боевым', () => {
    expect(shareBaseUrl('http://localhost:3000')).toBe(PRODUCTION_SITE_URL);
    expect(shareBaseUrl('https://preview.example.app/')).toBe('https://preview.example.app');
    expect(orderShareLink(PRODUCTION_SITE_URL, 'abc')).toBe(
      `${PRODUCTION_SITE_URL}/orders/abc?utm_source=app&utm_medium=share`,
    );
    expect(
      orderShareMessage(
        { id: 'abc', categoryName: 'Автокраны', city: 'Елабуга', desiredStartDate: START },
        'http://192.168.1.5:3000',
      ),
    ).toBe(
      'Помогите найти технику: автокраны · Елабуга · 20 октября. ' +
        'Заявка на ИИСтройка24: бесплатно и без посредников\n' +
        `${PRODUCTION_SITE_URL}/orders/abc?utm_source=app&utm_medium=share`,
    );
  });
});
