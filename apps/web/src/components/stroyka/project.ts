// The object under construction on the plot, and the finished ones around
// the site. Built from 1 m blocks, deterministically from the project type
// and its progress, in build order, so a time-lapse can reveal it.
import * as THREE from 'three';
import { BUILDING, DOOR } from '@/lib/stroyka';
import type { ProjectType, WorldProgress } from '@/lib/stroyka/progress';
import { node, Rig, Voxels, type Materials } from './kit';

const FLOOR_H = 4;

const FACADE: Record<ProjectType['key'], { wall: number; accent: number; glass: number }> = {
  housing: { wall: 0xe7d3b5, accent: 0xb5653d, glass: 0x5b7fa6 },
  warehouse: { wall: 0x8ea1b5, accent: 0x2f4f7a, glass: 0x6f8fb0 },
  school: { wall: 0xf1e3a6, accent: 0xd06a3a, glass: 0x5f86ab },
  mall: { wall: 0xd7dde4, accent: 0x2e8ec9, glass: 0x4d8fc7 },
};

export interface ProjectBuild {
  group: THREE.Group;
  mesh: THREE.InstancedMesh;
  lit: THREE.InstancedMesh;
  /** Instances in the main mesh. */
  total: number;
  /** Height of the highest block (for the tower crane). */
  height: number;
  hasWalls: boolean;
  /** Where fireworks go (handover stage), or null. */
  celebration: boolean;
}

