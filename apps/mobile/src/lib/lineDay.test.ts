import { describe, expect, it } from 'vitest';
import {
  LINE_EVENING_OFF_HOUR,
  lineAutoOff,
  lineAutoOffMessage,
  lineAutoOffReason,
  lineOffAtText,
  localDayHour,
  parseLineAutoOff,
  startOfLocalDay,
} from './line';

const at = (iso: string) => new Date(iso);
/** A moment on the phone's own clock: 17 October 2026 unless said otherwise. */
const local = (hour: number, minute = 0, day = 17) => new Date(2026, 9, day, hour, minute);

describe('evening auto-off on the phone', () => {
  it('switches off at 21:00 by default', () => {
    expect(LINE_EVENING_OFF_HOUR).toBe(21);
  });

  it('Moscow: a morning line runs until 21:00 Moscow time', () => {
    const since = at('2026-10-17T05:00:00Z'); // 08:00
    expect(lineAutoOffReason(since, at('2026-10-17T17:59:00Z'), 'Europe/Moscow')).toBeNull();
    expect(lineAutoOffReason(since, at('2026-10-17T18:00:00Z'), 'Europe/Moscow')).toBe('evening');
  });

  it('Novosibirsk: 21:00 there is 17:00 in Moscow', () => {
    const since = at('2026-10-17T01:00:00Z'); // 08:00 NOVT
    expect(lineAutoOffReason(since, at('2026-10-17T13:59:00Z'), 'Asia/Novosibirsk')).toBeNull();
    expect(lineAutoOffReason(since, at('2026-10-17T14:00:00Z'), 'Asia/Novosibirsk')).toBe(
      'evening',
    );
    expect(lineAutoOffReason(since, at('2026-10-17T14:00:00Z'), 'Europe/Moscow')).toBeNull();
  });

  it('Kaliningrad: 21:00 there is 22:00 in Moscow', () => {
    const since = at('2026-10-17T06:00:00Z'); // 08:00 KALT
    expect(lineAutoOffReason(since, at('2026-10-17T18:30:00Z'), 'Europe/Kaliningrad')).toBeNull();
    expect(lineAutoOffReason(since, at('2026-10-17T19:00:00Z'), 'Europe/Kaliningrad')).toBe(
      'evening',
    );
  });

  it('a line left on since yesterday is over; a late line runs until midnight', () => {
    // Yesterday 08:00 MSK, now 07:00 MSK.
    expect(
      lineAutoOffReason(at('2026-10-16T05:00:00Z'), at('2026-10-17T04:00:00Z'), 'Europe/Moscow'),
    ).toBe('evening');
    const late = at('2026-10-17T18:30:00Z'); // 21:30 MSK, switched on by hand
    expect(lineAutoOffReason(late, at('2026-10-17T20:59:00Z'), 'Europe/Moscow')).toBeNull();
    expect(lineAutoOffReason(late, at('2026-10-17T21:00:00Z'), 'Europe/Moscow')).toBe('midnight');
  });

  it('never fires at or before the start (clock moved back)', () => {
    const since = at('2026-10-17T19:00:00Z');
    expect(lineAutoOffReason(since, since, 'Europe/Moscow')).toBeNull();
    expect(lineAutoOffReason(since, at('2026-10-17T10:00:00Z'), 'Europe/Moscow')).toBeNull();
  });

  it('reads the phone’s own clock without a zone', () => {
    expect(localDayHour(local(21, 5))).toEqual({ day: '2026-10-17', hour: 21 });
    expect(lineAutoOffReason(local(8), local(21, 5))).toBe('evening');
    expect(lineAutoOffReason(local(8), local(20, 59))).toBeNull();
    expect(startOfLocalDay(local(15, 30))).toBe(local(0).getTime());
  });
});

describe('the feed message after the line switched itself off', () => {
  it('that evening: «Завтра утром включите снова»', () => {
    const off = lineAutoOff(local(8), local(21));
    expect(off).toEqual({ reason: 'evening', day: '2026-10-17' });
    expect(lineAutoOffMessage(off!, local(21, 1))).toBe(
      'Линия выключилась в 21:00. Завтра утром включите снова.',
    );
  });

  it('the next morning (message not closed, or phone was off): «Вчера»', () => {
    const off = lineAutoOff(local(8, 0, 16), local(7))!;
    expect(off).toEqual({ reason: 'evening', day: '2026-10-16' });
    expect(lineAutoOffMessage(off, local(7))).toBe(
      'Вчера в 21:00 линия выключилась сама. Включите снова, если сегодня работаете.',
    );
    // Shown that evening, still open the next morning: the text follows the day.
    const sameEvening = lineAutoOff(local(8), local(21))!;
    expect(lineAutoOffMessage(sameEvening, local(8, 0, 18))).toBe(
      'Вчера в 21:00 линия выключилась сама. Включите снова, если сегодня работаете.',
    );
  });

  it('days later: no «вчера»', () => {
    const off = lineAutoOff(local(8, 0, 14), local(9))!; // Friday's line, Monday morning
    expect(lineAutoOffMessage(off, local(9))).toBe(
      'Линия выключилась сама в 21:00. Включите снова, если сегодня работаете.',
    );
  });

  it('a late line: «в полночь», then «ночью»', () => {
    const off = lineAutoOff(local(22, 0, 16), local(0, 1))!;
    expect(off).toEqual({ reason: 'midnight', day: '2026-10-17' });
    expect(lineAutoOffMessage(off, local(0, 1))).toBe(
      'Линия выключилась в полночь. Утром включите снова.',
    );
    expect(lineAutoOffMessage(off, local(8))).toBe(
      'Ночью линия выключилась сама. Включите снова, если сегодня работаете.',
    );
  });

  it('nothing while the line goes on', () => {
    expect(lineAutoOff(local(8), local(20, 59))).toBeNull();
  });

  it('says when a running line will end', () => {
    expect(lineOffAtText(local(8))).toBe('В 21:00 линия выключится сама.');
    expect(lineOffAtText(local(22))).toBe('В полночь линия выключится сама.');
    expect(lineOffAtText(null)).toBe('В 21:00 линия выключится сама.');
  });

  it('reads back what was stored, ignores anything else', () => {
    expect(parseLineAutoOff('{"reason":"evening","day":"2026-10-17"}')).toEqual({
      reason: 'evening',
      day: '2026-10-17',
    });
    expect(parseLineAutoOff('Линия выключилась в 21:00.')).toBeNull();
    expect(parseLineAutoOff('{"reason":"later","day":"2026-10-17"}')).toBeNull();
    expect(parseLineAutoOff('{"reason":"evening","day":"вчера"}')).toBeNull();
    expect(parseLineAutoOff('')).toBeNull();
  });
});
