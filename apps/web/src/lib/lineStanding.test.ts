import { describe, expect, it } from 'vitest';
import {
  busyDays,
  localDayKey,
  renewedUntil,
  renewOfferDue,
  standingActive,
  standingBubbleTail,
  standingData,
  untilDateEnd,
  untilLong,
  untilText,
  workingDaysEnd,
} from './lineStanding';

const MSK = 'Europe/Moscow';
const NSK = 'Asia/Novosibirsk';

/** «2026-10-28 10:00» Moscow → Date. */
const msk = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:00`);

describe('workingDaysEnd — 5 working days, Mon–Fri', () => {
  it('counts today when it is a working day: Wednesday → Tuesday 23:59:59.999', () => {
    // 2026-10-28 is a Wednesday.
    const end = workingDaysEnd(msk('2026-10-28 10:00'), MSK);
    expect(end.toISOString()).toBe('2026-11-03T20:59:59.999Z');
    expect(localDayKey(end, MSK)).toBe('2026-11-03');
  });

  it('Monday → Friday of the same week', () => {
    expect(localDayKey(workingDaysEnd(msk('2026-10-26 07:00'), MSK), MSK)).toBe('2026-10-30');
  });

  it('a weekend start begins on Monday: Saturday and Sunday → next Friday', () => {
    expect(localDayKey(workingDaysEnd(msk('2026-10-31 12:00'), MSK), MSK)).toBe('2026-11-06');
    expect(localDayKey(workingDaysEnd(msk('2026-11-01 23:00'), MSK), MSK)).toBe('2026-11-06');
  });

  it('Friday late evening still counts Friday → Thursday', () => {
    expect(localDayKey(workingDaysEnd(msk('2026-10-30 23:30'), MSK), MSK)).toBe('2026-11-05');
  });

  it('uses the provider’s own day: Friday 01:00 in Novosibirsk is still Thursday in Moscow', () => {
    // 2026-10-29 22:00 Moscow = 2026-10-30 02:00 Novosibirsk (UTC+7).
    const now = msk('2026-10-29 22:00');
    expect(localDayKey(workingDaysEnd(now, MSK), MSK)).toBe('2026-11-04');
    const nsk = workingDaysEnd(now, NSK);
    expect(localDayKey(nsk, NSK)).toBe('2026-11-05');
    expect(nsk.toISOString()).toBe('2026-11-05T16:59:59.999Z');
  });

  it('one working day ends tonight', () => {
    expect(workingDaysEnd(msk('2026-10-28 10:00'), MSK, 1).toISOString()).toBe(
      '2026-10-28T20:59:59.999Z',
    );
  });
});

describe('«до …» and «пока не отключу»', () => {
  const now = msk('2026-10-28 10:00');

  it('takes a date to the end of that day', () => {
    expect(untilDateEnd('2026-11-06', now, MSK)?.toISOString()).toBe('2026-11-06T20:59:59.999Z');
    expect(untilDateEnd('2026-10-28', now, MSK)?.toISOString()).toBe('2026-10-28T20:59:59.999Z');
  });

  it('refuses a past, junk, impossible or too far date', () => {
    expect(untilDateEnd('2026-10-27', now, MSK)).toBeNull();
    expect(untilDateEnd('2026-02-30', now, MSK)).toBeNull();
    expect(untilDateEnd('завтра', now, MSK)).toBeNull();
    expect(untilDateEnd('2027-03-01', now, MSK)).toBeNull();
  });

  it('writes the columns for each mode', () => {
    expect(standingData('days5', now, MSK)?.standingUntil?.toISOString()).toBe(
      '2026-11-03T20:59:59.999Z',
    );
    expect(standingData('forever', now, MSK)).toMatchObject({
      standingForever: true,
      standingUntil: null,
    });
    expect(standingData('off', now, MSK)).toMatchObject({
      standingForever: false,
      standingUntil: null,
      standingSince: null,
    });
    expect(standingData('until', now, MSK, '2026-10-01')).toBeNull();
  });

  it('is active until the end and not a moment longer', () => {
    const row = { standingUntil: msk('2026-10-30 23:59') };
    expect(standingActive(row, msk('2026-10-30 23:58'))).toBe(true);
    expect(standingActive(row, msk('2026-10-31 00:00'))).toBe(false);
    expect(standingActive({ standingForever: true }, now)).toBe(true);
    expect(standingActive({}, now)).toBe(false);
  });
});

describe('texts', () => {
  const now = msk('2026-10-28 10:00');

  it('«до пт» within a week, «до 06.11» further, «до отключения»', () => {
    expect(untilText({ standingUntil: msk('2026-10-30 23:59') }, now, MSK)).toBe('до пт');
    expect(untilText({ standingUntil: msk('2026-11-03 23:59') }, now, MSK)).toBe('до вт');
    expect(untilText({ standingUntil: msk('2026-11-06 23:59') }, now, MSK)).toBe('до 06.11');
    expect(untilText({ standingUntil: msk('2026-10-28 23:59') }, now, MSK)).toBe('до конца дня');
    expect(untilText({ standingForever: true }, now, MSK)).toBe('до отключения');
    expect(untilText({ standingUntil: msk('2026-10-27 23:59') }, now, MSK)).toBeNull();
    expect(standingBubbleTail({ standingUntil: msk('2026-10-30 23:59') }, now, MSK)).toBe(
      'на линии до пт',
    );
  });

  it('the long date for the toggle and the reminder', () => {
    expect(untilLong(msk('2026-10-30 23:59'), MSK)).toBe('30.10 (пт)');
  });
});

describe('renewal', () => {
  const until = msk('2026-10-30 23:59');

  it('offers once, within 36 hours of the end', () => {
    const since = msk('2026-10-26 08:00');
    expect(
      renewOfferDue({ standingUntil: until, standingSince: since }, msk('2026-10-29 19:00')),
    ).toBe(true);
    expect(
      renewOfferDue({ standingUntil: until, standingSince: since }, msk('2026-10-28 19:00')),
    ).toBe(false);
    expect(
      renewOfferDue(
        { standingUntil: until, standingSince: since, renewOfferAt: msk('2026-10-29 19:00') },
        msk('2026-10-30 19:00'),
      ),
    ).toBe(false);
    // A new period (renewed in the cabinet) gets its own offer.
    expect(
      renewOfferDue(
        {
          standingUntil: until,
          standingSince: msk('2026-10-30 09:00'),
          renewOfferAt: msk('2026-10-29 19:00'),
        },
        msk('2026-10-30 19:00'),
      ),
    ).toBe(true);
    expect(renewOfferDue({ standingForever: true }, msk('2026-10-30 19:00'))).toBe(false);
    expect(renewOfferDue({ standingUntil: until }, msk('2026-10-31 01:00'))).toBe(false);
  });

  it('renews from the end of a running period: Thursday → next Friday', () => {
    const next = renewedUntil(
      { standingUntil: workingDaysEnd(msk('2026-10-26 08:00'), MSK) },
      msk('2026-10-29 19:00'),
      MSK,
    );
    expect(localDayKey(next, MSK)).toBe('2026-11-06');
  });

  it('renews from now when the period has run out', () => {
    const next = renewedUntil(
      { standingUntil: msk('2026-10-23 23:59') },
      msk('2026-10-28 10:00'),
      MSK,
    );
    expect(localDayKey(next, MSK)).toBe('2026-11-03');
  });
});

describe('busy days', () => {
  const booking = (start: string, end: string, status = 'CONFIRMED', equipmentId = 'e1') => ({
    equipmentId,
    startDate: msk(start),
    endDate: msk(end),
    status,
  });

  it('marks every Moscow day a CONFIRMED or ACTIVE booking covers', () => {
    expect(
      busyDays(
        [
          booking('2026-10-29 08:00', '2026-10-30 18:00'),
          booking('2026-11-02 08:00', '2026-11-02 18:00', 'ACTIVE'),
          booking('2026-10-28 08:00', '2026-10-28 18:00', 'PENDING'),
          booking('2026-10-28 08:00', '2026-10-28 18:00', 'CONFIRMED', 'e2'),
        ],
        'e1',
        '2026-10-28',
      ),
    ).toEqual(['2026-10-29', '2026-10-30', '2026-11-02']);
  });

  it('starts from today and stops after the limit', () => {
    expect(
      busyDays([booking('2026-10-20 08:00', '2026-12-30 18:00')], 'e1', '2026-10-28', 3),
    ).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
  });
});
