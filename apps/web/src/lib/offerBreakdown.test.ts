import { describe, expect, it } from 'vitest';
import { bidSumMatches, bidTotal, offerBreakdown, orderDays } from './offerBreakdown';

const start = new Date('2026-10-10T00:00:00Z');
const end = new Date('2026-10-12T00:00:00Z');

describe('orderDays', () => {
  it('counts both ends', () => {
    expect(orderDays(start, end)).toBe(3);
    expect(orderDays(start, start)).toBe(1);
    expect(orderDays(end, start)).toBe(1);
  });
});

describe('offerBreakdown', () => {
  it('derives the price per day and the card rates', () => {
    const parts = offerBreakdown('36000', start, end, { hourlyRate: '1500', dailyRate: '12000' });
    expect(parts).toMatchObject({
      total: 36000,
      days: 3,
      perDay: 12000,
      cardHour: 1500,
      cardShift: 12000,
      delivery: null,
      shiftPrice: null,
      shifts: null,
      optionsNote: null,
    });
  });

  it("keeps the provider's own breakdown when it is complete", () => {
    const parts = offerBreakdown(
      39000,
      start,
      end,
      { dailyRate: '12000' },
      {
        deliveryPrice: '3000',
        shiftPrice: '12000',
        shifts: 3,
        optionsNote: ' гидромолот ',
      },
    );
    expect(parts).toMatchObject({
      delivery: 3000,
      shiftPrice: 12000,
      shifts: 3,
      optionsNote: 'гидромолот',
    });
    // A free delivery is a value, not «unknown».
    expect(
      offerBreakdown(36000, start, end, {}, { deliveryPrice: 0, shiftPrice: 12000, shifts: 3 })
        .delivery,
    ).toBe(0);
    // Half a breakdown is no breakdown.
    expect(offerBreakdown(36000, start, end, {}, { shiftPrice: 12000 })).toMatchObject({
      shiftPrice: null,
      shifts: null,
    });
  });
});

describe('bidTotal and bidSumMatches', () => {
  it('adds the delivery to the shifts', () => {
    expect(bidTotal(3000, 12000, 3)).toBe(39000);
    expect(bidTotal(null, 12000.5, 2)).toBe(24001);
  });

  it('accepts a rouble of rounding and no breakdown at all', () => {
    expect(bidSumMatches(39000, { deliveryPrice: 3000, shiftPrice: 12000, shifts: 3 })).toBe(true);
    expect(bidSumMatches(39001, { deliveryPrice: 3000, shiftPrice: 12000, shifts: 3 })).toBe(true);
    expect(bidSumMatches(40000, { deliveryPrice: 3000, shiftPrice: 12000, shifts: 3 })).toBe(false);
    expect(bidSumMatches(40000, { deliveryPrice: 3000 })).toBe(true);
    expect(bidSumMatches(40000, {})).toBe(true);
  });
});