/** Blocks of the object for this progress. */
export function buildProject(
  M: Materials,
  p: WorldProgress,
  voxelMat: THREE.Material,
  mobile: boolean,
): ProjectBuild {
  const v = new Voxels();
  const lit = new Voxels();
  const group = new THREE.Group();
  const colors = FACADE[p.projectType];
  const s = p.stage;
  const f = p.stagePercent / 100;
  const { minX, maxX, minZ, maxZ } = BUILDING;
  const W = maxX - minX;
  const D = maxZ - minZ;
  const concrete = 0xb4aea6;
  const shade = (hex: number, i: number) =>
    new THREE.Color(hex).multiplyScalar(0.94 + ((i * 7919) % 13) / 100);
  let n = 0;
  const add = (x: number, y: number, z: number, hex: number, sx = 1, sy = 1, sz = 1) =>
    v.add(x, y, z, shade(hex, n++), sx, sy, sz);
  const edge = (x: number, z: number) =>
    x === minX || x === maxX - 1 || z === minZ || z === maxZ - 1;

  // --- 1–2. Pit, then foundation. The plot ground is ours (the terrain skips it).
  if (s === 0) {
    const depth = 1 + Math.round(f * 3);
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++) {
        if (edge(x, z)) {
          for (let y = -depth; y < 0; y++) add(x + 0.5, y + 0.5, z + 0.5, 0x7a5434);
        } else add(x + 0.5, -depth - 0.5, z + 0.5, 0x5e4129);
      }
  } else if (s === 1) {
    const cells = (W - 2) * (D - 2);
    let k = 0;
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++) {
        if (edge(x, z)) {
          for (let y = -2; y < 0; y++) add(x + 0.5, y + 0.5, z + 0.5, 0x7a5434);
          continue;
        }
        add(x + 0.5, -2.5, z + 0.5, 0x5e4129);
        const poured = k++ / cells < f * 2;
        const top = k / cells < f * 2 - 1;
        if (poured) add(x + 0.5, -1.5, z + 0.5, concrete);
        else if ((x + z) % 2 === 0) add(x + 0.5, -1.4, z + 0.5, 0x333333, 1, 0.08, 0.1);
        if (top) add(x + 0.5, -0.5, z + 0.5, concrete);
      }
  } else {
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++) add(x + 0.5, -0.5, z + 0.5, 0x9b968f);
  }

  // Walkway (мостки) to look into the pit while there is no floor.
  if (s < 2) {
    for (let z = maxZ - 1; z > -30; z--) {
      for (let x = 22; x < 26; x++) add(x + 0.5, -0.07, z + 0.5, 0x9a6a33, 1, 0.14, 1);
      if ((maxZ - z) % 2 === 0)
        for (const x of [22, 25.9]) add(x, 0.55, z + 0.5, 0xf59e0b, 0.1, 1.1, 0.1);
    }
  }

  // --- 3. Frame, floor by floor (ground floor gets its walls with the frame).
  const floors = s < 2 ? 0 : s === 2 ? p.floorsBuilt : p.floors;
  const columnAt = (x: number, z: number) =>
    ((x - minX) % 4 === 0 || x === maxX - 1) && ((z - minZ) % 4 === 0 || z === maxZ - 1);
  const windowAt = (x: number, z: number, y: number) =>
    y >= 1 && y <= 2 && (x + z) % 3 !== 0 && !columnAt(x, z);
  for (let k = 0; k < floors; k++) {
    const y0 = k * FLOOR_H;
    const partial = s === 2 && k === floors - 1 ? f * p.floors - Math.floor(f * p.floors) : 1;
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++) {
        const isEdge = edge(x, z);
        if (columnAt(x, z))
          for (let y = 0; y < 3; y++) add(x + 0.5, y0 + y + 0.5, z + 0.5, concrete);
        else if (k === 0 && isEdge) {
          for (let y = 0; y < 3; y++) {
            const south = z === maxZ - 1;
            const north = z === minZ;
            const door = south && x >= DOOR.minX && x < DOOR.maxX;
            const bigWindow = north && x >= 21 && x < 27 && y >= 1;
            if (door || bigWindow || windowAt(x, z, y)) continue;
            add(x + 0.5, y + 0.5, z + 0.5, s >= 4 ? colors.wall : 0xc9c3b8);
          }
        }
      }
    // Slab over the floor; the floor being built is poured row by row.
    const rows = Math.max(1, Math.round(D * Math.min(1, partial * 1.4)));
    for (let z = minZ; z < minZ + rows; z++)
      for (let x = minX; x < maxX; x++) add(x + 0.5, y0 + 3.5, z + 0.5, concrete);
  }
  const height = floors * FLOOR_H;

  // --- 4. Roof: parapet and units.
  if (s >= 3 && floors) {
    const yr = height + 0.5;
    const amount = s === 3 ? f : 1;
    let k = 0;
    const ring = 2 * (W + D);
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++)
        if (edge(x, z) && k++ / ring < amount) add(x + 0.5, yr, z + 0.5, colors.accent);
    if (amount > 0.5) {
      add(minX + 5, yr + 0.5, minZ + 5, 0x8b929c, 3, 2, 2);
      add(maxX - 6, yr + 0.5, maxZ - 5, 0x8b929c, 2, 2, 2);
    }
  }

  // --- 5. Facade on the upper floors, bottom-up; 7. glazing and lights inside.
  const glassAmount = s === 6 ? f : s > 6 ? 1 : 0;
  const litAmount = s >= 6 ? (s === 6 ? f : 0.6) : 0;
  if (s >= 4) {
    const facadeFloors = s === 4 ? Math.ceil(f * (p.floors - 1)) : p.floors - 1;
    let w = 0;
    for (let k = 1; k <= facadeFloors; k++) {
      const y0 = k * FLOOR_H;
      for (let x = minX; x < maxX; x++)
        for (let z = minZ; z < maxZ; z++) {
          if (!edge(x, z) || columnAt(x, z)) continue;
          for (let y = 0; y < 3; y++) {
            if (windowAt(x, z, y)) {
              if (y !== 1) continue;
              const id = w++;
              const seq = ((id * 37) % 101) / 101;
              if (seq < glassAmount) add(x + 0.5, y0 + 2, z + 0.5, colors.glass, 0.98, 2, 0.98);
              if (seq < litAmount * glassAmount && (id * 13) % 5 < 3)
                lit.add(x + 0.5, y0 + 2, z + 0.5, 0xffc46b, 1.02, 1.9, 1.02);
              continue;
            }
            add(x + 0.5, y0 + y + 0.5, z + 0.5, y === 0 ? colors.accent : colors.wall);
          }
        }
    }
  }
  // Ground-floor glazing (not the big north window — it stays open for the view).
  if (glassAmount > 0.3) {
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++)
        if (edge(x, z) && windowAt(x, z, 1) && !(z === minZ && x >= 21 && x < 27))
          add(x + 0.5, 2, z + 0.5, colors.glass, 0.98, 2, 0.98);
  }

  // --- 6. Utilities: trenches with pipes along the south and east sides.
  if (s >= 5) {
    const amount = s === 5 ? f : 1;
    const len = Math.round(26 * amount);
    for (let i = 0; i < len; i++) {
      const x = minX - 3 + i;
      add(x + 0.5, 0.25, maxZ + 2.5, 0x2563eb, 1, 0.5, 0.5);
      add(x + 0.5, 0.25, maxZ + 3.3, 0xeab308, 1, 0.5, 0.5);
    }
    for (let i = 0; i < Math.round(14 * amount); i++)
      add(maxX + 2.5, 0.25, minZ + i + 0.5, 0x16a34a, 0.5, 0.5, 1);
    if (amount > 0.5) add(maxX + 2.5, 0.6, maxZ + 2.5, 0x374151, 1.2, 1.2, 1.2);
  }

  // --- 8. Landscaping: asphalt, curbs, lawns, lamp posts, a playground.
  if (s >= 7) {
    const amount = s === 7 ? f : 1;
    let k = 0;
    const cells: [number, number, number][] = [];
    for (let x = minX - 4; x < maxX + 4; x++)
      for (let z = minZ - 4; z < maxZ + 5; z++) {
        const inside = x >= minX - 1 && x < maxX + 1 && z >= minZ - 1 && z < maxZ + 1;
        if (inside) continue;
        const ring = x === minX - 4 || x === maxX + 3 || z === minZ - 4 || z === maxZ + 4;
        const lawn = !ring && (x < minX - 2 || x > maxX + 1) && (z + x) % 7 !== 0;
        cells.push([x, z, ring ? 0x9ca3af : lawn ? 0x4d7c2f : 0x2f3338]);
      }
    for (const [x, z, c] of cells) {
      if (k++ / cells.length > amount) break;
      add(x + 0.5, 0.06, z + 0.5, c, 1, 0.12 + (c === 0x9ca3af ? 0.15 : 0), 1);
    }
    if (amount > 0.4) {
      for (const [x, z] of [
        [minX - 3, maxZ + 3],
        [maxX + 2, maxZ + 3],
        [minX - 3, minZ - 3],
        [maxX + 2, minZ - 3],
      ] as [number, number][]) {
        add(x + 0.5, 2, z + 0.5, 0x1f2937, 0.2, 4, 0.2);
        add(x + 0.5, 4.1, z + 0.5, 0xfff2c4, 0.5, 0.25, 0.5);
        lit.add(x + 0.5, 4.1, z + 0.5, 0xfff2c4, 0.6, 0.3, 0.6);
      }
    }
    if (amount > 0.7 && (p.projectType === 'housing' || p.projectType === 'school')) {
      // Playground: a slide, a sandbox, swings.
      const px = minX - 3;
      const pz = minZ + 3;
      add(px, 0.2, pz, 0xd8b36a, 2, 0.3, 2);
      add(px, 1, pz + 3, 0xdc2626, 0.3, 2, 0.3);
      add(px + 1.5, 1, pz + 3, 0xdc2626, 0.3, 2, 0.3);
      add(px + 0.75, 2, pz + 3, 0x2563eb, 1.8, 0.2, 0.2);
      add(px, 1.2, pz + 6, 0x16a34a, 1, 2.4, 1);
      add(px + 0.9, 0.7, pz + 6, 0xf59e0b, 1.4, 0.2, 0.8);
    }
  }

  // --- 9. Handover: a red ribbon across the door, bunting.
  const celebration = s === 8;
  if (celebration) {
    add(24, 1.1, maxZ + 0.6, 0xdc2626, 4.4, 0.12, 0.05);
    for (let i = 0; i < 12; i++)
      add(
        minX + 1 + i * 1.6,
        height + 1.2 - (i % 2) * 0.3,
        maxZ - 0.2,
        i % 2 ? 0xf59e0b : 0x2563eb,
        0.5,
        0.5,
        0.06,
      );
  }

  const built = v.build(voxelMat, { cast: true, receive: true });
  const litBuilt = lit.build(
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
    { cast: false, receive: false },
  );
  group.add(built.mesh, litBuilt.mesh);
  void M;
  void mobile;
  return {
    group,
    mesh: built.mesh,
    lit: litBuilt.mesh,
    total: v.count,
    height,
    hasWalls: s >= 2,
    celebration,
  };
}

