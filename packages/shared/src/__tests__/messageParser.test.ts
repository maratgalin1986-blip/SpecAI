import { describe, expect, it } from 'vitest';
import { extractPhone, parseEquipmentRequest, requestFingerprint } from '../messageParser';

const NOW = new Date(2026, 8, 27, 10, 0, 0); // 27 Sep 2026

describe('parseEquipmentRequest', () => {
  it('recognises a typical request from a chat', () => {
    const r = parseEquipmentRequest(
      'Нужен экскаватор-погрузчик JCB завтра в Челнах, траншея 30 м. 8 927 111-22-33',
      NOW,
    );
    expect(r.isRequest).toBe(true);
    expect(r.categorySlug).toBe('backhoe-loaders');
    expect(r.city).toBe('Набережные Челны');
    expect(r.phone).toBe('+79271112233');
    expect(r.startDate.getDate()).toBe(28);
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('ignores providers advertising their machines', () => {
    const r = parseEquipmentRequest(
      'Сдаю в аренду экскаватор-погрузчик JCB 4CX, 1500 руб/час, работаем по Челнам. Звоните!',
      NOW,
    );
    expect(r.isRequest).toBe(false);
  });

  it('ignores chatter without equipment', () => {
    expect(parseEquipmentRequest('Всем привет, кто завтра на объект?', NOW).isRequest).toBe(false);
  });

  it('parses date ranges and durations', () => {
    const range = parseEquipmentRequest('Требуется автокран 25 т с 5 по 7 октября, Елабуга', NOW);
    expect(range.isRequest).toBe(true);
    expect(range.categorySlug).toBe('cranes');
    expect(range.city).toBe('Елабуга');
    expect([range.startDate.getMonth(), range.startDate.getDate()]).toEqual([9, 5]);
    expect([range.endDate.getMonth(), range.endDate.getDate()]).toEqual([9, 7]);

    const duration = parseEquipmentRequest('Ищу самосвал на 3 дня, срочно, Нижнекамск', NOW);
    expect(duration.categorySlug).toBe('dump-trucks');
    const days = (duration.endDate.getTime() - duration.startDate.getTime()) / 86_400_000;
    expect(days).toBe(3);
  });

  it('detects the manipulator crane before the generic crane', () => {
    const r = parseEquipmentRequest('Нужен манипулятор перевезти блок, Челны', NOW);
    expect(r.categorySlug).toBe('crane-trucks');
  });
});

describe('extractPhone / requestFingerprint', () => {
  it('normalises phone formats', () => {
    expect(extractPhone('+7 (927) 242-80-88')).toBe('+79272428088');
    expect(extractPhone('89272428088')).toBe('+79272428088');
    expect(extractPhone('без телефона')).toBeUndefined();
  });

  it('gives the same fingerprint to reposts with different phone formatting', () => {
    expect(requestFingerprint('Нужен кран! 8 927 111 22 33')).toBe(
      requestFingerprint('нужен  кран  +7(927)111-22-33'),
    );
  });
});
