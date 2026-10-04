import { describe, expect, it } from 'vitest';
import { BOUNDS, BUILDING, ZONES } from '@/lib/stroyka';
import { footprintOn } from '@/lib/stroyka/plots';
import {
  aimCurrentObject,
  clampToBounds,
  CURRENT_OBJECT,
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
    expect(NAV_SIGHTS.map((s) => s.id)).toEqual([
      'current',
      'crane',
      'excavator',
      'led',
      'flags',
      'top',
    ]);
    for (const { target } of NAV_SIGHTS) {
      expect(clampToBounds(target.x, target.z)).toEqual([target.x, target.z]);
    }
  });

  it('aims «текущий объект» at the object on its plot', () => {
    // ЖК «Кама» inside the site: from the south, looking at the building.
    const kama = aimCurrentObject(BUILDING, 68);
    expect(NAV_SIGHTS[0]).toBe(CURRENT_OBJECT);
    expect(CURRENT_OBJECT.target).toBe(kama);
    expect(kama.z).toBeGreaterThan(BUILDING.maxZ);
    expect(kama.look[0]).toBe((BUILDING.minX + BUILDING.maxX) / 2);
    // The school on plot 2, east of the site: from the east edge, lifted.
    const box = footprintOn(2, 'school');
    const school = aimCurrentObject(box, 16);
    expect(clampToBounds(school.x, school.z)).toEqual([school.x, school.z]);
    expect(school.x).toBe(BOUNDS.maxX);
    expect(school.look[0]).toBe((box.minX + box.maxX) / 2);
    expect(school.lift).toBeGreaterThanOrEqual(10);
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
