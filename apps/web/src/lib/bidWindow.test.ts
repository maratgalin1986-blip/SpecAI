import { describe, expect, it } from 'vitest';
import {
  PREORDER_BID_WINDOW_MS,
  URGENT_BID_WINDOW_MS,
  bidsLeftText,
  bidsUntilFor,
  isLateBid,
} from './bidWindow';

const HOUR = 3_600_000;

describe('bidsUntilFor', () => {
  // 2026-10-08 12:00 Moscow.
  const created = new Date('2026-10-08T09:00:00Z');

  it('gives two hours for work that starts today', () => {
    const today = new Date('2026-10-08T00:00:00Z');
    expect(bidsUntilFor(created, today).getTime()).toBe(created.getTime() + URGENT_BID_WINDOW_MS);
  });

  it('gives a day for a preorder', () => {
    const nextWeek = new Date('2026-10-15T00:00:00Z');
    expect(bidsUntilFor(created, nextWeek).getTime()).toBe(
      created.getTime() + PREORDER_BID_WINDOW_MS,
    );
  });

  it('caps the window at the start date, but never under two hours', () => {
    // Tomorrow's work: the day ends before the 24 h window.
    const tomorrow = new Date('2026-10-09T00:00:00Z');
    expect(bidsUntilFor(created, tomorrow)).toEqual(tomorrow);
    // Created an hour before the start: two hours anyway.
    const late = new Date('2026-10-08T23:00:00Z');
    expect(bidsUntilFor(late, tomorrow).getTime()).toBe(late.getTime() + URGENT_BID_WINDOW_MS);
  });

  it('treats a start date in the past like today', () => {
    const yesterday = new Date('2026-10-07T00:00:00Z');
    expect(bidsUntilFor(created, yesterday).getTime()).toBe(created.getTime() + 2 * HOUR);
  });
});

describe('isLateBid', () => {
  const until = new Date('2026-10-08T11:00:00Z');
  it('is late only after the deadline', () => {
    expect(isLateBid(until, new Date('2026-10-08T10:59:00Z'))).toBe(false);
    expect(isLateBid(until, new Date('2026-10-08T11:01:00Z'))).toBe(true);
    expect(isLateBid(null, new Date())).toBe(false);
  });
});

describe('bidsLeftText', () => {
  const now = new Date('2026-10-08T09:00:00Z');
  it('counts hours and minutes down', () => {
    expect(bidsLeftText(new Date(now.getTime() + 80 * 60_000), now)).toBe('осталось 1 ч 20 мин');
    expect(bidsLeftText(new Date(now.getTime() + 2 * HOUR), now)).toBe('осталось 2 ч');
    expect(bidsLeftText(new Date(now.getTime() + 45 * 60_000), now)).toBe('осталось 45 мин');
    expect(bidsLeftText(new Date(now.getTime() + 30 * HOUR), now)).toBe('осталось 1 дн 6 ч');
  });

  it('is empty once the window is over or unknown', () => {
    expect(bidsLeftText(new Date(now.getTime() - 1), now)).toBeNull();
    expect(bidsLeftText(null, now)).toBeNull();
  });
});
