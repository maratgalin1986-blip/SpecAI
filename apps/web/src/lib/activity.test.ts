import { describe, expect, it } from 'vitest';
import {
  activityDayStart,
  activityEvents,
  activitySummary,
  buildActivity,
  categoryWord,
  lineEventText,
  onlineCount,
  publicCity,
  type ActivityBookingRow,
  type ActivityLineRow,
  type ActivityOrderRow,
} from './activity';
import { HOUSE_COMPANY_ID } from './fleet';

// 12:00 in Moscow on 17 October.
const now = new Date('2026-10-17T09:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

const order = (over: Partial<ActivityOrderRow> = {}): ActivityOrderRow => ({
  createdAt: minutesAgo(12),
  status: 'OPEN',
  source: 'SITE',
  category: { name: 'Самосвалы' },
  location: { city: 'Елабуга', latitude: null, longitude: null },
  ...over,
});

const line = (over: Partial<ActivityLineRow> = {}): ActivityLineRow => ({
  online: true,
  onlineSince: minutesAgo(5),
  updatedAt: minutesAgo(1),
  lat: 55.74,
  lon: 52.4,
  companyId: 'c-other',
  equipment: { id: 'e1', status: 'AVAILABLE', category: { name: 'Экскаваторы' } },
  ...over,
});

const booking = (over: Partial<ActivityBookingRow> = {}): ActivityBookingRow => ({
  status: 'CONFIRMED',
  confirmedAt: minutesAgo(30),
  equipment: { companyId: 'c-other', category: { name: 'Автокраны' } },
  ...over,
});

describe('event lines', () => {
  it('reads category, city and a relative time, newest first', () => {
    const events = activityEvents(
      { orders: [order()], line: [line()], bookings: [booking()] },
      now,
    );
    expect(events.map((event) => `${event.text} · ${event.ago}`)).toEqual([
      'Машина вышла на линию: экскаваторы · Набережные Челны · 5 мин назад',
      'Новая заявка: самосвалы, Елабуга · 12 мин назад',
      'Бронь подтверждена: автокраны · 30 мин назад',
    ]);
  });

  it('names only СпецПласт16 among companies', () => {
    const events = activityEvents(
      {
        orders: [],
        line: [line({ companyId: HOUSE_COMPANY_ID })],
        bookings: [
          booking({ equipment: { companyId: HOUSE_COMPANY_ID, category: { name: 'Автокраны' } } }),
        ],
      },
      now,
    );
    expect(events.map((event) => event.text)).toEqual([
      'Машина СпецПласт16 вышла на линию: экскаваторы · Набережные Челны',
      'Бронь подтверждена: автокраны · парк СпецПласт16',
    ]);
  });

  it('marks chat imports and keeps their contacts, text and address out', () => {
    const chat = {
      ...order({
        source: 'TELEGRAM',
        location: { city: 'Елабуга, ул. Окружное шоссе 12, кв 5', latitude: null, longitude: null },
      }),
      // Extra fields a careless query might pass: never copied into a line.
      contactName: 'Иван Петров',
      contactPhone: '+7 917 123-45-67',
      description: 'Нужен самосвал, звонить Ивану 89171234567',
      customer: { id: 'user-id-1', name: 'Иван Петров' },
    };
    const [event] = activityEvents({ orders: [chat], line: [], bookings: [] }, now);
    expect(event?.text).toBe('Новая заявка из чата: самосвалы, Елабуга');
    const json = JSON.stringify(
      buildActivity(
        { orders: 1, online: 0, confirmed: 0 },
        { orders: [chat], line: [], bookings: [] },
        now,
      ),
    );
    for (const secret of [
      'Иван',
      'Петров',
      '917',
      '89171234567',
      'Окружное',
      'user-id-1',
      'кв 5',
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it('names any city of Russia, from the list or from the geocoder', () => {
    expect(publicCity({ city: 'Самара' })).toBe('Самара');
    expect(publicCity({ city: 'в Екатеринбурге, ул. Ленина 5' })).toBe('Екатеринбург');
    // A geocoded place: its city came from the geocoder, a small town is fine.
    expect(publicCity({ city: 'Бавлы', latitude: 54.4, longitude: 53.25 })).toBe('Бавлы');
    // Without coordinates the same word is the visitor's text: not shown.
    expect(publicCity({ city: 'Бавлы' })).toBeNull();
    // Even geocoded, anything but a plain name falls back to the nearest city.
    expect(publicCity({ city: 'Самара, ул. Ленина 5', latitude: 53.2, longitude: 50.1 })).toBe(
      'Самара',
    );
    expect(publicCity({ city: 'Дом 5', latitude: 53.2, longitude: 50.1 })).toBe('Самара');
    expect(publicCity({ city: 'дом +7 917', latitude: 60, longitude: 100 })).toBeNull();
    // A machine on the line far from Tatarstan gets its own city.
    expect(
      lineEventText({
        online: true,
        onlineSince: now,
        updatedAt: now,
        lat: 56.84,
        lon: 60.6,
        companyId: 'other',
        equipment: { id: 'e', status: 'AVAILABLE', category: { name: 'Экскаваторы' } },
      }),
    ).toBe('Машина вышла на линию: экскаваторы · Екатеринбург');
  });

  it('shows an unknown place as nothing rather than as the raw text', () => {
    expect(publicCity({ city: 'СНТ Ромашка, участок 14' })).toBeNull();
    expect(publicCity({ city: null, latitude: 55.757, longitude: 52.06 })).toBe('Елабуга');
    expect(publicCity({ city: 'г. Казань, ул. Баумана 1' })).toBe('Казань');
    const [event] = activityEvents(
      {
        orders: [
          order({
            category: null,
            location: { city: 'СНТ Ромашка', latitude: null, longitude: null },
          }),
        ],
        line: [],
        bookings: [],
      },
      now,
    );
    expect(event?.text).toBe('Новая заявка');
  });

  it('leaves out orders under review, cancelled or erased ones and stale or unconfirmed rows', () => {
    const events = activityEvents(
      {
        orders: [
          order({ status: 'PENDING_REVIEW' }),
          order({ status: 'CANCELLED' }),
          order({ createdAt: new Date(now.getTime() - 8 * 86_400_000) }),
        ],
        line: [
          line({ online: false }),
          line({ updatedAt: minutesAgo(20) }),
          line({ equipment: { id: 'e2', status: 'RENTED', category: null } }),
          line({ onlineSince: null }),
        ],
        bookings: [
          booking({ status: 'PENDING' }),
          booking({ status: 'CANCELLED' }),
          booking({ confirmedAt: null }),
        ],
      },
      now,
    );
    expect(events).toEqual([]);
  });

  it('keeps at most eight events and one per machine on the line', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      order({ createdAt: minutesAgo(index + 1) }),
    );
    expect(activityEvents({ orders: many, line: [], bookings: [] }, now)).toHaveLength(8);
    const twice = activityEvents(
      { orders: [], line: [line(), line({ onlineSince: minutesAgo(9) })], bookings: [] },
      now,
    );
    expect(twice).toHaveLength(1);
  });
});

describe('counters', () => {
  it('starts «сегодня» at Moscow midnight, not the server clock', () => {
    // 23:30 UTC on the 16th is already 02:30 on the 17th in Moscow.
    expect(activityDayStart(new Date('2026-10-16T23:30:00Z')).toISOString()).toBe(
      '2026-10-16T21:00:00.000Z',
    );
    expect(activityDayStart(now).toISOString()).toBe('2026-10-16T21:00:00.000Z');
  });

  it('counts each live machine once', () => {
    expect(
      onlineCount(
        [
          line(),
          line({ updatedAt: minutesAgo(3) }),
          line({ equipment: { id: 'e9', status: 'AVAILABLE', category: null } }),
          line({ online: false, equipment: { id: 'e3', status: 'AVAILABLE', category: null } }),
        ],
        now,
      ),
    ).toBe(2);
  });

  it('says the real numbers and a neutral line at zero', () => {
    expect(activitySummary({ orders: 14, online: 3, confirmed: 0 })).toBe(
      'Сегодня: 14 заявок · 3 машины на линии',
    );
    expect(activitySummary({ orders: 1, online: 0, confirmed: 2 })).toBe(
      'Сегодня: 1 заявка · 2 брони подтверждены',
    );
    expect(activitySummary({ orders: 0, online: 0, confirmed: 0 })).toBe(
      'Сегодня новых заявок пока нет',
    );
  });
});

describe('categoryWord', () => {
  it('lower-cases a word, keeps an abbreviation', () => {
    expect(categoryWord('Самосвалы')).toBe('самосвалы');
    expect(categoryWord('КМУ')).toBe('КМУ');
    expect(categoryWord('  ')).toBeNull();
  });
});
