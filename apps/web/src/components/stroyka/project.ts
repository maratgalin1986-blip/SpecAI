// The object under construction on its plot, ЖК «Кама» once it is finished,
// and the district around the site: finished objects with their yards,
// fenced plots waiting for the next ones. Built from 1 m blocks,
// deterministically from the timeline (lib/stroyka/progress.ts), in build
// order, so a time-lapse can reveal it. The district is one instanced mesh
// plus one for lit windows: a handful of draw calls however many objects.
import * as THREE from 'three';
import { BUILDING, type Box } from '@/lib/stroyka';
import { footprintOn, PLOTS } from '@/lib/stroyka/plots';
import {
  OUTER_PLOTS,
  plotOf,
  type FinishedProject,
  type ObjectKind,
  type WorldProgress,
} from '@/lib/stroyka/progress';
import { node, PLAIN_BOX, Rig, Voxels, type Materials } from './kit';

const FLOOR_H = 4;

const FACADE: Record<ObjectKind, { wall: number; accent: number; glass: number }> = {
  housing: { wall: 0xe7d3b5, accent: 0xb5653d, glass: 0x5b7fa6 },
  kindergarten: { wall: 0xf3eee2, accent: 0x4f9d5d, glass: 0x5f86ab },
  school: { wall: 0xf1e3a6, accent: 0xd06a3a, glass: 0x5f86ab },
  sport: { wall: 0xd7dde4, accent: 0x2e8ec9, glass: 0x4d8fc7 },
  clinic: { wall: 0xf4f6f8, accent: 0x3b82c4, glass: 0x5b7fa6 },
};

/** What the staged builder needs to know about the object. */
export type BuildState = Pick<
  WorldProgress,
  'projectType' | 'floors' | 'stage' | 'stagePercent' | 'floorsBuilt'
>;

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

/**
 * Blocks of the object for this progress, on footprint `box` (default: the
 * plot inside the site). `done` draws it finished, without the handover
 * ribbon (ЖК «Кама» after it is handed over).
 */
