import { describe, expect, it } from 'vitest';
import {
  calendarSummary,
  classifyDay,
  daysInMonth,
  freeFromLabel,
  monthCalendar,
  nextFreeDate,
  parseMonth,
} from './occupancy';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const bookings = [
  { id: 'b1', status: 'CONFIRMED', startDate: d('2026-10-05'), endDate: d('2026-10-07') },
  { id: 'b2', status: 'PENDING', startDate: d('2026-10-07'), endDate: d('2026-10-09') },
  { id: 'b3', status: 'CANCELLED', startDate: d('2026-10-12'), endDate: d('2026-10-12') },
];
const blocks = [{ id: 'k1', from: d('2026-10-09'), to: d('2026-10-10'), reason: 'ТО' }];

describe('classifyDay', () => {
  it('ranks booked over blocked over pending over maintenance', () => {
    expect(classifyDay('2026-10-07', bookings, blocks)).toEqual({
      kind: 'booked',
      bookingId: 'b1',
    });
    expect(classifyDay('2026-10-08', bookings, blocks)).toEqual({
      kind: 'pending',
      bookingId: 'b2',
    });
    expect(classifyDay('2026-10-09', bookings, blocks)).toEqual({ kind: 'blocked', blockId: 'k1' });
    expect(classifyDay('2026-10-12', bookings, blocks)).toEqual({ kind: 'free' });
    expect(classifyDay('2026-10-12', bookings, blocks, true)).toEqual({ kind: 'maintenance' });
    expect(classifyDay('2026-10-05', bookings, blocks, true)).toEqual({
      kind: 'booked',
      bookingId: 'b1',
    });
  });

  it('uses Moscow calendar days', () => {
    // 21:00Z on 4 Oct is already 5 Oct in Moscow.
    const row = [
      { id: 'x', status: 'ACTIVE', startDate: d('2026-10-05'), endDate: d('2026-10-05') },
    ];
    expect(
      classifyDay('2026-10-05', [{ ...row[0]!, startDate: new Date('2026-10-04T21:00:00Z') }], []),
    ).toEqual({ kind: 'booked', bookingId: 'x' });
  });
});

describe('monthCalendar', () => {
  it('lists every day with its kind and marks past days', () => {
    const days = monthCalendar({
      year: 2026,
      month: 10,
      bookings,
      blocks,
      today: new Date('2026-10-06T10:00:00Z'),
    });
    expect(days).toHaveLength(31);
    expect(days[0]).toEqual({ date: '2026-10-01', kind: 'free', past: true });
    expect(days[5]).toEqual({ date: '2026-10-06', kind: 'booked', bookingId: 'b1', past: false });
    expect(calendarSummary(days)).toEqual({
      free: 25,
      booked: 3,
      pending: 1,
      blocked: 2,
      maintenance: 0,
    });
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});

describe('nextFreeDate', () => {
  it('skips bookings, pending requests and blocks', () => {
    expect(nextFreeDate(bookings, blocks, { from: new Date('2026-10-05T08:00:00Z') })).toBe(
      '2026-10-11',
    );
    expect(nextFreeDate(bookings, blocks, { from: new Date('2026-10-01T08:00:00Z') })).toBe(
      '2026-10-01',
    );
    expect(
      nextFreeDate(bookings, blocks, { from: d('2026-10-05'), inMaintenance: true }),
    ).toBeNull();
    expect(
      nextFreeDate(
        [{ id: 'long', status: 'ACTIVE', startDate: d('2026-10-01'), endDate: d('2027-01-01') }],
        [],
        { from: d('2026-10-05'), horizonDays: 30 },
      ),
    ).toBeNull();
  });

  it('labels the chip', () => {
    const today = new Date('2026-10-05T08:00:00Z');
    expect(freeFromLabel('2026-10-05', today)).toBe('Свободна сегодня');
    expect(freeFromLabel('2026-10-06', today)).toBe('Свободна с завтра');
    expect(freeFromLabel('2026-10-11', today)).toBe('Свободна с 11.10');
    expect(freeFromLabel(null, today)).toBe('Даты уточняйте');
  });
});

describe('parseMonth', () => {
  it('reads YYYY-MM and falls back to the current Moscow month', () => {
    expect(parseMonth('2026-11')).toEqual({ year: 2026, month: 11 });
    expect(parseMonth('2026-13', new Date('2026-10-31T22:00:00Z'))).toEqual({
      year: 2026,
      month: 11,
    });
    expect(parseMonth(null, new Date('2026-10-15T12:00:00Z'))).toEqual({ year: 2026, month: 10 });
  });
});
