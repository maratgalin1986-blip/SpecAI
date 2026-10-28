import { describe, expect, it } from 'vitest';
import { lineRenewPath, lineRenewToken, verifyLineRenewToken } from './lineRenew';
import { lineMatchesOrder, renderNotification, eventChannels } from './notifications/routing';

const SECRET = 'test-secret';
const until = new Date('2026-10-30T20:59:59.999Z');

describe('the renewal link', () => {
  it('round-trips the row and the period end', () => {
    const token = lineRenewToken('clx123', until, SECRET)!;
    expect(verifyLineRenewToken(token, SECRET)).toEqual({
      presenceId: 'clx123',
      untilMs: until.getTime(),
    });
  });

  it('refuses a forged, tampered or foreign-period token', () => {
    const token = lineRenewToken('clx123', until, SECRET)!;
    const [id, ms, sig] = token.split('.');
    expect(verifyLineRenewToken(token, 'other-secret')).toBeNull();
    expect(verifyLineRenewToken(`${id}.${Number(ms) + 86_400_000}.${sig}`, SECRET)).toBeNull();
    expect(
      verifyLineRenewToken(`${Buffer.from('other').toString('base64url')}.${ms}.${sig}`, SECRET),
    ).toBeNull();
    expect(verifyLineRenewToken(`${token}.x`, SECRET)).toBeNull();
    expect(verifyLineRenewToken(42, SECRET)).toBeNull();
  });

  it('is never made without a secret', () => {
    expect(lineRenewToken('clx123', until, '')).toBeNull();
  });

  it('the reminder: one-tap path, the end date, no paid channels', () => {
    const token = lineRenewToken('clx123', until, SECRET)!;
    const message = renderNotification({
      type: 'line.renew',
      until,
      timeZone: 'Europe/Moscow',
      equipmentName: 'Автовышка 25 м',
      token,
    });
    expect(message.title).toBe('Продлить на 5 рабочих дней?');
    expect(message.body).toContain('Автовышка 25 м на линии до 30.10 (пт) включительно');
    expect(message.path).toBe(lineRenewPath(token));
    expect(message.path.startsWith('/line/prodlit?t=')).toBe(true);
    expect(eventChannels({ type: 'line.renew', until, equipmentName: 'x', token })).toEqual([
      'push',
      'telegram',
      'email',
    ]);
  });
});

describe('lineMatchesOrder — orders reach every machine on the line in range', () => {
  const now = new Date('2026-10-28T08:00:00Z');
  const line = {
    categoryId: 'cranes',
    lat: 55.74,
    lon: 52.4,
    live: false,
    standingForever: false,
    standingUntil: new Date('2026-11-03T20:59:59.999Z'),
  };
  const order = {
    categoryIds: ['cranes'],
    lat: 55.8,
    lon: 52.5,
    startDate: new Date('2026-10-30T06:00:00Z'),
  };

  it('matches a near machine of the category on the line on the start date', () => {
    expect(lineMatchesOrder(line, order, now)).toBe(true);
  });

  it('not another category, not far, not after the period, not without a point', () => {
    expect(lineMatchesOrder(line, { ...order, categoryIds: ['excavators'] }, now)).toBe(false);
    expect(lineMatchesOrder(line, { ...order, lat: 59.9, lon: 30.3 }, now)).toBe(false);
    expect(
      lineMatchesOrder(line, { ...order, startDate: new Date('2026-11-05T06:00:00Z') }, now),
    ).toBe(false);
    expect(lineMatchesOrder(line, { ...order, lat: null, lon: null }, now)).toBe(false);
  });

  it('«пока не отключу» covers any date; live GPS alone only today', () => {
    const later = { ...order, startDate: new Date('2026-12-01T06:00:00Z') };
    expect(
      lineMatchesOrder({ ...line, standingForever: true, standingUntil: null }, later, now),
    ).toBe(true);
    const live = { ...line, live: true, standingUntil: null };
    expect(lineMatchesOrder(live, { ...order, startDate: now }, now)).toBe(true);
    expect(lineMatchesOrder(live, order, now)).toBe(false);
  });
});
