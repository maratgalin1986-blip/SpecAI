import { describe, expect, it } from 'vitest';
import {
  checklistProgress,
  monthIncome,
  monthStartMsk,
  noOrdersChecklist,
  type ChecklistState,
} from './providerDashboard';

describe('monthStartMsk', () => {
  it('is midnight of the 1st in Moscow', () => {
    expect(monthStartMsk(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe(
      '2026-09-30T21:00:00.000Z',
    );
    // 23:30 UTC on 31 Oct is already 1 Nov in Moscow.
    expect(monthStartMsk(new Date('2026-10-31T22:30:00Z')).toISOString()).toBe(
      '2026-10-31T21:00:00.000Z',
    );
  });
});

describe('monthIncome', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  it('sums confirmed, active and completed bookings that start this month', () => {
    expect(
      monthIncome(
        [
          { status: 'COMPLETED', startDate: new Date('2026-10-02T06:00:00Z'), totalPrice: '24000' },
          { status: 'CONFIRMED', startDate: new Date('2026-10-20T06:00:00Z'), totalPrice: 18000.5 },
          { status: 'PENDING', startDate: new Date('2026-10-03T06:00:00Z'), totalPrice: 99999 },
          { status: 'CANCELLED', startDate: new Date('2026-10-04T06:00:00Z'), totalPrice: 5000 },
          { status: 'COMPLETED', startDate: new Date('2026-09-29T06:00:00Z'), totalPrice: 7000 },
          { status: 'ACTIVE', startDate: new Date('2026-11-01T06:00:00Z'), totalPrice: 7000 },
          { status: 'ACTIVE', startDate: new Date('2026-10-30T22:00:00Z'), totalPrice: 'x' },
        ],
        now,
      ),
    ).toBe(42001);
  });
});

describe('noOrdersChecklist', () => {
  const ready: ChecklistState = {
    hasPhone: true,
    hasDescription: true,
    machines: 2,
    machinesWithPhoto: 2,
    machinesWithHourly: 2,
    machinesAvailable: 1,
    hasBase: true,
    verified: true,
    newOrders: 0,
  };

  it('is all done for a complete profile', () => {
    const items = noOrdersChecklist(ready);
    expect(checklistProgress(items)).toEqual({ done: items.length, total: items.length });
    expect(items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['profile', 'photos', 'base', 'prices', 'verified']),
    );
  });

  it('points at what is missing', () => {
    const items = noOrdersChecklist({
      ...ready,
      machines: 0,
      machinesWithPhoto: 0,
      machinesWithHourly: 0,
      machinesAvailable: 0,
      hasBase: false,
      verified: false,
      hasDescription: false,
      newOrders: 4,
    });
    const missing = items.filter((item) => !item.done).map((item) => item.id);
    expect(missing).toEqual([
      'machines',
      'available',
      'photos',
      'prices',
      'base',
      'profile',
      'verified',
      'answer',
    ]);
    expect(items.find((item) => item.id === 'answer')!.hint).toContain('4');
    expect(items.every((item) => item.href.startsWith('/'))).toBe(true);
  });
});
