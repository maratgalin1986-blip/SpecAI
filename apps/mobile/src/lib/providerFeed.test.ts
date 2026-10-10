import { describe, expect, it } from 'vitest';
import {
  bidTotal,
  bidsLeftText,
  countdownTickMs,
  customerDemandText,
  deliveryEstimate,
  isBidWindowOpen,
  offerParts,
  parseAmount,
} from './providerFeed';

const now = new Date('2026-10-08T09:00:00Z');
const inMinutes = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

describe('bid window', () => {
  it('is open until bidsUntil, and always without one', () => {
    expect(isBidWindowOpen({ bidsUntil: inMinutes(5) }, now)).toBe(true);
    expect(isBidWindowOpen({ bidsUntil: inMinutes(-1) }, now)).toBe(false);
    expect(isBidWindowOpen({ bidsUntil: null }, now)).toBe(true);
    expect(isBidWindowOpen({}, now)).toBe(true);
    expect(isBidWindowOpen({ bidsUntil: 'garbage' }, now)).toBe(true);
  });

  it('counts down in hours and minutes', () => {
    expect(bidsLeftText(inMinutes(80), now)).toBe('осталось 1 ч 20 мин');
    expect(bidsLeftText(inMinutes(120), now)).toBe('осталось 2 ч');
    expect(bidsLeftText(inMinutes(45), now)).toBe('осталось 45 мин');
    expect(bidsLeftText(inMinutes(30 * 60), now)).toBe('осталось 1 дн 6 ч');
    expect(bidsLeftText(inMinutes(-1), now)).toBeNull();
    expect(bidsLeftText(null, now)).toBeNull();
  });

  it('ticks faster near the end', () => {
    expect(countdownTickMs(inMinutes(60), now)).toBe(60_000);
    expect(countdownTickMs(inMinutes(5), now)).toBe(15_000);
    expect(countdownTickMs(inMinutes(-5), now)).toBeNull();
    expect(countdownTickMs(null, now)).toBeNull();
  });
});

describe('prices', () => {
  it('estimates the delivery from the distance and the price per km', () => {
    expect(deliveryEstimate(32.4, '80')).toBe(2592);
    expect(deliveryEstimate(32.4, 0)).toBe(0);
    expect(deliveryEstimate(null, 80)).toBeNull();
    expect(deliveryEstimate(10, null)).toBeNull();
    expect(deliveryEstimate(10, '')).toBeNull();
  });

  it('adds the delivery to the shifts', () => {
    expect(bidTotal(3000, 12000, 3)).toBe(39000);
    expect(bidTotal(0, 12000.5, 0)).toBe(12000.5);
  });

  it('parses typed amounts', () => {
    expect(parseAmount('12 000,50')).toBe(12000.5);
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
  });

  it('reads the breakdown of a bid', () => {
    expect(
      offerParts({ price: '39000', deliveryPrice: '3000', shiftPrice: '12000', shifts: 3 }),
    ).toEqual({ delivery: 3000, shiftPrice: 12000, shifts: 3, total: 39000 });
    expect(offerParts({ price: '36000', shiftPrice: '12000', shifts: 3 })).toMatchObject({
      delivery: 0,
    });
    expect(offerParts({ price: '36000' })).toBeNull();
    expect(offerParts({ price: '36000', shiftPrice: '12000' })).toBeNull();
  });
});

describe('customerDemandText', () => {
  it('matches the site wording', () => {
    expect(customerDemandText('high', 'Автокран')).toBe(
      'Свободных машин мало (автокран) — укажите дату заранее',
    );
    expect(customerDemandText(null)).toBe('Сейчас много свободных машин: техники');
  });
});
