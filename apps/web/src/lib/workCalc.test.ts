import { describe, expect, it } from 'vitest';
import { LANDINGS } from './landings';
import { rateOf } from './prices';
import { landingIndex, workCost, WORKS } from './workCalc';

describe('work calculator', () => {
  it('maps every kind of work to a machine with a landing', () => {
    for (const w of WORKS) expect(landingIndex(w.machine), w.id).toBeGreaterThanOrEqual(0);
    expect(LANDINGS.length).toBeLessThan(100); // fits calc_<2 digits>
  });

  it('computes hours × the rate from prices.ts', () => {
    expect(workCost('truck', 8)).toEqual({ rate: 3300, hours: 8, total: 26400 });
    expect(workCost('crane', 4).total).toBe(rateOf('crane') * 4);
  });
});
