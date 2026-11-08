import { describe, expect, it } from 'vitest';
import { ESTIMATE_MAX_DAYS, orderDays, orderEstimate } from './orderEstimate';
import { RATES, SHIFT_HOURS } from './prices';

describe('orderDays', () => {
  it('counts both ends and treats an empty end as one day', () => {
    expect(orderDays('2026-11-02', '2026-11-04')).toBe(3);
    expect(orderDays('2026-11-02', '')).toBe(1);
  });
  it('is null for missing or reversed dates', () => {
    expect(orderDays('', '')).toBeNull();
    expect(orderDays('2026-11-04', '2026-11-02')).toBeNull();
  });
});

describe('orderEstimate', () => {
  it('takes the house price from lib/prices.ts', () => {
    const value = orderEstimate('Экскаваторы-погрузчики', '2026-11-02', '2026-11-03');
    expect(value).toEqual({
      perHour: RATES.backhoe,
      perShift: RATES.backhoe * SHIFT_HOURS,
      days: 2,
      total: RATES.backhoe * SHIFT_HOURS * 2,
    });
  });
  it('shows no number for a category without a house price', () => {
    expect(orderEstimate('Вилочные погрузчики', '2026-11-02', '')).toBeNull();
    expect(orderEstimate(undefined, '2026-11-02', '')).toBeNull();
  });
  it('gives only the shift price without dates or for very long periods', () => {
    expect(orderEstimate('Автовышки (АГП)', '', '')?.total).toBeNull();
    const long = orderEstimate('Автовышки (АГП)', '2026-01-01', '2026-12-31');
    expect(long?.days).toBeGreaterThan(ESTIMATE_MAX_DAYS);
    expect(long?.total).toBeNull();
  });
});