/** Plots around the site where finished objects stand («Квартал СпецПласт16»). */
export const DISTRICT_SLOTS: [number, number][] = [
  [92, -30],
  [92, 14],
  [92, 54],
  [44, -96],
  [0, -98],
  [-44, -96],
  [-94, 30],
  [-94, -36],
];

/** Low-detail finished buildings (big blocks, window bands lit at night). */
export function buildDistrict(
  finished: WorldProgress['finishedProjects'],
  voxelMat: THREE.Material,
) {
  const v = new Voxels();
  const lit = new Voxels();
  finished.slice(-DISTRICT_SLOTS.length).forEach((project, i) => {
    const [x, z] = DISTRICT_SLOTS[i]!;
    const colors = FACADE[project.type];
    const h = project.floors * FLOOR_H;
    const w = project.type === 'warehouse' ? 30 : 20;
    const d = 14;
    v.add(x, h / 2, z, colors.wall, w, h, d);
    v.add(x, h + 0.5, z, colors.accent, w + 0.4, 1, d + 0.4);
    for (let k = 0; k < project.floors; k++) {
      const y = k * FLOOR_H + 2;
      v.add(x, y, z, colors.glass, w + 0.1, 1.4, d + 0.1);
      if ((k + i) % 3 !== 0) lit.add(x, y, z, 0xffc46b, w + 0.15, 1.2, d + 0.15);
    }
    // A bit of landscaping in front.
    v.add(x, 0.05, z + d / 2 + 3, 0x2f3338, w + 6, 0.1, 5);
    v.add(x, 0.08, z - d / 2 - 2, 0x4d7c2f, w + 6, 0.12, 3);
  });
  const built = v.build(voxelMat, { cast: false, receive: true });
  const litBuilt = lit.build(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), {
    cast: false,
    receive: false,
  });
  const group = new THREE.Group();
  group.add(built.mesh, litBuilt.mesh);
  return { group, lit: litBuilt.mesh };
}

