// Plots of the district: where each object of the timeline stands. Plot 0 is
// the site inside the fence (ЖК «Кама»); the others are free land around it,
// found against the real OSM city (scripts in the PR notes): no roads, no
// buildings, parks or water within 3 m of a road edge, and clear of the site
// fence, the gate approach and the opening fly-over. plots.test.ts checks it
// against public/stroyka/chelny-osm.json. Scene metres, north = −z.

import { BUILDING, type Box } from '@/lib/stroyka';
import { OUTER_PLOTS, type ObjectKind } from '@/lib/stroyka/progress';

/** The whole plot of each object (building, yard and landscaping). */
export const PLOTS: Box[] = [
  // 0: ЖК «Кама», the plot inside the site with its landscaping ring.
  {
    minX: BUILDING.minX - 4,
    maxX: BUILDING.maxX + 4,
    minZ: BUILDING.minZ - 4,
    maxZ: BUILDING.maxZ + 5,
  },
  // 1: south of the gate, across the access road.
  { minX: -40, maxX: 8, minZ: 78, maxZ: 118 },
  // 2–5: east of the site, beyond the street along the fence; one far south.
  { minX: 90, maxX: 130, minZ: 11, maxZ: 59 },
  { minX: 138, maxX: 178, minZ: -4, maxZ: 44 },
  { minX: 21, maxX: 61, minZ: 134, maxZ: 182 },
  { minX: 138, maxX: 178, minZ: 50, maxZ: 98 },
  // 6–8: the far ones, across the big streets (built from the 2030s on).
  { minX: 195, maxX: 235, minZ: -115, maxZ: -67 },
  { minX: 74, maxX: 122, minZ: -267, maxZ: -227 },
  { minX: 2, maxX: 50, minZ: -285, maxZ: -245 },
];

if (PLOTS.length !== OUTER_PLOTS + 1) throw new Error('PLOTS and OUTER_PLOTS disagree');

/** Building footprint (width along x × depth along z) per kind. */
export const FOOTPRINT: Record<ObjectKind, [number, number]> = {
  housing: [20, 14],
  kindergarten: [28, 12],
  school: [32, 14],
  sport: [30, 20],
  clinic: [26, 14],
};

/**
 * The building's footprint on a plot: on plot 0 it is BUILDING; elsewhere it
 * is centred across the plot and set back from its north edge, the entrance
 * facing south (+z) toward the yard — for the school the stadium is south.
 */
export function footprintOn(plot: number, kind: ObjectKind): Box {
  if (plot === 0) return BUILDING;
  const p = PLOTS[plot]!;
  const [w, d] = FOOTPRINT[kind];
  const cx = Math.round((p.minX + p.maxX) / 2);
  const minX = cx - w / 2;
  const minZ = p.minZ + 6;
  return { minX, maxX: minX + w, minZ, maxZ: minZ + d };
}

/** Whether (x, z) is on any outer plot (with a margin) — trees and props avoid them. */
export function onOuterPlot(x: number, z: number, margin = 0): boolean {
  for (let i = 1; i < PLOTS.length; i++) {
    const p = PLOTS[i]!;
    if (x > p.minX - margin && x < p.maxX + margin && z > p.minZ - margin && z < p.maxZ + margin)
      return true;
  }
  return false;
}
