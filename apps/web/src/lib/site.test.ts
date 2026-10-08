import { describe, expect, it } from 'vitest';
import { isOnShift, nextShiftText } from './site';

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

describe('nextShiftText', () => {
  it('names the next working morning', () => {
    expect(nextShiftText(new Date('2026-10-01T02:00:00Z'))).toBe('сегодня с 8:00'); // Thu 5:00
    expect(nextShiftText(new Date('2026-10-01T18:00:00Z'))).toBe('завтра с 8:00'); // Thu 21:00
    expect(nextShiftText(new Date('2026-10-03T18:00:00Z'))).toBe('в понедельник с 8:00'); // Sat 21:00
    expect(nextShiftText(new Date('2026-10-04T09:00:00Z'))).toBe('завтра с 8:00'); // Sun 12:00
  });
});
