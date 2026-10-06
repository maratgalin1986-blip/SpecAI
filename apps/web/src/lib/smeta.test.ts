import { describe, expect, it } from 'vitest';
import {
  billableHours,
  buildSmeta,
  CRANE_HEAVY_RATE,
  MIN_HOURS,
  SMETA_JOBS,
  smetaText,
} from './smeta';

describe('buildSmeta', () => {
  it('has a result for every job with the default values', () => {
    for (const job of SMETA_JOBS) {
      const smeta = buildSmeta(job.id);
      expect(smeta?.rows.length).toBeGreaterThan(0);
      expect(smeta!.total).toBeGreaterThan(0);
      expect(smeta!.totalHigh).toBeGreaterThanOrEqual(smeta!.total);
    }
  });

  it('prices a trench with the backhoe at 4000 ₽/h and the minimum booking', () => {
    const smeta = buildSmeta('trench', {
      length: 10,
      width: 0.5,
      depth: 1,
      options: { backfill: false },
    })!;
    expect(smeta.rows).toHaveLength(1);
    expect(smeta.rows[0]).toMatchObject({
      machine: 'backhoe',
      hours: MIN_HOURS,
      rate: 4000,
      sum: 16000,
    });
  });

  it('switches to the crawler excavator and adds dump trucks for a big pit', () => {
    const smeta = buildSmeta('pit', { length: 20, width: 15, depth: 2 })!; // 600 m³
    expect(smeta.rows.map((r) => r.machine)).toEqual(['excavator', 'truck']);
    expect(smeta.rows[0]!.hours).toBe(14); // 600 / 45 = 13.3
    expect(smeta.rows[1]!.rate).toBe(3300);
  });

  it('uses the hammer rate for demolition and the 32 t crane for heavy lifts', () => {
    expect(buildSmeta('demolition')!.rows[0]!.rate).toBe(4500);
    expect(buildSmeta('lift', { weight: 12 })!.rows[0]!.rate).toBe(CRANE_HEAVY_RATE);
    expect(buildSmeta('lift', { weight: 3 })!.rows[0]!.rate).toBe(4500);
    expect(buildSmeta('height')!.rows[0]!.rate).toBe(3500);
  });

  it('clamps values to the field limits and rejects unknown jobs', () => {
    expect(buildSmeta('trench', { length: -5 })!.total).toBeGreaterThan(0);
    expect(buildSmeta('nope')).toBeNull();
  });
});

describe('helpers', () => {
  it('rounds hours up with a minimum', () => {
    expect(billableHours(0.5)).toBe(MIN_HOURS);
    expect(billableHours(6.2)).toBe(7);
    expect(billableHours(5)).toBe(5);
  });
  it('writes the estimate as text for the dispatcher', () => {
    const text = smetaText(buildSmeta('pit')!, {});
    expect(text).toContain('Примерная смета СпецПласт16');
    expect(text).toContain('Итого примерно');
  });
});
