// The real city of Набережные Челны around the site, in blocks: OSM building
// footprints extruded by their levels, roads with lane dashes, parks, water
// and construction areas (shown neutrally, never as our projects).
// Data © участники OpenStreetMap (ODbL).
import * as THREE from 'three';
import { centroid, footprintRuns, points, type CityData, type Pt } from '@/lib/stroyka/city';
import { Voxels } from './kit';
import { DISTRICT_SLOTS } from './project';

const FACADES = [0xcfc8bd, 0xd9d2c3, 0xbfc5cc, 0xe0d6c4, 0xb9b2a6, 0xc8bba8, 0xa9b4bf];
const ROAD_WIDTH = [4, 7, 10, 14];
const AREA_COLOR: Record<string, number> = {
  park: 0x4f7a34,
  pitch: 0x3f8a3a,
  forest: 0x355e2a,
  water: 0x3b6e99,
  construction: 0xb59a6a,
};

const SITE = { x: 72, zMin: -76, zMax: 84 };

function excluded(x: number, z: number, pad = 0) {
  if (Math.abs(x) < SITE.x + pad && z > SITE.zMin - pad && z < SITE.zMax + pad) return true;
  return DISTRICT_SLOTS.some(
    ([sx, sz]) => Math.abs(x - sx) < 24 + pad && Math.abs(z - sz) < 18 + pad,
  );
}

export function buildCity(data: CityData, offset: Pt, voxelMat: THREE.Material, mobile: boolean) {
  const group = new THREE.Group();
  const blocks = new Voxels();
  const lit = new Voxels();
  const flat = new Voxels();
  const cell = mobile ? 3 : 2;
  const maxDist = mobile ? 520 : 820;
  const budget = mobile ? 4500 : 11000;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // Buildings, nearest first, until the budget is used.
  const list = data.b
    .map((b) => {
      const pts = points(b).map(([x, z]) => [x + offset[0], z + offset[1]] as Pt);
      const c = centroid(pts);
      return { levels: Number(b[0]), pts, c, d: Math.hypot(c[0], c[1]) };
    })
    .filter((b) => b.d < maxDist && !excluded(b.c[0], b.c[1], 4))
    .sort((a, b) => a.d - b.d);
  for (const b of list) {
    if (blocks.count > budget) break;
    const h = Math.max(3, b.levels * 3);
    const color = FACADES[Math.floor(rand() * FACADES.length)]!;
    if (b.d > 380) {
      // Far away: one block for the whole footprint.
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of b.pts) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      blocks.add((minX + maxX) / 2, h / 2, (minZ + maxZ) / 2, color, maxX - minX, h, maxZ - minZ);
      continue;
    }
    const runs = footprintRuns(b.pts, cell);
    let widest = runs[0]!;
    for (const run of runs) {
      blocks.add((run[0] + run[1]) / 2, h / 2, run[2] + cell / 2, color, run[1] - run[0], h, cell);
      if (run[1] - run[0] > widest[1] - widest[0]) widest = run;
    }
    // Lit windows at night: a few floors of the widest part glow.
    if (b.levels >= 2 && b.d < 460) {
      for (let k = 0; k < b.levels; k++) {
        if (rand() > 0.35) continue;
        lit.add(
          (widest[0] + widest[1]) / 2,
          k * 3 + 1.7,
          widest[2] + cell / 2,
          0xffc46b,
          widest[1] - widest[0] + 0.25,
          0.9,
          cell + 0.25,
        );
      }
    }
  }

  // Roads: dark strips, dashed lanes on the big ones.
  for (const r of data.r) {
    const cls = Number(r[0]);
    const pts = points(r).map(([x, z]) => [x + offset[0], z + offset[1]] as Pt);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5 || Math.hypot(mx, mz) > maxDist || excluded(mx, mz)) continue;
      const rot = -Math.atan2(bz - az, bx - ax);
      flat.add(
        mx,
        0.03 + cls * 0.002,
        mz,
        cls ? 0x34383e : 0x5b5f66,
        len + ROAD_WIDTH[cls]! * 0.5,
        0.06,
        ROAD_WIDTH[cls]!,
        rot,
      );
      if (cls >= 2 && !mobile) {
        const n = Math.floor(len / 9);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          flat.add(ax + (bx - ax) * t, 0.07, az + (bz - az) * t, 0xe5e7eb, 3, 0.02, 0.25, rot);
        }
      }
    }
  }

  // Parks, pitches, forest, water, construction areas.
  let biggestConstruction: { c: Pt; size: number } | null = null;
  for (const a of data.a) {
    const kind = String(a[0]);
    const pts = points(a).map(([x, z]) => [x + offset[0], z + offset[1]] as Pt);
    const c = centroid(pts);
    if (Math.hypot(c[0], c[1]) > maxDist || excluded(c[0], c[1])) continue;
    const runs = footprintRuns(pts, 8);
    for (const run of runs)
      flat.add(
        (run[0] + run[1]) / 2,
        0.02,
        run[2] + 4,
        AREA_COLOR[kind] ?? 0x4f7a34,
        run[1] - run[0],
        0.04,
        8,
      );
    if (kind === 'forest' || kind === 'park')
      for (const run of runs)
        if (rand() < 0.25) {
          const x = run[0] + rand() * (run[1] - run[0]);
          const z = run[2] + rand() * 8;
          blocks.add(x, 1, z, 0x5b3d22, 0.6, 2, 0.6);
          blocks.add(x, 2.8, z, 0x3f6a2a, 2.6, 2, 2.6);
        }
    if (kind === 'construction' && runs.length > (biggestConstruction?.size ?? 0))
      biggestConstruction = { c, size: runs.length };
  }
  // A neutral city crane over the biggest real construction area (no labels, no owners).
  if (biggestConstruction) {
    const [x, z] = biggestConstruction.c;
    blocks.add(x, 18, z, 0xd1a23a, 1.4, 36, 1.4);
    blocks.add(x + 9, 36.5, z, 0xd1a23a, 26, 1, 1);
    blocks.add(x - 5, 35.8, z, 0x374151, 3, 2, 2);
  }

  const built = blocks.build(voxelMat, { cast: false, receive: true });
  const litBuilt = lit.build(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), {
    cast: false,
    receive: false,
  });
  const flatBuilt = flat.build(new THREE.MeshLambertMaterial({ color: 0xffffff }), {
    cast: false,
    receive: true,
  });
  group.add(built.mesh, litBuilt.mesh, flatBuilt.mesh);
  return { group, lit: litBuilt.mesh, instances: blocks.count + flat.count + lit.count };
}
