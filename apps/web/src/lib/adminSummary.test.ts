import { describe, expect, it } from 'vitest';
import { toRoubles, TURNOVER_STATUSES } from './adminSummary';

describe('admin summary', () => {
  it('rounds the booking sum once, to whole roubles', () => {
    expect(toRoubles({ toString: () => '25000.50' })).toBe(25001);
    expect(toRoubles(null)).toBe(0);
    expect(toRoubles(undefined)).toBe(0);
    expect(toRoubles({ toString: () => 'NaN' })).toBe(0);
    expect(toRoubles(1999.4)).toBe(1999);
  });

  it('counts only bookings the provider took', () => {
    expect(TURNOVER_STATUSES).toEqual(['CONFIRMED', 'ACTIVE', 'COMPLETED']);
    expect(TURNOVER_STATUSES).not.toContain('CANCELLED');
    expect(TURNOVER_STATUSES).not.toContain('PENDING');
  });
});
