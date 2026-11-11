import { describe, expect, it } from 'vitest';
import { LANDINGS, landingListRate } from './landings';
import { HAMMER_RATE, rateOf } from './prices';

describe('landingListRate', () => {
  it('a kind sold «с гидромолотом» is listed at the hammer rate', () => {
    const hammer = LANDINGS.filter((landing) => /гидромолот/i.test(landing.short));
    expect(hammer.length).toBeGreaterThan(0);
    for (const landing of hammer) expect(landingListRate(landing)).toBe(HAMMER_RATE);
  });

  it('every other kind keeps its machine’s list price', () => {
    for (const landing of LANDINGS.filter((item) => !/гидромолот/i.test(item.short))) {
      expect(landingListRate(landing)).toBe(rateOf(landing.machine));
    }
  });
});