export function buildProject(
  M: Materials,
  p: BuildState,
  voxelMat: THREE.Material,
  mobile: boolean,
  { box = BUILDING, done = false }: { box?: Box; done?: boolean } = {},
): ProjectBuild {
  const v = new Voxels();
  const lit = new Voxels();
  const group = new THREE.Group();
  const colors = FACADE[p.projectType];
  const s = p.stage;
  const f = p.stagePercent / 100;
  const { minX, maxX, minZ, maxZ } = box;
  const onSite = box === BUILDING;
  // The door and the big north window are centred (on the site plot: x 23–25, 21–27).
  const cx = Math.round((minX + maxX) / 2);
  const DOOR = { minX: cx - 1, maxX: cx + 1 };
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
    // One block per row (merged: a 17-storey block stays a few thousand blocks).
    for (let z = minZ; z < maxZ; z++) add((minX + maxX) / 2, -0.5, z + 0.5, 0x9b968f, W, 1, 1);
  }

  // Walkway (мостки) to look into the pit while there is no floor.
  if (s < 2 && onSite) {
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
        if (columnAt(x, z)) add(x + 0.5, y0 + 1.5, z + 0.5, concrete, 1, 3, 1);
        else if (k === 0 && isEdge) {
          // The bottom course, then the upper two in one block (windows span both).
          const south = z === maxZ - 1;
          const north = z === minZ;
          const door = south && x >= DOOR.minX && x < DOOR.maxX;
          const bigWindow = north && x >= cx - 3 && x < cx + 3;
          const wallHex = s >= 4 ? colors.wall : 0xc9c3b8;
          if (!door) add(x + 0.5, 0.5, z + 0.5, wallHex);
          if (!door && !bigWindow && !windowAt(x, z, 1)) add(x + 0.5, 2, z + 0.5, wallHex, 1, 2, 1);
        }
      }
    // Slab over the floor; the floor being built is poured row by row.
    const rows = Math.max(1, Math.round(D * Math.min(1, partial * 1.4)));
    for (let z = minZ; z < minZ + rows; z++)
      add((minX + maxX) / 2, y0 + 3.5, z + 0.5, concrete, W, 1, 1);
  }
  const height = floors * FLOOR_H;

  // Scaffolding on the south and west faces while the frame rises and the
  // facade goes on (poles, ledgers every 2 m, a deck per floor), with green
  // safety netting over the top floors of the frame. Gone once the facade is done.
  if (s >= 2 && s <= 4 && floors > 0) {
    const H = height + (s === 2 ? 1 : 0.5);
    const pole = 0x9aa1aa;
    const deck = 0x9a6a33;
    const faces: { along: 'x' | 'z'; from: number; to: number; at: number; out: number }[] = [
      { along: 'x', from: minX - 1, to: maxX + 1, at: maxZ, out: 1 },
      { along: 'z', from: minZ, to: maxZ + 1, at: minX, out: -1 },
    ];
    const put = (f: (typeof faces)[number], a: number, d: number, y: number, ...size: number[]) => {
      const [sa, sy, sd] = size as [number, number, number];
      const off = f.at + f.out * d;
      if (f.along === 'x') add(a, y, off, pole, sa, sy, sd);
      else add(off, y, a, pole, sd, sy, sa);
    };
    for (const f of faces) {
      const len = f.to - f.from;
      const mid = (f.from + f.to) / 2;
      for (let a = f.from; a <= f.to + 0.01; a += 2)
        for (const d of [0.5, 1.6]) put(f, a, d, H / 2, 0.12, H, 0.12);
      for (let y = 2; y <= H; y += 2)
        for (const d of [0.5, 1.6]) put(f, mid, d, y, len, 0.08, 0.08);
      for (let k = 1; k <= floors; k++) {
        const y = k * FLOOR_H - 0.05;
        const off = f.at + f.out * 1.05;
        if (f.along === 'x') add(mid, y, off, deck, len, 0.06, 1.1);
        else add(off, y, mid, deck, 1.1, 0.06, len);
      }
      if (s === 2) {
        // Netting over the two newest floors.
        const y0 = Math.max(0, height - 2 * FLOOR_H);
        const off = f.at + f.out * 1.68;
        const hNet = H - y0;
        if (f.along === 'x') add(mid, y0 + hNet / 2, off, 0x2f7d4a, len, hNet, 0.04);
        else add(off, y0 + hNet / 2, mid, 0x2f7d4a, 0.04, hNet, len);
      }
    }
  }

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
  // Before the glazing, work lamps glow inside some open window holes at night.
  const workLights = s === 4 || s === 5;
  const litAmount = s >= 6 ? (s === 6 ? f : 0.6) : 0;
  if (s >= 4) {
    const facadeFloors = s === 4 ? Math.ceil(f * (p.floors - 1)) : p.floors - 1;
    let w = 0;
    for (let k = 1; k <= facadeFloors; k++) {
      const y0 = k * FLOOR_H;
      for (let x = minX; x < maxX; x++)
        for (let z = minZ; z < maxZ; z++) {
          if (!edge(x, z) || columnAt(x, z)) continue;
          add(x + 0.5, y0 + 0.5, z + 0.5, colors.accent);
          if (windowAt(x, z, 1)) {
            const id = w++;
            const seq = ((id * 37) % 101) / 101;
            if (seq < glassAmount) add(x + 0.5, y0 + 2, z + 0.5, colors.glass, 0.98, 2, 0.98);
            if (seq < litAmount * glassAmount && (id * 13) % 5 < 3)
              lit.add(x + 0.5, y0 + 2, z + 0.5, 0xffc46b, 1.02, 1.9, 1.02);
            else if (workLights && (id * 7) % 9 === 0)
              lit.add(x + 0.5, y0 + 2, z + 0.5, 0xe6eeff, 0.9, 1.8, 0.9);
          } else add(x + 0.5, y0 + 2, z + 0.5, colors.wall, 1, 2, 1);
        }
    }
  }
  // Ground-floor glazing (not the big north window — it stays open for the view).
  if (glassAmount > 0.3) {
    for (let x = minX; x < maxX; x++)
      for (let z = minZ; z < maxZ; z++)
        if (edge(x, z) && windowAt(x, z, 1) && !(z === minZ && x >= cx - 3 && x < cx + 3))
          add(x + 0.5, 2, z + 0.5, colors.glass, 0.98, 2, 0.98);
  }

  // --- 6. Utilities: trenches with pipes along the south and east sides.
  // Buried and paved over once the landscaping starts.
  if (s >= 5 && s <= 6) {
    const amount = s === 5 ? f : 1;
    const len = Math.round((W + 6) * amount);
    for (let i = 0; i < len; i++) {
      const x = minX - 3 + i;
      add(x + 0.5, 0.25, maxZ + 2.5, 0x2563eb, 1, 0.5, 0.5);
      add(x + 0.5, 0.25, maxZ + 3.3, 0xeab308, 1, 0.5, 0.5);
    }
    for (let i = 0; i < Math.round(D * amount); i++)
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
    if (amount > 0.7 && p.projectType !== 'clinic') {
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
  const celebration = s === 8 && !done;
  if (celebration) {
    add(cx, 1.1, maxZ + 0.6, 0xdc2626, 4.4, 0.12, 0.05);
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

  // Off the site plot it is far from the camera: no shadow casting.
  // Off the site plot it is far away: plain boxes (12 triangles, not ~300).
  const built = v.build(voxelMat, {
    cast: onSite,
    receive: true,
    geometry: onSite ? undefined : PLAIN_BOX,
  });
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

// ---------------------------------------------------------------- district

const GROUND_Y = -0.03;
const LAWN = 0x4d7c2f;
const EARTH = 0x8a6c50;
const ASPHALT = 0x3a3f45;
const PAVING = 0xa3a39c;
const CURB = 0xb8b8b0;
const LAMP_LIGHT = 0xfff2c4;

/** Tree spot: x, z, trunk height. Drawn by the world's instanced trees. */
export type TreeSpot = [number, number, number];

export interface DistrictBuild {
  group: THREE.Group;
  lit: THREE.InstancedMesh;
  /** Trees on the finished plots (the world's instanced trees draw them). */
  trees: TreeSpot[];
  /** Blocks in the district mesh (telemetry, tests). */
  blocks: number;
  /** Snow covers the plots' ground and roofs; rain darkens the ground. */
  setGround(mode: 'dry' | 'wet' | 'snow'): void;
}

/** A cheap pseudo-random sequence per plot, so the district is the same for everyone. */
function seeded(seed: number) {
  let x = (seed * 9301 + 49297) % 233280;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
}

/** Ground slab over the whole rectangle (the far ground has a hole at every plot). */
function ground(v: Voxels, r: Box, color: number) {
  v.add(
    (r.minX + r.maxX) / 2,
    GROUND_Y,
    (r.minZ + r.maxZ) / 2,
    color,
    r.maxX - r.minX,
    0.1,
    r.maxZ - r.minZ,
  );
}

/** The plot minus the footprint, as four strips. */
function groundAround(v: Voxels, plot: Box, f: Box, color: number) {
  ground(v, { minX: plot.minX, maxX: plot.maxX, minZ: plot.minZ, maxZ: f.minZ }, color);
  ground(v, { minX: plot.minX, maxX: plot.maxX, minZ: f.maxZ, maxZ: plot.maxZ }, color);
  ground(v, { minX: plot.minX, maxX: f.minX, minZ: f.minZ, maxZ: f.maxZ }, color);
  ground(v, { minX: f.maxX, maxX: plot.maxX, minZ: f.minZ, maxZ: f.maxZ }, color);
}

/** A construction fence round the plot (panels and posts), with a gate gap in the south side. */
function siteFence(v: Voxels, r: Box, gate: boolean) {
  const panel = 0x2f4356;
  const cx = (r.minX + r.maxX) / 2;
  const W = r.maxX - r.minX;
  const D = r.maxZ - r.minZ;
  v.add(cx, 1, r.minZ, panel, W, 2, 0.15);
  v.add(r.minX, 1, (r.minZ + r.maxZ) / 2, panel, 0.15, 2, D);
  v.add(r.maxX, 1, (r.minZ + r.maxZ) / 2, panel, 0.15, 2, D);
  if (gate) {
    const half = (W - 8) / 2;
    v.add(r.minX + half / 2, 1, r.maxZ, panel, half, 2, 0.15);
    v.add(r.maxX - half / 2, 1, r.maxZ, panel, half, 2, 0.15);
  } else v.add(cx, 1, r.maxZ, panel, W, 2, 0.15);
  // Posts with amber caps every 8 m.
  for (let x = r.minX; x <= r.maxX + 0.01; x += 8)
    for (const z of [r.minZ, r.maxZ]) {
      if (gate && z === r.maxZ && Math.abs(x - cx) < 4) continue;
      v.add(x, 1.1, z, 0x26374a, 0.25, 2.2, 0.25);
      v.add(x, 2.3, z, 0xf59e0b, 0.3, 0.2, 0.3);
    }
  for (let z = r.minZ + 8; z < r.maxZ; z += 8)
    for (const x of [r.minX, r.maxX]) {
      v.add(x, 1.1, z, 0x26374a, 0.25, 2.2, 0.25);
      v.add(x, 2.3, z, 0xf59e0b, 0.3, 0.2, 0.3);
    }
}

/** A site cabin (бытовка) at x, z. */
function cabin(v: Voxels, x: number, z: number) {
  v.add(x, 1.3, z, 0x2f6fb0, 6, 2.6, 2.4);
  v.add(x, 2.65, z, 0xe5e7eb, 6.1, 0.1, 2.5);
  v.add(x - 1.5, 1.4, z + 1.22, 0x9cc3e6, 1, 0.8, 0.05);
  v.add(x + 1.8, 1.1, z + 1.22, 0x1f2937, 0.9, 2, 0.05);
}

/** A street lamp; its head glows at night. */
function lamp(v: Voxels, lit: Voxels, x: number, z: number) {
  v.add(x, 2, z, 0x1f2937, 0.18, 4, 0.18);
  v.add(x, 4.1, z, LAMP_LIGHT, 0.5, 0.22, 0.5);
  lit.add(x, 4.1, z, LAMP_LIGHT, 0.6, 0.3, 0.6);
}

/**
 * A finished building in few blocks: walls, a glass band per floor broken
 * by pilasters into windows, a plinth, the parapet, roof units and the
 * entrances; some windows lit at night. ~40–80 blocks whatever the height.
 */
function finishedBuilding(
  v: Voxels,
  lit: Voxels,
  f: Box,
  kind: ObjectKind,
  floors: number,
  rand: () => number,
) {
  const c = FACADE[kind];
  const W = f.maxX - f.minX;
  const D = f.maxZ - f.minZ;
  const cx = (f.minX + f.maxX) / 2;
  const cz = (f.minZ + f.maxZ) / 2;
  const H = floors * FLOOR_H;
  v.add(cx, H / 2, cz, c.wall, W - 0.3, H, D - 0.3);
  // Glass bands, one per floor (slightly proud of the wall).
  for (let k = 0; k < floors; k++) v.add(cx, k * FLOOR_H + 2, cz, c.glass, W - 0.1, 1.7, D - 0.1);
  // Pilasters across the bands: they split them into windows on all four sides.
  const step = kind === 'sport' ? 5 : 3;
  for (let x = f.minX + step / 2; x < f.maxX; x += step) v.add(x, H / 2, cz, c.wall, 0.9, H, D);
  for (let z = f.minZ + step / 2; z < f.maxZ; z += step) v.add(cx, H / 2, z, c.wall, W, H, 0.9);
  // Plinth, parapet, roof units.
  v.add(cx, 0.5, cz, c.accent, W + 0.1, 1, D + 0.1);
  v.add(cx, H + 0.4, cz, c.accent, W + 0.2, 0.8, D + 0.2);
  v.add(f.minX + W * 0.3, H + 1.2, cz, 0x8b929c, 3, 1.6, 2.4);
  v.add(f.maxX - W * 0.25, H + 1, cz - D * 0.2, 0x8b929c, 2, 1.2, 2);
  // Entrances on the south side: housing has two подъезда, the rest one door.
  const doors = kind === 'housing' ? [cx - W / 4, cx + W / 4] : [cx];
  for (const x of doors) {
    v.add(x, 1.2, f.maxZ + 0.05, 0x3b2f2a, 1.8, 2.4, 0.2);
    v.add(x, 2.8, f.maxZ + 0.9, c.accent, 3, 0.2, 1.8);
  }
  if (kind === 'clinic') {
    // A red cross over the entrance.
    v.add(cx, H - 2.5, f.maxZ + 0.1, 0xdc2626, 1, 3, 0.2);
    v.add(cx, H - 2.5, f.maxZ + 0.1, 0xdc2626, 3, 1, 0.2);
  }
  if (kind === 'sport') {
    // Big glazing of the hall on the south side.
    v.add(cx, H / 2 + 0.5, f.maxZ, c.glass, W * 0.6, H - 3, 0.3);
  }
  // Lit windows at night: a few window runs per floor glow through.
  for (let k = 0; k < floors; k++) {
    const runs = 1 + Math.floor(rand() * 3);
    for (let r = 0; r < runs; r++) {
      const x = f.minX + 1.5 + rand() * (W - 3);
      lit.add(x, k * FLOOR_H + 2, cz, 0xffc46b, step - 0.9, 1.5, D + 0.02);
    }
    if (rand() < 0.5) {
      const z = f.minZ + 1.5 + rand() * (D - 3);
      lit.add(cx, k * FLOOR_H + 2, z, 0xffc46b, W + 0.02, 1.5, step - 0.9);
    }
  }
}

/** A kindergarten playground: soft surface, sandboxes, slides, swings, verandas, low fence. */
function playground(v: Voxels, r: Box) {
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  v.add(cx, 0.05, cz, 0x6b8f3a, r.maxX - r.minX, 0.06, r.maxZ - r.minZ);
  const surfaces = [0xc2410c, 0x2563eb, 0x16a34a];
  const w = (r.maxX - r.minX) / 3;
  surfaces.forEach((col, i) => {
    const x = r.minX + w * (i + 0.5);
    v.add(x, 0.09, cz, col, w - 2, 0.04, r.maxZ - r.minZ - 3);
    v.add(x - 1.5, 0.2, cz - 1.5, 0xd8b36a, 2.4, 0.3, 2.4); // sandbox
    v.add(x + 1.6, 0.9, cz - 1, 0xdc2626, 0.25, 1.8, 0.25); // swing frame
    v.add(x + 3, 0.9, cz - 1, 0xdc2626, 0.25, 1.8, 0.25);
    v.add(x + 2.3, 1.8, cz - 1, 0x2563eb, 1.8, 0.15, 0.15);
    v.add(x + 1, 0.8, cz + 2, 0xf59e0b, 1, 1.6, 1); // slide tower
    v.add(x + 2, 0.5, cz + 2, 0xfacc15, 1.6, 0.15, 0.7, 0.4);
    // Veranda: a roof on posts.
    v.add(x - 2, 1.2, cz + 2.6, 0xe5e7eb, 0.15, 2.4, 0.15);
    v.add(x, 1.2, cz + 2.6, 0xe5e7eb, 0.15, 2.4, 0.15);
    v.add(x - 1, 2.45, cz + 2.6, 0x4f9d5d, 3, 0.15, 2);
  });
  // Low fence round the play area.
  const fence = 0x9ca3af;
  v.add(cx, 0.5, r.minZ, fence, r.maxX - r.minX, 1, 0.08);
  v.add(cx, 0.5, r.maxZ, fence, r.maxX - r.minX, 1, 0.08);
  v.add(r.minX, 0.5, cz, fence, 0.08, 1, r.maxZ - r.minZ);
  v.add(r.maxX, 0.5, cz, fence, 0.08, 1, r.maxZ - r.minZ);
}

/** A sports ground: running track, a pitch with lines and goals, small stands. */
function sportsGround(v: Voxels, r: Box) {
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const W = r.maxX - r.minX;
  const D = r.maxZ - r.minZ;
  v.add(cx, 0.05, cz, 0xb4533c, W, 0.06, D); // track
  v.add(cx, 0.09, cz, 0x3f8a3a, W - 4, 0.04, D - 4); // pitch
  v.add(cx, 0.12, cz, 0xf1f5f9, 0.15, 0.02, D - 4); // halfway line
  v.add(cx, 0.12, cz, 0xf1f5f9, 3, 0.02, 0.15);
  for (const x of [r.minX + 2.2, r.maxX - 2.2]) {
    v.add(x, 1, cz - 1.5, 0xf8fafc, 0.12, 2, 0.12);
    v.add(x, 1, cz + 1.5, 0xf8fafc, 0.12, 2, 0.12);
    v.add(x, 2, cz, 0xf8fafc, 0.12, 0.12, 3.1);
  }
  // Stands along the north edge.
  v.add(cx, 0.3, r.minZ - 1, 0x9ca3af, W * 0.5, 0.6, 1.2);
  v.add(cx, 0.75, r.minZ - 1.6, 0x9ca3af, W * 0.5, 0.6, 1);
}

/** A parking lot with marked bays and a few cars. */
function parking(v: Voxels, r: Box, rand: () => number) {
  const cz = (r.minZ + r.maxZ) / 2;
  v.add((r.minX + r.maxX) / 2, 0.04, cz, ASPHALT, r.maxX - r.minX, 0.05, r.maxZ - r.minZ);
  const cars = [0xe5e7eb, 0x1f2937, 0x9f1239, 0x334155, 0xd1d5db, 0x1e3a8a];
  for (let x = r.minX + 1.5; x < r.maxX - 1; x += 2.8) {
    v.add(x - 1.4, 0.08, cz, 0xf1f5f9, 0.12, 0.02, r.maxZ - r.minZ - 1);
    if (rand() < 0.6) {
      const col = cars[Math.floor(rand() * cars.length)]!;
      v.add(x, 0.6, cz, col, 1.8, 0.8, 4.2);
      v.add(x, 1.2, cz + 0.2, col, 1.6, 0.6, 2.2);
    }
  }
}

/** A finished object on its plot: lawn, paths, lamps, trees, and its own yard. */
function finishedPlot(
  v: Voxels,
  lit: Voxels,
  trees: TreeSpot[],
  plot: number,
  obj: FinishedProject,
) {
  const r = PLOTS[plot]!;
  const f = footprintOn(plot, obj.type);
  const rand = seeded(plot * 31 + obj.index * 7);
  const cx = (f.minX + f.maxX) / 2;
  ground(v, r, LAWN);
  // Curbs round the plot and an asphalt apron round the building.
  const W = r.maxX - r.minX;
  const D = r.maxZ - r.minZ;
  v.add((r.minX + r.maxX) / 2, 0.08, r.minZ + 0.15, CURB, W, 0.16, 0.3);
  v.add((r.minX + r.maxX) / 2, 0.08, r.maxZ - 0.15, CURB, W, 0.16, 0.3);
  v.add(r.minX + 0.15, 0.08, (r.minZ + r.maxZ) / 2, CURB, 0.3, 0.16, D);
  v.add(r.maxX - 0.15, 0.08, (r.minZ + r.maxZ) / 2, CURB, 0.3, 0.16, D);
  v.add(cx, 0.04, (f.minZ + f.maxZ) / 2, ASPHALT, f.maxX - f.minX + 6, 0.05, f.maxZ - f.minZ + 6);
  // A path from the entrance to the south edge, and one along it.
  const yardTop = f.maxZ + 3;
  v.add(cx, 0.06, (yardTop + r.maxZ) / 2, PAVING, 3, 0.06, r.maxZ - yardTop);
  v.add((r.minX + r.maxX) / 2, 0.06, r.maxZ - 2.2, PAVING, W - 2, 0.06, 2.4);
  for (let z = yardTop + 3; z < r.maxZ - 3; z += 8) {
    lamp(v, lit, cx - 2.3, z);
    lamp(v, lit, cx + 2.3, z + 4);
  }
  lamp(v, lit, r.minX + 3, r.maxZ - 4);
  lamp(v, lit, r.maxX - 3, r.maxZ - 4);
  // The yard by kind: the half of the south yard west or east of the path.
  const west: Box = { minX: r.minX + 3, maxX: cx - 3, minZ: yardTop + 2, maxZ: r.maxZ - 5 };
  const east: Box = { minX: cx + 3, maxX: r.maxX - 3, minZ: yardTop + 2, maxZ: r.maxZ - 5 };
  const yard: Box = { minX: r.minX + 3, maxX: r.maxX - 3, minZ: yardTop + 2, maxZ: r.maxZ - 5 };
  if (obj.type === 'kindergarten') playground(v, yard);
  else if (obj.type === 'school' || obj.type === 'sport') sportsGround(v, yard);
  else if (obj.type === 'clinic') {
    parking(v, west, rand);
    playground(v, { ...east, maxX: east.minX + Math.min(10, east.maxX - east.minX) });
  } else {
    // Housing: a playground on one side, parking on the other.
    playground(v, { ...west, minX: Math.max(west.minX, west.maxX - 14) });
    parking(v, east, rand);
  }
  // Benches by the path.
  v.add(cx - 3.2, 0.25, yardTop + 2, 0x7c4a21, 0.5, 0.5, 1.8);
  v.add(cx + 3.2, 0.25, yardTop + 2, 0x7c4a21, 0.5, 0.5, 1.8);
  finishedBuilding(v, lit, f, obj.type, obj.floors, rand);
  // Trees along the west, east and north edges (the yard and paths stay open).
  for (let z = r.minZ + 3; z < r.maxZ - 3; z += 6) {
    trees.push([r.minX + 1.6, z + rand() * 1.5, 2 + Math.floor(rand() * 3)]);
    trees.push([r.maxX - 1.6, z + rand() * 1.5, 2 + Math.floor(rand() * 3)]);
  }
  for (let x = r.minX + 6; x < r.maxX - 5; x += 6)
    trees.push([x + rand(), r.minZ + 1.8, 2 + Math.floor(rand() * 3)]);
}

/** The current object's plot off the site: bare ground round the works, a fence, a cabin. */
function currentPlot(v: Voxels, plot: number, f: Box, stage: number) {
  const r = PLOTS[plot]!;
  groundAround(v, r, f, stage >= 7 ? 0x7a7e66 : EARTH);
  siteFence(v, r, true);
  cabin(v, r.maxX - 5, r.maxZ - 3);
  if (stage < 2) {
    // Spoil heap from the pit.
    v.add(r.minX + 6, 0.8, r.maxZ - 7, 0x6b4a2f, 6, 1.6, 5);
    v.add(r.minX + 6, 1.9, r.maxZ - 7, 0x6b4a2f, 3.5, 1, 3);
  }
}

/** A plot waiting for its object: fenced bare land; the next one has a cabin already. */
function futurePlot(v: Voxels, plot: number, next: boolean) {
  const r = PLOTS[plot]!;
  ground(v, r, next ? EARTH : 0x6f8c46);
  siteFence(v, r, false);
  if (next) {
    cabin(v, r.maxX - 5, r.maxZ - 3);
    // Survey stakes at the corners of the future footprint.
    v.add((r.minX + r.maxX) / 2, 0.6, r.minZ + 6, 0xdc2626, 0.15, 1.2, 0.15);
    v.add((r.minX + r.maxX) / 2 + 10, 0.6, r.minZ + 6, 0xdc2626, 0.15, 1.2, 0.15);
  }
}

/**
 * Everything on the outer plots for this state of the world: finished
 * objects, the current one's surroundings (the object itself is
 * buildProject's), and fenced empty plots. One instanced mesh without
 * shadow casting plus one for lit windows and lamps.
 */
export function buildDistrict(p: WorldProgress, voxelMat: THREE.Material): DistrictBuild {
  const v = new Voxels();
  const lit = new Voxels();
  const trees: TreeSpot[] = [];
  const standing = new Map<number, FinishedProject>();
  for (const f of p.finishedProjects) if (f.plot > 0) standing.set(f.plot, f);
  const nextPlot = plotOf(p.projectIndex + 1);
  for (let plot = 1; plot <= OUTER_PLOTS; plot++) {
    const obj = standing.get(plot);
    if (plot === p.plot) currentPlot(v, plot, footprintOn(plot, p.projectType), p.stage);
    else if (obj) finishedPlot(v, lit, trees, plot, obj);
    else futurePlot(v, plot, plot === nextPlot);
  }
  const built = v.build(voxelMat, { cast: false, receive: true, geometry: PLAIN_BOX });
  const litBuilt = lit.build(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), {
    cast: false,
    receive: false,
    geometry: PLAIN_BOX,
  });
  litBuilt.mesh.visible = lit.count > 0;
  const group = new THREE.Group();
  group.add(built.mesh, litBuilt.mesh);
  // Ground-level blocks (lawns, paths, yards) turn white under snow.
  const flat = built.items.map((it) => it.y < 0.2);
  const white = new THREE.Color(0xf4f7fb);
  const c = new THREE.Color();
  const setGround = (mode: 'dry' | 'wet' | 'snow') => {
    built.colors.forEach((base, i) => {
      c.copy(base);
      if (flat[i] && mode === 'snow') c.lerp(white, 0.85);
      if (flat[i] && mode === 'wet') c.multiplyScalar(0.65);
      built.mesh.setColorAt(i, c);
    });
    if (built.mesh.instanceColor) built.mesh.instanceColor.needsUpdate = true;
  };
  return { group, lit: litBuilt.mesh, trees, blocks: v.count, setGround };
}

/** Tower crane next to the plot (at x, z), with red aviation lights; returns the jib to turn. */
export function buildTowerCrane(
  M: Materials,
  height: number,
  [x, z]: [number, number] = [38, -30],
  cast = true,
) {
  const rig = new Rig(M);
  const root = node(null, [x, 0, z]);
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
  rig.bake({ cast });
  return { root, jib, lights, red };
}
