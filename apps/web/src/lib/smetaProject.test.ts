import { describe, expect, it } from 'vitest';
import { rateOf, RESERVE } from './smeta';
import {
  buildProject,
  LEAD_TEXT_MAX,
  normalizeInput,
  OBJECTS,
  projectText,
  projectView,
  visibleSceneCount,
  visibleStageCount,
  type ObjectType,
} from './smetaProject';

const house = {
  object: 'house',
  length: 10,
  width: 8,
  floors: 2,
  foundation: 'strip',
  soil: 'loam',
  haul: true,
  distance: 10,
} as const;

describe('buildProject stages', () => {
  it('plans a private house with a strip foundation from start to finish', () => {
    const p = buildProject(house);
    expect(p.stages.map((s) => s.id)).toEqual([
      'prep',
      'dig',
      'haul',
      'foundation',
      'backfill',
      'walls',
      'roof',
      'facade',
      'landscape',
    ]);
  });

  it.each([
    [
      'house',
      { foundation: 'slab' },
      ['prep', 'dig', 'haul', 'foundation', 'walls', 'roof', 'facade', 'landscape'],
    ],
    [
      'banya',
      {},
      ['prep', 'dig', 'haul', 'foundation', 'backfill', 'walls', 'roof', 'facade', 'landscape'],
    ],
    [
      'warehouse',
      {},
      ['prep', 'dig', 'haul', 'foundation', 'walls', 'roof', 'facade', 'landscape'],
    ],
    ['site', {}, ['prep', 'dig', 'haul', 'base', 'landscape']],
    ['strip', {}, ['prep', 'dig', 'haul', 'foundation', 'backfill']],
    ['strip', { haul: false }, ['prep', 'dig', 'foundation', 'backfill']],
  ] as const)('%s %o', (object, extra, ids) => {
    expect(buildProject({ object, ...extra }).stages.map((s) => s.id)).toEqual(ids);
  });

  it('uses only СпецПласт16 machines and the banya lifts with the KMU, the house with a crane', () => {
    expect(
      buildProject({ object: 'banya' }).stages.find((s) => s.id === 'walls')!.rows[0]!.machine,
    ).toBe('kmu');
    expect(buildProject(house).stages.find((s) => s.id === 'walls')!.rows[0]!.machine).toBe(
      'crane',
    );
  });
});

describe('hours and money', () => {
  it('takes every rate from the owner price list and sums the stages', () => {
    for (const object of Object.keys(OBJECTS) as ObjectType[]) {
      const p = buildProject({ object });
      let running = 0;
      for (const s of p.stages) {
        for (const r of s.rows) {
          expect(r.rate).toBe(rateOf(r.machine));
          expect(r.sum).toBe(r.hours * r.rate);
          expect(r.hours).toBeGreaterThanOrEqual(4);
        }
        running += s.cost;
        expect(s.cumulative).toBe(running);
        expect(s.days).toBeGreaterThan(0);
      }
      expect(p.total).toBe(running);
      expect(p.totalHigh).toBe(Math.round((p.total * RESERVE) / 100) * 100);
    }
  });

  it('works out the house 10×8, 2 floors from the norms', () => {
    const p = buildProject(house);
    const stage = (id: string) => p.stages.find((s) => s.id === id)!;
    // Strip 46 m × 0.8 × 1.5 = 55.2 m³ at 18 m³/h → 3.1 h → 4 h minimum.
    expect(p.geo.digVolume).toBe(55.2);
    expect(stage('dig').rows[0]).toMatchObject({ machine: 'backhoe', hours: 4 });
    // Surplus 35 m³ × 1.25 swell → 5 trips of 1 h (10 km each way at 40 km/h + loading).
    expect(p.geo.trips).toBe(5);
    expect(stage('haul').rows[1]).toMatchObject({
      machine: 'truck',
      hours: 5,
      sum: 5 * rateOf('truck'),
    });
    // 72 lifts × 12 min + 2 setups = 16.4 h → 17 h of crane.
    expect(stage('walls').rows[0]).toMatchObject({
      machine: 'crane',
      hours: 17,
      sum: 17 * rateOf('crane'),
    });
    // Facade 36 m × 6.5 m = 234 m² at 15 m²/h → 16 h of the platform.
    expect(stage('facade').rows[0]).toMatchObject({
      machine: 'agp',
      hours: 16,
      sum: 16 * rateOf('agp'),
    });
    expect(p.geo.concrete).toBe(33.1);
  });

  it('digs slower in clay than in sand', () => {
    const big = { object: 'warehouse', length: 60, width: 40 } as const;
    const clay = buildProject({ ...big, soil: 'clay' }).stages[1]!.rows[0]!.hours;
    const sand = buildProject({ ...big, soil: 'sand' }).stages[1]!.rows[0]!.hours;
    expect(clay).toBeGreaterThan(sand);
  });

  it('clamps inputs and floors to the object', () => {
    expect(normalizeInput({ object: 'banya', floors: 9 }).floors).toBe(2);
    expect(normalizeInput({ object: 'warehouse', floors: 3 }).floors).toBe(1);
    expect(normalizeInput({ object: 'strip', foundation: 'slab' }).foundation).toBe('strip');
    expect(normalizeInput({ length: -4 }).length).toBe(2);
  });
});

describe('partial and full', () => {
  it('shows about half of the stages with prices and hides the rest', () => {
    const p = buildProject(house);
    expect(visibleStageCount(p)).toBe(4);
    expect(visibleSceneCount(p)).toBe(3);
    const partial = projectView(p, false);
    expect(partial.open).toHaveLength(4);
    expect(partial.locked).toHaveLength(5);
    expect(partial.locked[0]).not.toHaveProperty('cost');
    expect(partial.totalFrom).toBe(p.total);
    expect(partial.totalHigh).toBeNull();
    expect(partial.materials).toBeNull();
    const full = projectView(p, true);
    expect(full.open).toHaveLength(9);
    expect(full.locked).toHaveLength(0);
    expect(full.totalHigh).toBe(p.totalHigh);
  });

  it('writes a text that fits the lead API and names СпецПласт16', () => {
    const big = buildProject({ ...house, floors: 3, length: 120, width: 60 });
    const text = projectText(big);
    expect(text.length).toBeLessThanOrEqual(LEAD_TEXT_MAX);
    expect(text).toContain('СпецПласт16');
    const partial = projectText(buildProject(house), false);
    expect(partial).toContain('от ');
    expect(partial).not.toContain('Фасад');
  });
});
