import { describe, expect, it } from 'vitest';
import {
  afterEveningCutoff,
  LINE_EVENING_OFF_HOUR,
  lineSessionExpired,
  localDayHour,
  presenceAutoOff,
  validTimeZone,
} from './lineDay';

const at = (iso: string) => new Date(iso);

describe('evening cutoff of the line', () => {
  it('is 21:00 local', () => {
    expect(LINE_EVENING_OFF_HOUR).toBe(21);
  });

  it('ends a Moscow morning session at 21:00 Moscow time', () => {
    const since = at('2026-10-17T05:00:00Z'); // 08:00 MSK
    expect(lineSessionExpired(since, at('2026-10-17T17:59:00Z'), 'Europe/Moscow')).toBe(false);
    expect(lineSessionExpired(since, at('2026-10-17T18:00:00Z'), 'Europe/Moscow')).toBe(true);
  });

  it('ends a Novosibirsk session at 21:00 in Novosibirsk, four hours before Moscow', () => {
    const since = at('2026-10-17T01:00:00Z'); // 08:00 NOVT
    expect(lineSessionExpired(since, at('2026-10-17T13:59:00Z'), 'Asia/Novosibirsk')).toBe(false);
    expect(lineSessionExpired(since, at('2026-10-17T14:00:00Z'), 'Asia/Novosibirsk')).toBe(true);
    // The same moment is 17:00 in Moscow: the zone decides, not the server.
    expect(lineSessionExpired(since, at('2026-10-17T14:00:00Z'), 'Europe/Moscow')).toBe(false);
  });

  it('ends a Kaliningrad session at 21:00 in Kaliningrad, an hour after Moscow', () => {
    const since = at('2026-10-17T06:00:00Z'); // 08:00 KALT
    expect(lineSessionExpired(since, at('2026-10-17T18:30:00Z'), 'Europe/Kaliningrad')).toBe(false);
    expect(lineSessionExpired(since, at('2026-10-17T18:30:00Z'), 'Europe/Moscow')).toBe(true);
    expect(lineSessionExpired(since, at('2026-10-17T19:00:00Z'), 'Europe/Kaliningrad')).toBe(true);
  });

  it('ends a session begun on an earlier local day', () => {
    // Yesterday 08:00 MSK, the phone silent overnight, now 07:00 MSK.
    expect(
      lineSessionExpired(at('2026-10-16T05:00:00Z'), at('2026-10-17T04:00:00Z'), 'Europe/Moscow'),
    ).toBe(true);
    // Yesterday 23:30 in Novosibirsk, now 00:10 there.
    expect(
      lineSessionExpired(
        at('2026-10-16T16:30:00Z'),
        at('2026-10-16T17:10:00Z'),
        'Asia/Novosibirsk',
      ),
    ).toBe(true);
  });

  it('keeps a late session switched on after 21:00 until midnight', () => {
    const since = at('2026-10-16T19:30:00Z'); // 22:30 MSK
    expect(lineSessionExpired(since, at('2026-10-16T20:59:00Z'), 'Europe/Moscow')).toBe(false);
    expect(lineSessionExpired(since, at('2026-10-16T21:00:00Z'), 'Europe/Moscow')).toBe(true);
  });

  it('falls back to Moscow for a junk or missing zone', () => {
    const since = at('2026-10-17T05:00:00Z');
    const now = at('2026-10-17T18:00:00Z');
    expect(lineSessionExpired(since, now, 'Mars/Olympus')).toBe(true);
    expect(lineSessionExpired(since, now, null)).toBe(true);
    expect(lineSessionExpired(since, at('2026-10-17T17:00:00Z'), undefined)).toBe(false);
  });

  it('never ends a session at or before its start', () => {
    const since = at('2026-10-17T19:00:00Z');
    expect(lineSessionExpired(since, since, 'Europe/Moscow')).toBe(false);
    expect(lineSessionExpired(since, at('2026-10-17T18:00:00Z'), 'Europe/Moscow')).toBe(false);
  });

  it('knows when local time is past the cutoff', () => {
    expect(afterEveningCutoff(at('2026-10-17T18:00:00Z'), 'Europe/Moscow')).toBe(true);
    expect(afterEveningCutoff(at('2026-10-17T18:00:00Z'), 'Europe/Kaliningrad')).toBe(false);
    expect(afterEveningCutoff(at('2026-10-17T14:00:00Z'), 'Asia/Novosibirsk')).toBe(true);
  });

  it('reads the local day and hour', () => {
    expect(localDayHour(at('2026-10-17T21:30:00Z'), 'Europe/Moscow')).toEqual({
      day: '2026-10-18',
      hour: 0,
    });
  });

  it('judges a row without onlineSince by freshness only', () => {
    const now = at('2026-10-17T20:00:00Z');
    expect(presenceAutoOff({ onlineSince: null, timeZone: 'Europe/Moscow' }, now)).toBe(false);
    expect(presenceAutoOff({ onlineSince: at('2026-10-17T05:00:00Z') }, now)).toBe(true);
  });
});

describe('validTimeZone', () => {
  it('accepts IANA zones and ignores junk', () => {
    expect(validTimeZone('Asia/Novosibirsk')).toBe('Asia/Novosibirsk');
    expect(validTimeZone(' Europe/Kaliningrad ')).toBe('Europe/Kaliningrad');
    expect(validTimeZone('Mars/Olympus')).toBeNull();
    expect(validTimeZone("Europe/Moscow'; drop table")).toBeNull();
    expect(validTimeZone('')).toBeNull();
    expect(validTimeZone(3)).toBeNull();
    expect(validTimeZone(null)).toBeNull();
    expect(validTimeZone('A'.repeat(80))).toBeNull();
  });
});
