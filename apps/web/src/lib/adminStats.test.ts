import { describe, expect, it } from 'vitest';
import { moscowDayStart, signupWindows } from './adminStats';

describe('admin counters: the «since» bounds', () => {
  it('starts «today» at Moscow midnight', () => {
    // 22:30 UTC on 16 October is already 17 October 01:30 in Moscow.
    expect(moscowDayStart(new Date('2026-10-16T22:30:00Z')).toISOString()).toBe(
      '2026-10-16T21:00:00.000Z',
    );
    expect(moscowDayStart(new Date('2026-10-17T10:00:00Z')).toISOString()).toBe(
      '2026-10-16T21:00:00.000Z',
    );
  });

  it('counts the week and the month back from now', () => {
    const now = new Date('2026-10-17T10:00:00Z');
    const windows = signupWindows(now);
    expect(windows.week.toISOString()).toBe('2026-10-10T10:00:00.000Z');
    expect(windows.month.toISOString()).toBe('2026-09-17T10:00:00.000Z');
  });
});
