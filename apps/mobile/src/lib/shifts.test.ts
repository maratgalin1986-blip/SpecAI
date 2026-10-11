import { describe, expect, it } from 'vitest';
import {
  dayKey,
  formatMinutes,
  leadingBlanks,
  liveMinutes,
  monthKey,
  shiftMonth,
  shiftTone,
  shortDay,
  suggestedHours,
  transitionWantsPhoto,
} from './shifts';

describe('shift helpers', () => {
  it('formats minutes and hours', () => {
    expect(formatMinutes(0)).toBe('0 мин');
    expect(formatMinutes(60)).toBe('1 ч');
    expect(formatMinutes(455)).toBe('7 ч 35 мин');
    expect(suggestedHours(460)).toBe(7.75);
  });

  it('runs the timer only for the running status', () => {
    const base = { workedMinutes: 100, idleMinutes: 10 };
    const loaded = 1_000_000;
    const later = loaded + 5 * 60_000 + 30_000;
    expect(liveMinutes({ ...base, status: 'WORKING' }, loaded, later)).toEqual({
      worked: 105,
      idle: 10,
    });
    expect(liveMinutes({ ...base, status: 'IDLE' }, loaded, later)).toEqual({
      worked: 100,
      idle: 15,
    });
    expect(liveMinutes({ ...base, status: 'FINISHED' }, loaded, later)).toEqual({
      worked: 100,
      idle: 10,
    });
  });

  it('asks for a photo at the first move and at the end', () => {
    expect(transitionWantsPhoto({ status: 'PLANNED', startPhotoUrl: null }, 'EN_ROUTE')).toBe(true);
    expect(
      transitionWantsPhoto({ status: 'PLANNED', startPhotoUrl: 'https://x' }, 'EN_ROUTE'),
    ).toBe(false);
    expect(transitionWantsPhoto({ status: 'WORKING', startPhotoUrl: null }, 'IDLE')).toBe(false);
    expect(transitionWantsPhoto({ status: 'WORKING', startPhotoUrl: null }, 'FINISHED')).toBe(true);
  });

  it('maps unknown statuses to a neutral badge', () => {
    expect(shiftTone('WORKING')).toBe('success');
    expect(shiftTone('whatever')).toBe('neutral');
  });
});

describe('calendar helpers', () => {
  it('builds month keys and moves across years', () => {
    expect(monthKey(2026, 3)).toBe('2026-03');
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('starts the week on Monday', () => {
    // 1 October 2026 is a Thursday → three blanks.
    expect(leadingBlanks(2026, 10)).toBe(3);
    // 1 June 2026 is a Monday.
    expect(leadingBlanks(2026, 6)).toBe(0);
  });

  it('formats days', () => {
    expect(shortDay('2026-10-08')).toBe('08.10');
    expect(dayKey(new Date(2026, 9, 8))).toBe('2026-10-08');
  });
});
