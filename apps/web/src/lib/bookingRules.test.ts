import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MAX_BOOKING_DAYS,
  bookingDays,
  checkBookingDates,
  moscowDateKey,
  rangesOverlap,
  toBookingDay,
  unavailableEquipmentMessage,
} from './bookingRules';
import { prismaErrorCode, readJson, zodErrorMessage } from './apiInput';

// 29 Sep 2026, 23:30 in Moscow (20:30 UTC).
const NOW = new Date('2026-09-29T20:30:00.000Z');
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe('Moscow calendar days', () => {
  it('reads the date in Moscow, not in UTC', () => {
    // 22:00 UTC is already 1 a.m. of the next day in Moscow.
    expect(moscowDateKey(new Date('2026-09-29T22:00:00.000Z'))).toBe('2026-09-30');
    expect(moscowDateKey(day('2028-03-01'))).toBe('2028-03-01');
  });

  it('maps a site date and a Moscow midnight from the app to the same day', () => {
    expect(toBookingDay(day('2028-03-01'))).toEqual(day('2028-03-01'));
    expect(toBookingDay(new Date('2028-02-29T21:00:00.000Z'))).toEqual(day('2028-03-01'));
  });

  it('counts days with both ends included', () => {
    expect(bookingDays(day('2028-03-01'), day('2028-03-01'))).toBe(1);
    expect(bookingDays(day('2028-03-01'), day('2028-03-03'))).toBe(3);
    // Across the end of February in a leap year.
    expect(bookingDays(day('2028-02-28'), day('2028-03-01'))).toBe(3);
  });
});

describe('checkBookingDates', () => {
  it('accepts today in Moscow and a one-day booking', () => {
    const result = checkBookingDates(day('2026-09-29'), day('2026-09-29'), NOW);
    expect(result).toEqual({
      ok: true,
      startDate: day('2026-09-29'),
      endDate: day('2026-09-29'),
      days: 1,
    });
  });

  it('rejects a start date in the past', () => {
    const result = checkBookingDates(day('2026-09-28'), day('2026-10-01'), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/прошла/);
    expect(checkBookingDates(day('2019-01-01'), day('2019-01-02'), NOW).ok).toBe(false);
  });

  it('uses the Moscow date: after 21:00 UTC yesterday-in-UTC is already the past', () => {
    const lateEvening = new Date('2026-09-29T21:30:00.000Z'); // 30 Sep, 00:30 in Moscow
    expect(checkBookingDates(day('2026-09-29'), day('2026-09-30'), lateEvening).ok).toBe(false);
    expect(checkBookingDates(day('2026-09-30'), day('2026-09-30'), lateEvening).ok).toBe(true);
  });

  it('rejects an end before the start', () => {
    const result = checkBookingDates(day('2026-10-05'), day('2026-10-01'), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/раньше/);
  });

  it(`allows at most ${MAX_BOOKING_DAYS} days`, () => {
    // 1 Oct – 29 Dec 2026 is exactly 90 days.
    expect(checkBookingDates(day('2026-10-01'), day('2026-12-29'), NOW)).toMatchObject({
      ok: true,
      days: 90,
    });
    const tooLong = checkBookingDates(day('2026-10-01'), day('2026-12-30'), NOW);
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toMatch(/90 дней/);
    expect(checkBookingDates(day('2030-01-01'), day('2040-01-01'), NOW).ok).toBe(false);
  });

  it('rejects invalid dates', () => {
    expect(checkBookingDates(new Date('x'), day('2026-10-01'), NOW).ok).toBe(false);
  });
});

describe('rangesOverlap', () => {
  const r = (a: string, b: string) => [day(a), day(b)] as const;

  it('treats sharing a single day as an overlap', () => {
    expect(rangesOverlap(...r('2028-03-01', '2028-03-02'), ...r('2028-03-02', '2028-03-05'))).toBe(
      true,
    );
    expect(rangesOverlap(...r('2028-03-01', '2028-03-01'), ...r('2028-03-01', '2028-03-01'))).toBe(
      true,
    );
  });

  it('keeps back-to-back and disjoint ranges apart', () => {
    expect(rangesOverlap(...r('2028-03-01', '2028-03-02'), ...r('2028-03-03', '2028-03-04'))).toBe(
      false,
    );
    expect(rangesOverlap(...r('2028-03-10', '2028-03-12'), ...r('2028-03-01', '2028-03-04'))).toBe(
      false,
    );
  });

  it('detects containment', () => {
    expect(rangesOverlap(...r('2028-03-01', '2028-03-31'), ...r('2028-03-10', '2028-03-11'))).toBe(
      true,
    );
  });
});

describe('unavailableEquipmentMessage', () => {
  it('lets only AVAILABLE equipment through', () => {
    expect(unavailableEquipmentMessage('AVAILABLE')).toBeNull();
    expect(unavailableEquipmentMessage('IN_MAINTENANCE')).toMatch(/обслуживании/);
    expect(unavailableEquipmentMessage('RENTED')).toMatch(/недоступна/);
  });
});

describe('apiInput helpers', () => {
  it('returns null for a body that is not JSON', async () => {
    const bad = new Request('http://x/', { method: 'POST', body: 'not json' });
    expect(await readJson(bad)).toBeNull();
    const good = new Request('http://x/', { method: 'POST', body: '{"a":1}' });
    expect(await readJson(good)).toEqual({ a: 1 });
  });

  it('extracts Prisma error codes only', () => {
    expect(prismaErrorCode({ code: 'P2003' })).toBe('P2003');
    expect(prismaErrorCode({ code: 'ECONNRESET' })).toBeNull();
    expect(prismaErrorCode(new Error('x'))).toBeNull();
  });

  it('gives one Russian message and hides zod English defaults', () => {
    const schema = z.object({ a: z.string().min(1, 'Заполните поле'), b: z.string().cuid() });
    const russian = schema.safeParse({ a: '', b: 'x' });
    expect(russian.success).toBe(false);
    if (!russian.success) expect(zodErrorMessage(russian.error)).toBe('Заполните поле');
    const english = schema.safeParse({ a: 'ok', b: 'x' });
    if (!english.success) expect(zodErrorMessage(english.error, 'Ошибка')).toBe('Ошибка');
  });
});
