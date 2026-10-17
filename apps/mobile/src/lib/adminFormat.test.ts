import { describe, expect, it } from 'vitest';
import type { AdminStats } from './adminApi';
import {
  badgeCount,
  formatCount,
  moderationTotal,
  moscowDate,
  moscowDateTime,
  signupLine,
  starsText,
  summaryRows,
  updatedLabel,
} from './adminFormat';

const stats: AdminStats = {
  customers: { total: 1250, today: 2, week: 15, month: 40 },
  providers: { total: 31, today: 0, week: 3, month: 9 },
  operators: 12,
  providerCompanies: 28,
  machines: 1003,
  openOrders: 7,
  activeBookings: 4,
  chatOrders: 5,
  moderation: { reviews: 2, comments: 1 },
  generatedAt: '2026-10-17T06:41:00.000Z',
};

describe('admin counters', () => {
  it('groups thousands with a non-breaking space', () => {
    expect(formatCount(1250)).toBe('1 250');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1234567)).toBe('1 234 567');
    expect(formatCount(undefined)).toBe('—');
    expect(formatCount(Number.NaN)).toBe('—');
  });

  it('writes the sign-up line: today, 7 and 30 days', () => {
    expect(signupLine(stats.customers)).toBe('сегодня +2 · 7 дней +15 · 30 дней +40');
    expect(signupLine(stats.providers)).toBe('сегодня +0 · 7 дней +3 · 30 дней +9');
  });

  it('lists the rest of the summary in the owner’s order', () => {
    expect(summaryRows(stats)).toEqual([
      { label: 'Компаний-исполнителей', value: '28' },
      { label: 'Машинистов', value: '12' },
      { label: 'Техники', value: '1 003' },
      { label: 'Открытых заявок', value: '7' },
      { label: 'Броней в работе', value: '4' },
    ]);
  });

  it('sums reviews and comments for the moderation badge', () => {
    expect(moderationTotal(stats)).toBe(3);
    expect(moderationTotal(null)).toBe(0);
    expect(badgeCount(3)).toBe('3');
    expect(badgeCount(0)).toBeNull();
    expect(badgeCount(undefined)).toBeNull();
    expect(badgeCount(150)).toBe('99+');
  });

  it('shows stars for a rating', () => {
    expect(starsText(4)).toBe('★★★★☆');
    expect(starsText(5)).toBe('★★★★★');
    expect(starsText(0)).toBe('☆☆☆☆☆');
    expect(starsText(9)).toBe('★★★★★');
  });

  it('dates by Moscow, not by the phone’s time zone', () => {
    // 22:30 UTC on 16 October is already 17 October 01:30 in Moscow.
    expect(moscowDate('2026-10-16T22:30:00Z')).toBe('17.10.2026');
    expect(moscowDateTime('2026-10-16T22:30:00Z')).toBe('17.10.2026, 01:30');
    expect(updatedLabel(stats.generatedAt)).toBe('Обновлено в 09:41 по Москве');
    expect(moscowDate('not a date')).toBe('—');
  });
});
