import { describe, expect, it } from 'vitest';
import { EMPTY_STATS, MIN_SAMPLE, cancelLabel, reliability, tallyBookings } from './reliability';

describe('reliability', () => {
  it('marks a company without history as new', () => {
    const value = reliability(EMPTY_STATS);
    expect(value.badges).toEqual(['Новый на сервисе']);
    expect(value.cancelShare).toBeNull();
    expect(value.rating).toBeNull();
    expect(value.recommends).toBeNull();
  });

  it('shows the verified mark first, then rating, completed and cancellations', () => {
    const value = reliability({
      verified: true,
      bookings: { COMPLETED: 8, CANCELLED: 2, PENDING: 5 },
      ratingSum: 23,
      ratingCount: 5,
      invitedProviders: 2,
    });
    expect(value.completed).toBe(8);
    expect(value.cancelShare).toBeCloseTo(0.2);
    expect(value.rating).toBe(4.6);
    expect(value.badges).toEqual(['Проверен', '★ 4.6 (5)', '8 заказов выполнено', 'Отмены 20%']);
    expect(value.recommends).toBe('Рекомендует сервис: пригласил 2 коллег');
  });

  it('does not judge cancellations on too few bookings, and ignores pending ones', () => {
    const few = reliability({ ...EMPTY_STATS, bookings: { CANCELLED: 1, PENDING: 10 } });
    expect(MIN_SAMPLE).toBeGreaterThan(1);
    expect(few.cancelShare).toBeNull();
    const clean = reliability({
      ...EMPTY_STATS,
      bookings: { COMPLETED: 1, CONFIRMED: 1, ACTIVE: 1 },
    });
    expect(clean.cancelShare).toBe(0);
    expect(clean.badges).toContain('Без отмен');
    expect(clean.badges).toContain('1 заказ выполнен');
  });

  it('labels cancellation shares', () => {
    expect(cancelLabel(0)).toBe('Без отмен');
    expect(cancelLabel(0.125)).toBe('Отмены 13%');
  });

  it('tallies bookings by company', () => {
    const map = tallyBookings([
      { status: 'COMPLETED', companyId: 'a' },
      { status: 'COMPLETED', companyId: 'a' },
      { status: 'CANCELLED', companyId: 'b' },
    ]);
    expect(map.get('a')).toEqual({ COMPLETED: 2 });
    expect(map.get('b')).toEqual({ CANCELLED: 1 });
  });
});
