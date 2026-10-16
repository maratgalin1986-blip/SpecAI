import { describe, expect, it } from 'vitest';
import {
  addressFromDescription,
  appendOrders,
  categoryIcon,
  distanceKm,
  formatDistance,
  houseFirstBids,
  pointAddress,
  monthIncome,
  orderDays,
  orderStage,
  priceByRate,
  quickOrderDescription,
  relativeDay,
  stageHeadline,
} from './orderFlow';

describe('houseFirstBids', () => {
  it('puts the СпецПласт16 bid first and keeps the price order of the rest', () => {
    type Row = { id: string; equipment?: { company: { id: string } } };
    const bid = (id: string, company: string): Row => ({
      id,
      equipment: { company: { id: company } },
    });
    const sorted = houseFirstBids<Row>([
      bid('a', 'c1'),
      bid('b', 'c2'),
      bid('h', 'specplast16-house'),
      { id: 'x' },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['h', 'a', 'b', 'x']);
  });

  it('puts a declined house bid after the live ones', () => {
    type Row = { id: string; status: string; equipment: { company: { id: string } } };
    const sorted = houseFirstBids<Row>([
      { id: 'h', status: 'REJECTED', equipment: { company: { id: 'specplast16-house' } } },
      { id: 'a', status: 'PENDING', equipment: { company: { id: 'c1' } } },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'h']);
  });
});

describe('categoryIcon', () => {
  it('maps machine types to icons', () => {
    expect(categoryIcon('Экскаваторы-погрузчики')).toBe('🚜');
    expect(categoryIcon('Автокраны')).toBe('🏗️');
    expect(categoryIcon('Самосвалы')).toBe('🚛');
    expect(categoryIcon('Автовышки')).toBe('🪜');
    expect(categoryIcon('Что-то новое')).toBe('🛠️');
    expect(categoryIcon(null)).toBe('🛠️');
  });

  it('prefers the emoji the server sends with the category', () => {
    expect(categoryIcon('Дизельные генераторы', '⚡')).toBe('⚡');
    expect(categoryIcon('Автокраны', null)).toBe('🏗️');
  });
});

describe('orderStage', () => {
  it('walks the ride-like timeline', () => {
    expect(orderStage({ orderStatus: 'OPEN', bidCount: 0 })).toEqual({
      index: 0,
      cancelled: false,
    });
    expect(orderStage({ orderStatus: 'OPEN', bidCount: 2 }).index).toBe(1);
    expect(orderStage({ orderStatus: 'MATCHED', bidCount: 2 }).index).toBe(2);
    expect(
      orderStage({ orderStatus: 'MATCHED', bidCount: 2, bookingStatus: 'CONFIRMED' }).index,
    ).toBe(2);
    expect(orderStage({ orderStatus: 'MATCHED', bidCount: 2, bookingStatus: 'ACTIVE' }).index).toBe(
      3,
    );
    expect(
      orderStage({ orderStatus: 'MATCHED', bidCount: 1, bookingStatus: 'COMPLETED' }).index,
    ).toBe(4);
  });

  it('flags cancellation by the order or the booking', () => {
    expect(orderStage({ orderStatus: 'CANCELLED', bidCount: 0 }).cancelled).toBe(true);
    expect(
      orderStage({ orderStatus: 'MATCHED', bidCount: 1, bookingStatus: 'CANCELLED' }).cancelled,
    ).toBe(true);
    expect(stageHeadline({ orderStatus: 'CANCELLED', bidCount: 0 })).toBe('Заказ отменён');
    expect(stageHeadline({ orderStatus: 'OPEN', bidCount: 0 })).toBe('Ищем исполнителей');
  });
});

describe('quick order', () => {
  it('keeps the address out of the description and reads old address lines', () => {
    const text = quickOrderDescription({
      categoryName: 'Автокран',
      address: 'Набережные Челны, пр. Мира 10',
      urgent: true,
      days: 1,
    });
    expect(text).toBe('Нужна техника: автокран — сегодня, как можно скорее, на 1 смену.');
    expect(addressFromDescription('Нужен кран\nАдрес: Набережные Челны, пр. Мира 10')).toBe(
      'Набережные Челны, пр. Мира 10',
    );
    expect(addressFromDescription('Просто текст')).toBeNull();
  });

  it('falls back to a generic machine and keeps the note', () => {
    expect(quickOrderDescription({ urgent: false, days: 3, note: 'траншея 20 м' })).toBe(
      'Нужна спецтехника, на 3 дн.\nтраншея 20 м',
    );
  });
});

describe('dates and money', () => {
  it('counts order days inclusively', () => {
    expect(orderDays('2026-10-02', '2026-10-02')).toBe(1);
    expect(orderDays('2026-10-02', '2026-10-04')).toBe(3);
    expect(orderDays('2026-10-04', '2026-10-02')).toBe(1);
  });

  it('labels today and tomorrow', () => {
    const now = new Date(2026, 9, 2, 10);
    expect(relativeDay(new Date(2026, 9, 2, 18), now)).toBe('Сегодня');
    expect(relativeDay(new Date(2026, 9, 3), now)).toBe('Завтра');
    expect(relativeDay(new Date(2026, 9, 15), now)).toBe('15.10');
  });

  it('sums confirmed bookings of the current month', () => {
    const now = new Date(2026, 9, 15);
    const bookings = [
      { status: 'COMPLETED', startDate: new Date(2026, 9, 1).toISOString(), totalPrice: '20000' },
      { status: 'ACTIVE', startDate: new Date(2026, 9, 10).toISOString(), totalPrice: 5000 },
      { status: 'PENDING', startDate: new Date(2026, 9, 10).toISOString(), totalPrice: 9999 },
      { status: 'COMPLETED', startDate: new Date(2026, 8, 30).toISOString(), totalPrice: 7000 },
    ];
    expect(monthIncome(bookings, now)).toBe(25000);
  });

  it('prices by the shift rate', () => {
    expect(priceByRate('20000.00', 2)).toBe(40000);
    expect(priceByRate(0, 2)).toBe(0);
  });

  it('measures distance', () => {
    const chelny = { lat: 55.7436, lon: 52.3958 };
    const kazan = { lat: 55.7963, lon: 49.1088 };
    const km = distanceKm(chelny, kazan);
    expect(km).toBeGreaterThan(200);
    expect(km).toBeLessThan(215);
    expect(formatDistance(0.42)).toBe('400 м');
    expect(formatDistance(3.25)).toBe('3,3 км');
    expect(formatDistance(km)).toMatch(/^\d+ км$/);
  });
});

describe('pointAddress', () => {
  it('writes a map point the server reads as coordinates', () => {
    expect(pointAddress({ lat: 55.743123, lon: 52.398111 })).toBe(
      'Точка на карте: 55.74312, 52.39811',
    );
  });

  describe('appendOrders', () => {
    it('adds the next page without duplicates', () => {
      const merged = appendOrders([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
      expect(merged.map((order) => order.id)).toEqual(['a', 'b', 'c']);
    });

    it('keeps the first page as is when the next one is empty', () => {
      expect(appendOrders([{ id: 'a' }], [])).toEqual([{ id: 'a' }]);
    });
  });
});
