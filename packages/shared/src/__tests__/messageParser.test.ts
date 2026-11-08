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

describe('parseEquipmentRequest: more machine types from chats', () => {
  it.each([
    ['Нужен трал перевезти экскаватор 20 т из Челнов в Елабугу', 'lowboys'],
    ['Требуется ямобур под сваи, 12 отверстий, завтра', 'augers'],
    ['Ищу грейдер на 2 смены, планировка площадки, Нижнекамск', 'graders'],
    ['Нужен каток 10 т на асфальт в субботу', 'rollers'],
    ['Требуется манипулятор 5 т перевезти блоки, срочно', 'crane-trucks'],
    ['Нужна автовышка 22 м на 4 часа', 'aerial-platforms'],
    ['Ищем бульдозер на расчистку участка', 'bulldozers'],
    ['Нужен фронтальный погрузчик чистить снег', 'loaders'],
  ])('«%s» → %s', (text, slug) => {
    const r = parseEquipmentRequest(text, NOW);
    expect(r.isRequest).toBe(true);
    expect(r.categorySlug).toBe(slug);
  });

  it('treats «арендую» / «арендовать» as a request', () => {
    expect(parseEquipmentRequest('Арендую самосвал на неделю, Казань', NOW).isRequest).toBe(true);
    expect(
      parseEquipmentRequest('Хотим арендовать экскаватор с 5 по 7 октября', NOW).isRequest,
    ).toBe(true);
  });

  it('still ignores offers of the new types', () => {
    expect(
      parseEquipmentRequest('Сдаю грейдер и каток, 2500 руб/час, работаем по Татарстану', NOW)
        .isRequest,
    ).toBe(false);
    expect(parseEquipmentRequest('Услуги трала, недорого, в наличии', NOW).isRequest).toBe(false);
  });

  it('does not see a machine in «раскатка» and reads «бурильно-крановая» as a ямобур', () => {
    expect(parseEquipmentRequest('Нужна раскатка теста, ищу пекаря', NOW).categorySlug).toBe(
      undefined,
    );
    expect(
      parseEquipmentRequest('Нужна бурильно-крановая машина на завтра', NOW).categorySlug,
    ).toBe('augers');
  });

  it('extracts the phone that is later shown masked', () => {
    const r = parseEquipmentRequest('Нужен самосвал песок 10 куб, +7 (917) 123-45-67', NOW);
    expect(r.phone).toBe('+79171234567');
  });

  it('gives the same fingerprint to a repost with another phone', () => {
    expect(requestFingerprint('Нужен трал завтра! 89171234567')).toBe(
      requestFingerprint('нужен ТРАЛ завтра +7 927 000-11-22'),
    );
  });
});
