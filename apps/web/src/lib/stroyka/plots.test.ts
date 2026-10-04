import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDING, FENCE, type Box } from '@/lib/stroyka';
import { inside, placeSite, points, type CityData } from '@/lib/stroyka/city';
import { footprintOn, onOuterPlot, PLOTS } from '@/lib/stroyka/plots';
import { OUTER_PLOTS, PROJECT_TYPES } from '@/lib/stroyka/progress';

const city = JSON.parse(
  readFileSync(join(__dirname, '../../../public/stroyka/chelny-osm.json'), 'utf8'),
) as CityData;
const [ox, oz] = placeSite(city);
const ROAD_WIDTH = [4, 7, 10, 14];

const hits = (r: Box, x: number, z: number, pad: number) =>
  x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;
const overlap = (a: Box, b: Box, gap = 0) =>
  a.minX < b.maxX + gap && b.minX < a.maxX + gap && a.minZ < b.maxZ + gap && b.minZ < a.maxZ + gap;

describe('district plots', () => {
  it('has one plot per object slot, Кама on the site', () => {
    expect(PLOTS).toHaveLength(OUTER_PLOTS + 1);
    expect(footprintOn(0, 'housing')).toEqual(BUILDING);
    const p0 = PLOTS[0]!;
    expect(p0.minX).toBeGreaterThan(FENCE.minX);
    expect(p0.maxX).toBeLessThan(FENCE.maxX);
    expect(p0.minZ).toBeGreaterThan(FENCE.minZ);
    expect(p0.maxZ).toBeLessThan(FENCE.maxZ);
  });

  it('never overlap each other, and stay off the site and the gate approach', () => {
    for (let i = 0; i < PLOTS.length; i++)
      for (let j = i + 1; j < PLOTS.length; j++)
        expect(overlap(PLOTS[i]!, PLOTS[j]!, 4), `plots ${i} and ${j}`).toBe(false);
    const site: Box = {
      minX: FENCE.minX - 10,
      maxX: FENCE.maxX + 10,
      minZ: FENCE.minZ - 10,
      maxZ: FENCE.maxZ + 12,
    };
    for (let i = 1; i < PLOTS.length; i++) {
      expect(overlap(PLOTS[i]!, site), `plot ${i} vs site`).toBe(false);
      // Inside the city clearing and the fog distance.
      const p = PLOTS[i]!;
      expect(Math.hypot((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2)).toBeLessThan(300);
    }
  });

  it('fit every kind of building with room for the yard', () => {
    for (let i = 1; i < PLOTS.length; i++)
      for (const t of PROJECT_TYPES) {
        const f = footprintOn(i, t.key);
        const p = PLOTS[i]!;
        expect(f.minX).toBeGreaterThanOrEqual(p.minX + 3);
        expect(f.maxX).toBeLessThanOrEqual(p.maxX - 3);
        expect(f.minZ).toBeGreaterThanOrEqual(p.minZ + 3);
        expect(p.maxZ - f.maxZ).toBeGreaterThanOrEqual(12);
      }
    expect(onOuterPlot(110, 30)).toBe(true);
    expect(onOuterPlot(0, 0)).toBe(false);
  });

  it('do not touch the real roads, buildings, parks or water around the site', () => {
    const bad: string[] = [];
    for (let i = 1; i < PLOTS.length; i++) {
      const plot = PLOTS[i]!;
      const near = (x: number, z: number) => hits(plot, x, z, 60);
      for (const r of city.r) {
        const pts = points(r).map(([x, z]) => [x + ox, z + oz] as const);
        const half = ROAD_WIDTH[Number(r[0])]! / 2;
        for (let k = 0; k + 1 < pts.length; k++) {
          const [ax, az] = pts[k]!;
          const [bx, bz] = pts[k + 1]!;
          const len = Math.hypot(bx - ax, bz - az);
          if (!near(ax, az) && !near(bx, bz) && len < 100) continue;
          for (let t = 0; t <= len; t += 1) {
            const x = ax + ((bx - ax) * t) / Math.max(len, 1e-6);
            const z = az + ((bz - az) * t) / Math.max(len, 1e-6);
            if (hits(plot, x, z, half + 2))
              bad.push(`plot ${i}: road at ${x.toFixed(0)}, ${z.toFixed(0)}`);
          }
        }
      }
      const c: [number, number] = [(plot.minX + plot.maxX) / 2, (plot.minZ + plot.maxZ) / 2];
      for (const poly of [...city.b.map((b) => points(b)), ...city.a.map((a) => points(a))]) {
        const moved = poly.map(([x, z]) => [x + ox, z + oz] as [number, number]);
        for (const [x, z] of moved)
          if (hits(plot, x, z, 2)) bad.push(`plot ${i}: footprint at ${x}, ${z}`);
        if (inside(c, moved)) bad.push(`plot ${i}: inside an area`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
