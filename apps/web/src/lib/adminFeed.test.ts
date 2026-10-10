import { describe, expect, it } from 'vitest';
import {
  bidEvents,
  bookingEvents,
  clipText,
  documentEvents,
  feedKey,
  feedMoment,
  leadEvents,
  orderEvents,
  parseFeedTab,
  providerEvents,
  sortFeed,
  splitFeed,
  unreadCount,
  type FeedEvent,
} from './adminFeed';

const NOW = new Date('2026-10-10T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

describe('feed keys and ordering', () => {
  it('builds keys from the kind, the id and an optional state', () => {
    expect(feedKey('order', 'o1')).toBe('order:o1');
    expect(feedKey('booking', 'b1', 'CONFIRMED')).toBe('booking:b1:CONFIRMED');
  });

  it('sorts newest first and splits by read keys', () => {
    const events = [
      ...orderEvents([
        {
          id: 'o1',
          status: 'OPEN',
          description: 'Экскаватор',
          createdAt: hoursAgo(5),
          source: 'SITE',
        },
        { id: 'o2', status: 'OPEN', description: 'Кран', createdAt: hoursAgo(1), source: 'SITE' },
      ]),
      ...bookingEvents([
        {
          id: 'b1',
          status: 'CONFIRMED',
          updatedAt: hoursAgo(3),
          equipmentName: 'JCB 4CX',
          companyName: 'Альфа',
          orderId: 'o1',
        },
      ]),
    ];
    const sorted = sortFeed(events);
    expect(sorted.map((event) => event.key)).toEqual([
      'order:o2',
      'booking:b1:CONFIRMED',
      'order:o1',
    ]);
    const read = new Set(['order:o1']);
    const split = splitFeed(sorted, read);
    expect(split.unread.map((event) => event.key)).toEqual(['order:o2', 'booking:b1:CONFIRMED']);
    expect(split.read.map((event) => event.key)).toEqual(['order:o1']);
    expect(unreadCount(sorted, read)).toBe(2);
  });

  it('reads the tab from the query string', () => {
    expect(parseFeedTab(undefined)).toBe('unread');
    expect(parseFeedTab('read')).toBe('read');
    expect(parseFeedTab(['all'])).toBe('all');
    expect(parseFeedTab('x')).toBe('unread');
  });
});

describe('builders', () => {
  it('tells chat imports under review apart from published orders', () => {
    const [review, open] = orderEvents([
      {
        id: 'r1',
        status: 'PENDING_REVIEW',
        description: 'Нужен самосвал  завтра',
        createdAt: hoursAgo(2),
        source: 'TELEGRAM',
        city: 'Казань',
      },
      {
        id: 'o1',
        status: 'OPEN',
        description: 'Экскаватор',
        createdAt: hoursAgo(1),
        source: 'WHATSAPP',
        categoryName: 'Экскаваторы',
      },
    ]) as [FeedEvent, FeedEvent];
    expect(review.kind).toBe('order_review');
    expect(review.title).toBe('Заявка из чата ждёт проверки: Казань');
    expect(review.text).toBe('Telegram · Нужен самосвал завтра');
    expect(review.href).toBe('/admin');
    expect(open.kind).toBe('order');
    expect(open.title).toBe('Новая заявка: Экскаваторы');
    expect(open.text).toBe('WhatsApp · Экскаватор');
    expect(open.href).toBe('/orders/o1');
  });

  it('describes bids, bookings, providers and leads', () => {
    const [bid] = bidEvents([
      {
        id: 'bid1',
        createdAt: hoursAgo(1),
        price: '12 000 ₽',
        orderId: 'o1',
        equipmentName: 'JCB 4CX',
        companyName: 'Альфа',
      },
    ]);
    expect(bid!.title).toBe('Предложение: Альфа');
    expect(bid!.href).toBe('/orders/o1#offers');

    const statuses = ['PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
    const bookings = bookingEvents(
      statuses.map((status) => ({
        id: 'b',
        status,
        updatedAt: hoursAgo(1),
        equipmentName: 'JCB',
        companyName: 'Альфа',
        orderId: null,
      })),
    );
    expect(bookings.map((event) => event.key)).toEqual(statuses.map((s) => `booking:b:${s}`));
    expect(bookings.map((event) => event.tone)).toEqual([
      'amber',
      'graphite',
      'signal',
      'green',
      'red',
    ]);
    expect(bookings[3]!.title).toBe('Заказ завершён');
    expect(bookings[0]!.href).toBe('/admin');

    const [provider] = providerEvents([
      { id: 'c1', name: 'Бета', createdAt: hoursAgo(1), machines: 0, taxId: null },
    ]);
    expect(provider!.title).toBe('Новый исполнитель: Бета');
    expect(provider!.text).toBe('ИНН не указан · техника не добавлена');
    expect(provider!.href).toBe('/providers/c1');

    const [lead] = leadEvents([
      { id: 'l1', createdAt: hoursAgo(1), name: 'Иван', phone: '+7 900 000-00-00', message: null },
    ]);
    expect(lead!.title).toBe('Заявка на звонок: Иван');
    expect(lead!.text).toBe('+7 900 000-00-00');
  });

  it('lists only expired documents, dated by the expiry day', () => {
    const events = documentEvents(
      [
        {
          id: 'd1',
          kind: 'STS',
          number: '16 АА 123456',
          expiresAt: new Date('2026-10-01T00:00:00Z'),
          companyId: 'c1',
          companyName: 'Альфа',
          equipmentName: 'JCB 4CX',
        },
        {
          id: 'd2',
          kind: 'OSAGO',
          expiresAt: new Date('2026-10-20T00:00:00Z'),
          companyId: 'c1',
          companyName: 'Альфа',
        },
        { id: 'd3', kind: 'OTHER', expiresAt: null, companyId: 'c1', companyName: 'Альфа' },
      ],
      NOW,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.key).toBe('document:d1:expired');
    expect(events[0]!.title).toBe('Документ истёк: СТС № 16 АА 123456');
    expect(events[0]!.text).toBe('Альфа · JCB 4CX');
    expect(events[0]!.at).toBe('2026-10-01T00:00:00.000Z');
    expect(events[0]!.tone).toBe('red');
  });

  it('clips long texts and formats moments in Moscow time', () => {
    expect(clipText('  a   b  ')).toBe('a b');
    expect(clipText('x'.repeat(200), 20)).toHaveLength(20);
    expect(clipText('x'.repeat(200), 20).endsWith('…')).toBe(true);
    expect(feedMoment(hoursAgo(2).toISOString(), NOW)).toBe('сегодня 13:00');
    expect(feedMoment(hoursAgo(26).toISOString(), NOW)).toBe('вчера 13:00');
    expect(feedMoment('2026-09-01T07:05:00Z', NOW)).toBe('01.09 10:05');
  });
});
