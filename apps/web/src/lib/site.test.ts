import { describe, expect, it } from 'vitest';
import { isOnShift } from './site';

// Times are UTC; Moscow is UTC+3.
describe('isOnShift', () => {
  it('is on shift on weekdays and Saturday 8:00–20:00 Moscow time', () => {
    expect(isOnShift(new Date('2026-10-01T07:00:00Z'))).toBe(true); // Thu 10:00
    expect(isOnShift(new Date('2026-10-03T16:59:00Z'))).toBe(true); // Sat 19:59
    expect(isOnShift(new Date('2026-10-01T05:00:00Z'))).toBe(true); // Thu 8:00
  });
  it('is off shift at night and on Sunday', () => {
    expect(isOnShift(new Date('2026-10-01T04:59:00Z'))).toBe(false); // Thu 7:59
    expect(isOnShift(new Date('2026-10-01T17:00:00Z'))).toBe(false); // Thu 20:00
    expect(isOnShift(new Date('2026-10-04T09:00:00Z'))).toBe(false); // Sun 12:00
  });
});
