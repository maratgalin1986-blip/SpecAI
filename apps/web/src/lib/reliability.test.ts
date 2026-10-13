import { describe, expect, it } from 'vitest';
import {
  EMPTY_STATS,
  MIN_SAMPLE,
  cancelLabel,
  cancellationShare,
  reliability,
  tallyBookings,
} from './reliability';

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
      cancelledBy: { PROVIDER: 2 },
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
    const few = reliability({
      ...EMPTY_STATS,
      bookings: { CANCELLED: 1, PENDING: 10 },
      cancelledBy: { PROVIDER: 1 },
    });
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

  it("does not count the customer's cancellations against the provider", () => {
    // Three kept bookings, two cancelled by customers, one by the provider.
    const stats = {
      ...EMPTY_STATS,
      bookings: { COMPLETED: 2, CONFIRMED: 1, CANCELLED: 3 },
      cancelledBy: { CUSTOMER: 2, PROVIDER: 1 },
    };
    const value = reliability(stats);
    // The customers' two cancellations count as kept by the provider.
    expect(value.cancelShare).toBeCloseTo(1 / 6);
    expect(value.badges).toContain('Отмены 17%');
    // The same bookings from the customers' side.
    expect(cancellationShare(stats, 'CUSTOMER')).toBeCloseTo(2 / 6);
    // Only customers cancelled: a clean provider.
    expect(
      reliability({
        ...EMPTY_STATS,
        bookings: { COMPLETED: 3, CANCELLED: 4 },
        cancelledBy: { CUSTOMER: 4 },
      }).badges,
    ).toContain('Без отмен');
  });

  it("never raises the provider's share when a customer cancels a confirmed booking", () => {
    const before = {
      ...EMPTY_STATS,
      bookings: { COMPLETED: 3, CONFIRMED: 3, CANCELLED: 1 },
      cancelledBy: { PROVIDER: 1 },
    };
    const after = {
      ...EMPTY_STATS,
      bookings: { COMPLETED: 3, CONFIRMED: 2, CANCELLED: 2 },
      cancelledBy: { PROVIDER: 1, CUSTOMER: 1 },
    };
    expect(cancellationShare(after, 'PROVIDER')).toBe(cancellationShare(before, 'PROVIDER'));
  });

  it('leaves out cancellations nobody is recorded for (legacy rows)', () => {
    // Cancelled before Booking.cancelledBy existed: in `bookings`, not in `cancelledBy`.
    const legacy = reliability({ ...EMPTY_STATS, bookings: { COMPLETED: 3, CANCELLED: 5 } });
    expect(legacy.cancelShare).toBe(0);
    expect(legacy.badges).toContain('Без отмен');
    // And they do not fill the sample either.
    expect(
      reliability({ ...EMPTY_STATS, bookings: { COMPLETED: 1, CANCELLED: 5 } }).cancelShare,
    ).toBeNull();
  });

  it('labels cancellation shares', () => {
    expect(cancelLabel(0)).toBe('Без отмен');
    expect(cancelLabel(0.125)).toBe('Отмены 13%');
  });

  it('tallies bookings by company and cancellations by who cancelled', () => {
    const map = tallyBookings([
      { status: 'COMPLETED', companyId: 'a' },
      { status: 'COMPLETED', companyId: 'a', cancelledBy: null },
      { status: 'CANCELLED', companyId: 'b', cancelledBy: 'PROVIDER' },
      { status: 'CANCELLED', companyId: 'b', cancelledBy: 'CUSTOMER' },
      { status: 'CANCELLED', companyId: 'b', cancelledBy: 'CUSTOMER' },
      // Legacy and junk values are counted as cancelled, but for nobody.
      { status: 'CANCELLED', companyId: 'b', cancelledBy: null },
      { status: 'CANCELLED', companyId: 'b', cancelledBy: 'toString' },
    ]);
    expect(map.get('a')).toEqual({ bookings: { COMPLETED: 2 }, cancelledBy: {} });
    expect(map.get('b')).toEqual({
      bookings: { CANCELLED: 5 },
      cancelledBy: { PROVIDER: 1, CUSTOMER: 2 },
    });
    // The customers' two cancellations count as kept: 1 of 3 is the provider's.
    expect(reliability({ ...EMPTY_STATS, ...map.get('b')! }).cancelShare).toBeCloseTo(1 / 3);
  });
});
