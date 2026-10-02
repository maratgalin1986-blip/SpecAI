// The real city under the site: OpenStreetMap data (© участники OpenStreetMap,
// ODbL) prepared at development time by scripts/fetch-osm-chelny.mjs. Pure
// helpers: where our site sits in the city, and footprints → voxel runs.

export interface CityData {
  attribution: string;
  origin: [number, number];
  halfSize: number;
  /** [levels, x1, z1, x2, z2, …] in metres from the origin (north = −z). */
  b: number[][];
  /** [class 0–3, x1, z1, …] polylines. */
  r: number[][];
  /** [kind, x1, z1, …] polygons: park, pitch, forest, water, construction. */
  a: (string | number)[][];
}

export type Pt = [number, number];

export function points(flat: (string | number)[], from = 1): Pt[] {
  const out: Pt[] = [];
  for (let i = from; i + 1 < flat.length; i += 2) out.push([Number(flat[i]), Number(flat[i + 1])]);
  return out;
}

export function centroid(pts: Pt[]): Pt {
  let x = 0;
  let z = 0;
  for (const [px, pz] of pts) {
    x += px;
    z += pz;
  }
  return [x / pts.length, z / pts.length];
}

export function inside([x, z]: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** Half-size of the area our site and its district need to be free of buildings. */
export const SITE_CLEARANCE = { x: 105, z: 105 };

/**
 * Where our site's centre goes in the city: a real construction plot if one is
 * free enough, else the free spot nearest to the origin. Returns the city
 * offset to apply (city point + offset = scene point).
 */
export function placeSite(data: CityData): Pt {
  const centres = data.b.map((b) => centroid(points(b)));
  const free = ([cx, cz]: Pt) =>
    !centres.some(
      ([x, z]) => Math.abs(x - cx) < SITE_CLEARANCE.x && Math.abs(z - cz) < SITE_CLEARANCE.z,
    );
  const plots = data.a
    .filter((a) => a[0] === 'construction')
    .map((a) => centroid(points(a)))
    .sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
  for (const plot of plots) if (free(plot)) return [-plot[0], -plot[1]];
  let best: Pt | null = null;
  const limit = data.halfSize - SITE_CLEARANCE.x;
  for (let r = 0; r <= limit && !best; r += 30)
    for (let a = 0; a < 16 && !best; a++) {
      const p: Pt = [Math.cos((a / 16) * Math.PI * 2) * r, Math.sin((a / 16) * Math.PI * 2) * r];
      if (free(p)) best = p;
    }
  return best ? [-best[0], -best[1]] : [0, 0];
}

/**
 * A footprint on a grid of `cell` metres as row runs: [x0, x1, z] boxes whose
 * cells' centres are inside the polygon. Few boxes per building.
 */
export function footprintRuns(poly: Pt[], cell: number): [number, number, number][] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const runs: [number, number, number][] = [];
  const x0 = Math.floor(minX / cell) * cell;
  for (let z = Math.floor(minZ / cell) * cell; z < maxZ; z += cell) {
    let start: number | null = null;
    for (let x = x0; x <= maxX + cell; x += cell) {
      const hit = x < maxX && inside([x + cell / 2, z + cell / 2], poly);
      if (hit && start === null) start = x;
      if (!hit && start !== null) {
        runs.push([start, x, z]);
        start = null;
      }
    }
  }
  if (!runs.length) runs.push([minX, Math.max(maxX, minX + cell), minZ]);
  return runs;
}
