import { describe, expect, it } from 'vitest';
import {
  countNearbyOrders,
  DEMAND_NUDGE_PATH,
  demandNudgeDue,
  demandNudgeText,
  inDemandWindow,
  mskDayStart,
} from './demandNudge';
import { renderNotification } from './notifications/routing';

describe('demandNudgeText', () => {
  it.each([
    [1, 'Сегодня 1 заявка рядом'],
    [2, 'Сегодня 2 заявки рядом'],
    [5, 'Сегодня 5 заявок рядом'],
    [11, 'Сегодня 11 заявок рядом'],
    [21, 'Сегодня 21 заявка рядом'],
    [22, 'Сегодня 22 заявки рядом'],
  ])('%i → «%s»', (count, title) => {
    expect(demandNudgeText(count).title).toBe(title);
  });

  it('asks to go on the line', () => {
    expect(demandNudgeText(3).body).toBe(
      'Выйдите на линию — заказчики видят свободные машины на карте и пишут первым.',
    );
  });

  it('is the «demand.today» notification and leads to the open orders', () => {
    expect(renderNotification({ type: 'demand.today', count: 4 })).toEqual({
      title: 'Сегодня 4 заявки рядом',
      body: demandNudgeText(4).body,
      path: DEMAND_NUDGE_PATH,
    });
    expect(DEMAND_NUDGE_PATH).toBe('/orders');
  });
});

describe('the Moscow day', () => {
  it('starts at 00:00 Moscow time (21:00 UTC the day before)', () => {
    expect(mskDayStart(new Date('2026-10-23T20:59:59Z')).toISOString()).toBe(
      '2026-10-22T21:00:00.000Z',
    );
    expect(mskDayStart(new Date('2026-10-23T21:00:00Z')).toISOString()).toBe(
      '2026-10-23T21:00:00.000Z',
    );
  });

  it('is due when never sent or sent before today’s Moscow midnight', () => {
    const now = new Date('2026-10-23T06:00:00Z'); // 09:00 MSK
    expect(demandNudgeDue(null, now)).toBe(true);
    expect(demandNudgeDue(undefined, now)).toBe(true);
    expect(demandNudgeDue(new Date('2026-10-22T20:59:59Z'), now)).toBe(true); // 23:59:59 MSK yesterday
    expect(demandNudgeDue(new Date('2026-10-22T21:00:00Z'), now)).toBe(false); // 00:00 MSK today
  });

  it('counts the Moscow day, not the UTC one', () => {
    // 01:00 MSK on 23 October is still 22 October in UTC: the same Moscow day.
    expect(demandNudgeDue(new Date('2026-10-22T22:00:00Z'), new Date('2026-10-23T15:00:00Z'))).toBe(
      false,
    );
    // 23:30 MSK, then 00:30 MSK the next day: a new Moscow day, same UTC day.
    expect(demandNudgeDue(new Date('2026-10-23T20:30:00Z'), new Date('2026-10-23T21:30:00Z'))).toBe(
      true,
    );
  });
});

describe('inDemandWindow', () => {
  it.each([
    ['2026-10-23T05:59:59Z', false], // 08:59:59 MSK
    ['2026-10-23T06:00:00Z', true], // 09:00 MSK
    ['2026-10-23T07:30:00Z', true], // 10:30 MSK
    ['2026-10-23T08:59:59Z', true], // 11:59:59 MSK
    ['2026-10-23T09:00:00Z', false], // 12:00 MSK
    ['2026-10-23T17:00:00Z', false], // 20:00 MSK
    ['2026-10-23T21:30:00Z', false], // 00:30 MSK
  ])('%s → %s', (iso, expected) => {
    expect(inDemandWindow(new Date(iso))).toBe(expected);
  });
});

describe('countNearbyOrders', () => {
  // A provider with an excavator, based in Казань, the default 150 km radius.
  const provider = {
    categoryIds: ['excavators'],
    baseLat: 55.7963,
    baseLon: 49.1088,
    baseAddress: 'Казань, ул. Тихорецкая, 5',
  };

  it('counts the orders the new-order alert would bring it', () => {
    const orders = [
      { categoryId: 'excavators', lat: 55.8, lon: 49.2 }, // Казань
      { categoryId: 'excavators', categoryIds: ['excavators', 'mini'], lat: 55.75, lon: 52.4 }, // Набережные Челны, ~210 km away
      { categoryId: 'cranes', lat: 55.8, lon: 49.2 }, // another machine type
      { categoryId: 'excavators', lat: 43.1, lon: 131.9 }, // Владивосток
      { categoryId: 'excavators', city: 'Казань' }, // only the city, named by the base address
      { categoryId: 'excavators', city: 'Бугульма' }, // only a city the provider is not in
      { categoryId: 'excavators' }, // no place at all
    ];
    expect(countNearbyOrders(provider, orders)).toBe(2);
  });

  it('is 0 without orders or without machinery', () => {
    expect(countNearbyOrders(provider, [])).toBe(0);
    expect(
      countNearbyOrders({ ...provider, categoryIds: [] }, [
        { categoryId: null, lat: 55.8, lon: 49.2 },
      ]),
    ).toBe(0);
  });
});
