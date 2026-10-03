import { describe, expect, it } from 'vitest';
import { BOUNDS, ZONES } from '@/lib/stroyka';
import {
  clampToBounds,
  easeInOut,
  NAV_PEOPLE,
  NAV_PLACES,
  NAV_SIGHTS,
  turnBetween,
} from './navTargets';

describe('«Куда идём?» targets', () => {
  it('offers every zone as a place', () => {
    expect(NAV_PLACES.map((p) => p.id)).toEqual(ZONES.map((z) => z.id));
    expect(NAV_PLACES).toHaveLength(9);
    for (const p of NAV_PLACES) expect(p.icon).toBeTruthy();
  });

  it('lists the named characters at their zones and the crew', () => {
    const names = NAV_PEOPLE.map((p) => p.name);
    for (const n of ['Михалыч', 'Ринат', 'Ильдар', 'Света', 'Алсу']) expect(names).toContain(n);
    for (const p of NAV_PEOPLE.filter((x) => x.speaker !== 'worker')) {
      const zone = ZONES.find((z) => z.id === p.zone)!;
      expect(zone.speaker).toBe(p.speaker);
      expect(p.id).toBe(`npc-${zone.id}`);
    }
    expect(NAV_PEOPLE.filter((p) => p.speaker === 'worker').length).toBeGreaterThanOrEqual(4);
  });

  it('keeps sights inside the site', () => {
    expect(NAV_SIGHTS.map((s) => s.id)).toEqual(['crane', 'excavator', 'led', 'flags', 'top']);
    for (const { target } of NAV_SIGHTS) {
      expect(clampToBounds(target.x, target.z)).toEqual([target.x, target.z]);
    }
  });

  it('clamps far taps to the bounds', () => {
    expect(clampToBounds(500, -500)).toEqual([BOUNDS.maxX, BOUNDS.minZ]);
  });

  it('eases in and out', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(2)).toBe(1);
  });

  it('turns the short way round', () => {
    expect(turnBetween(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(turnBetween(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});