/** Tower crane next to the plot, with red aviation lights; returns the jib to turn. */
export function buildTowerCrane(M: Materials, height: number) {
  const rig = new Rig(M);
  const root = node(null, [38, 0, -30]);
  const mastH = Math.max(14, height + 8);
  for (let y = 0; y < mastH; y += 2) {
    rig.box(root, [1.4, 0.15, 1.4], 'amber', [0, y + 1, 0]);
    for (const [sx, sz] of [
      [-0.6, -0.6],
      [0.6, -0.6],
      [-0.6, 0.6],
      [0.6, 0.6],
    ] as [number, number][])
      rig.box(root, [0.18, 2, 0.18], 'yellow', [sx, y + 1, sz]);
  }
  rig.box(root, [2.4, 1, 2.4], 'concrete', [0, 0.5, 0]);
  const jib = node(root, [0, mastH, 0]);
  rig.box(jib, [24, 0.9, 0.9], 'yellow', [6, 0.6, 0]);
  rig.box(jib, [3, 1.6, 1.4], 'dark', [-7.5, 0.5, 0]);
  rig.box(jib, [1.4, 1.6, 1.4], 'glass', [0.9, -0.6, 0.9]);
  rig.box(jib, [0.4, 3, 0.4], 'yellow', [0, 2.2, 0]);
  rig.box(jib, [0.05, 6, 0.05], 'black', [12, -2.4, 0]);
  rig.box(jib, [0.6, 0.6, 0.6], 'yellow', [12, -5.6, 0]);
  const red = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  const lights = [
    [0, 3.8, 0],
    [17.6, 1.2, 0],
    [-9, 1.4, 0],
  ].map(([x, y, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), red);
    m.position.set(x!, y!, z!);
    jib.add(m);
    return m;
  });
  rig.bake({ cast: true });
  return { root, jib, lights, red };
}
