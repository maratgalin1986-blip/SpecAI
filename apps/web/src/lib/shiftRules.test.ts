import { describe, expect, it } from 'vitest';
import {
  applyShiftTransition,
  formatMinutes,
  isTimesheetFinal,
  nextShiftStatuses,
  shiftDay,
  shiftDayWithinBooking,
  shiftDurations,
  suggestedHours,
  timesheetState,
} from './shiftRules';

const T0 = new Date('2026-10-08T05:00:00Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

describe('nextShiftStatuses', () => {
  it('follows Выехал → На объекте → Работа → Простой → Завершена', () => {
    expect(nextShiftStatuses('PLANNED')).toEqual(['EN_ROUTE', 'ON_SITE']);
    expect(nextShiftStatuses('EN_ROUTE')).toEqual(['ON_SITE']);
    expect(nextShiftStatuses('WORKING')).toEqual(['IDLE', 'FINISHED']);
    expect(nextShiftStatuses('IDLE')).toEqual(['WORKING', 'FINISHED']);
    expect(nextShiftStatuses('FINISHED')).toEqual([]);
    expect(nextShiftStatuses('garbage')).toEqual([]);
  });
});

describe('applyShiftTransition', () => {
  it('stamps each milestone once and keeps the first photo as the start photo', () => {
    const start = applyShiftTransition(
      { status: 'PLANNED' },
      { status: 'EN_ROUTE', photoUrl: 'https://x.ru/start.jpg' },
      T0,
    );
    expect(start).toEqual({
      ok: true,
      data: { status: 'EN_ROUTE', startedAt: T0, startPhotoUrl: 'https://x.ru/start.jpg' },
    });
    const arrived = applyShiftTransition(
      { status: 'EN_ROUTE', startedAt: T0, startPhotoUrl: 'https://x.ru/start.jpg' },
      { status: 'ON_SITE', photoUrl: 'https://x.ru/again.jpg' },
      minutes(30),
    );
    expect(arrived).toEqual({ ok: true, data: { status: 'ON_SITE', arrivedAt: minutes(30) } });
    const working = applyShiftTransition(
      { status: 'ON_SITE', startedAt: T0, arrivedAt: minutes(30) },
      { status: 'WORKING' },
      minutes(40),
    );
    expect(working).toEqual({
      ok: true,
      data: { status: 'WORKING', workStartedAt: minutes(40) },
    });
    const back = applyShiftTransition(
      { status: 'IDLE', startedAt: T0, arrivedAt: minutes(30), workStartedAt: minutes(40) },
      { status: 'WORKING' },
      minutes(90),
    );
    expect(back).toEqual({ ok: true, data: { status: 'WORKING' } });
    const done = applyShiftTransition(
      { status: 'WORKING', startedAt: T0 },
      { status: 'FINISHED', photoUrl: 'https://x.ru/end.jpg' },
      minutes(480),
    );
    expect(done).toEqual({
      ok: true,
      data: { status: 'FINISHED', finishedAt: minutes(480), endPhotoUrl: 'https://x.ru/end.jpg' },
    });
  });

  it('refuses wrong moves and an idle period without a reason', () => {
    expect(applyShiftTransition({ status: 'PLANNED' }, { status: 'WORKING' }, T0).ok).toBe(false);
    expect(applyShiftTransition({ status: 'FINISHED' }, { status: 'WORKING' }, T0).ok).toBe(false);
    const idle = applyShiftTransition({ status: 'WORKING' }, { status: 'IDLE', note: ' ' }, T0);
    expect(idle).toEqual({ ok: false, error: 'Укажите причину простоя' });
    expect(
      applyShiftTransition({ status: 'WORKING' }, { status: 'IDLE', note: 'ждём самосвал' }, T0).ok,
    ).toBe(true);
  });
});

describe('shiftDurations', () => {
  it('splits the log into work and idle minutes and runs the open interval to now', () => {
    const events = [
      { kind: 'EN_ROUTE', at: minutes(0) },
      { kind: 'ON_SITE', at: minutes(30) },
      { kind: 'WORKING', at: minutes(40) },
      { kind: 'IDLE', at: minutes(100) },
      { kind: 'WORKING', at: minutes(130) },
    ];
    expect(shiftDurations(events, minutes(190))).toEqual({ workedMinutes: 120, idleMinutes: 30 });
    expect(
      shiftDurations([...events, { kind: 'FINISHED', at: minutes(160) }], minutes(400)),
    ).toEqual({ workedMinutes: 90, idleMinutes: 30 });
    expect(shiftDurations([], T0)).toEqual({ workedMinutes: 0, idleMinutes: 0 });
  });

  it('formats and rounds hours', () => {
    expect(formatMinutes(0)).toBe('0 мин');
    expect(formatMinutes(60)).toBe('1 ч');
    expect(formatMinutes(450)).toBe('7 ч 30 мин');
    expect(suggestedHours(460)).toBe(7.75);
    expect(suggestedHours(0)).toBe(0);
  });
});

describe('shiftDay', () => {
  it('is UTC midnight of the Moscow day', () => {
    expect(shiftDay('2026-10-08')?.toISOString()).toBe('2026-10-08T00:00:00.000Z');
    // 22:30 UTC is already the next day in Moscow.
    expect(shiftDay(undefined, new Date('2026-10-07T22:30:00Z'))?.toISOString()).toBe(
      '2026-10-08T00:00:00.000Z',
    );
    expect(shiftDay('08.10.2026')).toBeNull();
    expect(shiftDay('2026-13-45')).toBeNull();
  });

  it('must fall inside the booking', () => {
    const booking = {
      startDate: new Date('2026-10-08T00:00:00Z'),
      endDate: new Date('2026-10-10T00:00:00Z'),
    };
    expect(shiftDayWithinBooking(new Date('2026-10-08T00:00:00Z'), booking)).toBe(true);
    expect(shiftDayWithinBooking(new Date('2026-10-10T00:00:00Z'), booking)).toBe(true);
    expect(shiftDayWithinBooking(new Date('2026-10-11T00:00:00Z'), booking)).toBe(false);
  });
});

describe('timesheet state', () => {
  it('is final only with both confirmations', () => {
    expect(isTimesheetFinal(null)).toBe(false);
    expect(isTimesheetFinal({ customerConfirmedAt: T0 })).toBe(false);
    expect(isTimesheetFinal({ customerConfirmedAt: T0, providerConfirmedAt: T0 })).toBe(true);
    expect(timesheetState(undefined)).toBe('none');
    expect(timesheetState({ disputedAt: T0 })).toBe('disputed');
    expect(timesheetState({ providerConfirmedAt: T0 })).toBe('waiting');
    expect(
      timesheetState({ customerConfirmedAt: T0, providerConfirmedAt: T0, disputedAt: T0 }),
    ).toBe('final');
  });
});
