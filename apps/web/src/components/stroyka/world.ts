// The static site in a blocky (voxel) style: terrain, fence with banners,
// heaps, stacks, floodlight masts, flags, the city
// around. Repeated blocks are InstancedMesh; one-off props are merged.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MachineType } from '@/lib/machinePhotos';
import { BUILDING, FENCE, GATE_HALF, PIT, PRICES, rub } from '@/lib/stroyka';
import { STAGES, type WorldProgress } from '@/lib/stroyka/progress';
import { SITE } from '@/lib/site';
import { dotTexture, node, pixelTexture, Rig, Voxels, type Materials } from './kit';
import { palletBuilder } from './machines';

// 1 m blocks: finer than the first 2 m version, still one instanced draw.
export const GROUND_CELL = 1;

/** Top of the terrain at (x, z): 0 except the pit (stepped down). */
export function groundTop(x: number, z: number) {
  const inPit = x > PIT.minX && x < PIT.maxX && z > PIT.minZ && z < PIT.maxZ;
  if (!inPit) return 0;
  const margin = Math.min(x - PIT.minX, PIT.maxX - x, z - PIT.minZ, PIT.maxZ - z);
  return margin > 2.5 ? -2 : -1;
}

/** Floodlight masts: base position and where the lamp points. */
export const MASTS: { at: [number, number]; aim: [number, number] }[] = [
  { at: [-10, 40], aim: [-6, 30] },
  { at: [-40, 4], aim: [-30, 14] },
  { at: [-40, -30], aim: [-28, -20] },
  { at: [4, -50], aim: [-8, -44] },
  { at: [44, 8], aim: [34, 16] },
  { at: [40, -16], aim: [28, -24] },
];
export const MAST_HEIGHT = 11;

export interface World {
  group: THREE.Group;
  terrain: { mesh: THREE.InstancedMesh; colors: THREE.Color[] };
  heaps: { mesh: THREE.InstancedMesh; colors: THREE.Color[] };
  farGround: THREE.Mesh;
  /** Things shown only at night (beams, light pools, lit windows). */
  night: THREE.Object3D[];
  nightMaterials: THREE.Material[];
  puddles: THREE.Group;
  /** Lamp head positions, for the moving night light. */
  lampHeads: THREE.Vector3[];
  updateFlags(time: number, wind: number, toward: number): void;
  /** Redraws the «Паспорт объекта» board at the gate. */
  setPassport(p: WorldProgress): void;
  /** Billboards and branded things: tap opens the order panel with `userData.machine`. */
  clickables: THREE.Object3D[];
  /** Rotates billboard messages and lights the signs at night. */
  updateAds(time: number, night: number): void;
  /** Placeholder skyline, hidden once the real OSM city is loaded. */
  procCity: THREE.Object3D;
}

/** What a tap on an ad opens: the order panel with a machine, or an estimate. */
export type AdTarget = MachineType | 'smeta' | 'snab';

/** Ads on billboards: text, what a tap opens. */
export const AD_MESSAGES: { title: string; sub: string; machine: AdTarget }[] = [
  {
    title: 'Смета для прораба и снабженца',
    sub: 'бесплатно на сайте СпецПласт16',
    machine: 'smeta',
  },
  { title: 'Посчитай стройку за минуту', sub: 'техника, часы, материалы — смета', machine: 'snab' },
  { title: 'СпецПласт16', sub: 'аренда спецтехники с машинистом', machine: 'backhoe' },
  {
    title: 'Экскаватор-погрузчик',
    sub: `от ${rub(PRICES.other)} ₽/ч с машинистом`,
    machine: 'backhoe',
  },
  { title: 'Подача в день заявки', sub: 'свой парк · свои машинисты', machine: 'truck' },
  {
    title: 'Автокран 25 т',
    sub: `от ${rub(PRICES.crane)} ₽/ч · 32 т — ${rub(PRICES.crane32)} ₽/ч`,
    machine: 'crane',
  },
  {
    title: 'Самосвал',
    sub: `от ${rub(PRICES.truck)} ₽/ч · щебень, песок, грунт`,
    machine: 'truck',
  },
  { title: 'Автовышка', sub: `от ${rub(PRICES.agp)} ₽/ч · фасады, окна, вывески`, machine: 'agp' },
];

/** A canvas texture drawn by `draw`. */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const redraw = (fn = draw) => {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    fn(ctx);
    texture.needsUpdate = true;
  };
  redraw();
  return { texture, redraw };
}

/** «СпецПласт16 · телефон» panel for the sides of our trucks. */
export function brandTexture() {
  return canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 112, 128);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 60px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('16', 22, 66);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 50px Arial, sans-serif';
    ctx.fillText(SITE.name, 128, 46);
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillText(SITE.phone, 130, 98);
  }).texture;
}

const rand = (() => {
  let s = 12345;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
})();

function bannerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, 512, 10);
  ctx.fillRect(0, 118, 512, 10);
  // Blocky hazard stripes on the left.
  for (let i = 0; i < 4; i++) ctx.fillRect(14 + i * 22, 22, 12, 84);
  ctx.font = 'bold 54px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(SITE.name, 116, 52);
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText(`аренда спецтехники · ${SITE.phone}`, 118, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildWorld(M: Materials, mobile: boolean): World {
  const group = new THREE.Group();
  const pixels = pixelTexture();
  const voxelMat = new THREE.MeshLambertMaterial({ map: pixels });

  // ------------------------------------------------------------ terrain
  const terrain = new Voxels();
  const tmp = new THREE.Color();
  const tint = (hex: number, spread = 0.08) => {
    tmp.setHex(hex);
    const k = 1 + (rand() - 0.5) * 2 * spread;
    return tmp.clone().multiplyScalar(k);
  };
  const half = GROUND_CELL / 2;
  for (let x = -76; x < 76; x += GROUND_CELL) {
    for (let z = -80; z < 80; z += GROUND_CELL) {
      const cx = x + half;
      const cz = z + half;
      const top = groundTop(cx, cz);
      const outside = cx < FENCE.minX || cx > FENCE.maxX || cz < FENCE.minZ || cz > FENCE.maxZ;
      let color = 0x9a7a52;
      if (outside) color = rand() < 0.15 ? 0x6f8a3c : 0x5f7d36;
      if (Math.abs(cx) < 5 && cz > -16) color = 0x7d7a74; // haul road from the gate
      if (cz > -19 && cz < -9 && cx < 5 && cx > -80) color = 0x7d7a74; // west road
      if (
        cx > BUILDING.minX - 3 &&
        cx < BUILDING.maxX + 3 &&
        cz > BUILDING.minZ - 3 &&
        cz < BUILDING.maxZ + 3
      )
        color = 0xa8a39a;
      if (top < 0) color = top < -1 ? 0x5e4129 : 0x6e4d30;
      // The plot is drawn by the project (pit, foundation, building).
      const plot =
        cx > BUILDING.minX && cx < BUILDING.maxX && cz > BUILDING.minZ && cz < BUILDING.maxZ;
      if (plot) continue;
      terrain.add(cx, top - half, cz, tint(color), GROUND_CELL);
    }
  }
  const terrainBuilt = terrain.build(voxelMat, { receive: true });
  group.add(terrainBuilt.mesh);

  // Ground beyond the block terrain: a frame around it, so it never covers the pits.
  const frame: THREE.BufferGeometry[] = [];
  const R = 700;
  const T = { minX: -76, maxX: 76, minZ: -80, maxZ: 80 };
  for (const [x0, x1, z0, z1] of [
    [-R, R, -R, T.minZ],
    [-R, R, T.maxZ, R],
    [-R, T.minX, T.minZ, T.maxZ],
    [T.maxX, R, T.minZ, T.maxZ],
  ] as [number, number, number, number][]) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, -0.05, (z0 + z1) / 2);
    frame.push(g);
  }
  const farGround = new THREE.Mesh(
    mergeGeometries(frame)!,
    new THREE.MeshLambertMaterial({ color: 0x5a7434 }),
  );
  farGround.receiveShadow = false;
  group.add(farGround);

  // ------------------------------------------------------------ heaps, stacks (1 m blocks)
  const heaps = new Voxels();
  const heap = (cx: number, cz: number, r: number, h: number, color: number) => {
    for (let y = 0; y < h; y++) {
      const rr = r * (1 - y / h);
      for (let x = -Math.floor(rr); x <= Math.floor(rr); x++)
        for (let z = -Math.floor(rr); z <= Math.floor(rr); z++) {
          if (x * x + z * z > rr * rr + 0.5) continue;
          heaps.add(cx + x, y + 0.5, cz + z, tint(color, 0.1));
        }
    }
  };
  heap(-36, 32, 4.2, 4, 0x7a5434); // spoil from the pit
  heap(-47, 30, 3.2, 3, 0x7a5434);
  heap(-35, -16.5, 2.4, 2, 0x8f8c86); // gravel the truck tips
  heap(-12, -60, 3, 3, 0xd8b36a); // sand at the yard
  heap(9, 30, 2.6, 3, 0xd8b36a);
  heap(26, 6, 2.5, 2, 0x7a5434); // the dozer's spoil
  // Block stacks in the yard (pallets of aerated blocks).
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++)
      for (let y = 0; y < 2; y++)
        heaps.add(-31 + i * 1.6, y + 0.5, -51.5 + j * 1.6, tint(0xe2ddd3, 0.04));
  // Cones along the haul road.
  for (const [x, z] of [
    [5.5, 40],
    [5.5, 30],
    [5.5, 20],
    [-5.5, 10],
    [5.5, -6],
    [-20, -19.6],
  ] as [number, number][]) {
    heaps.add(x, 0.2, z, 0xf97316, 0.4);
    heaps.add(x, 0.55, z, 0xf1f5f9, 0.3);
    heaps.add(x, 0.8, z, 0xf97316, 0.2);
  }
  const heapsBuilt = heaps.build(voxelMat, { cast: true, receive: true });
  group.add(heapsBuilt.mesh);

  // ------------------------------------------------------------ fence (1 m blocks)
  const fence = new Voxels();
  const fenceColor = (i: number) => (i % 4 === 0 ? 0x26374a : 0x2f4356);
  let i = 0;
  const fenceAt = (x: number, z: number) => {
    fence.add(x, 0.5, z, tint(fenceColor(i), 0.04));
    fence.add(x, 1.5, z, tint(fenceColor(i), 0.04));
    if (i % 4 === 0) fence.add(x, 2.25, z, 0xf59e0b, 0.5);
    i++;
  };
  for (let x = FENCE.minX; x <= FENCE.maxX; x++) {
    fenceAt(x, FENCE.minZ);
    if (Math.abs(x) > GATE_HALF) fenceAt(x, FENCE.maxZ);
  }
  for (let z = FENCE.minZ + 1; z < FENCE.maxZ; z++) {
    if (!(z > -20 && z < -13)) fenceAt(FENCE.minX, z); // back gate for the trucks
    fenceAt(FENCE.maxX, z);
  }
  // Gate posts.
  for (const x of [-GATE_HALF - 1, GATE_HALF + 1])
    for (let y = 0; y < 4; y++) fence.add(x, y + 0.5, FENCE.maxZ, y === 3 ? 0xf59e0b : 0x1f2937);
  group.add(fence.build(voxelMat, { cast: true, receive: true }).mesh);

  // Banners: «СпецПласт16» on the fence, inside and at the gate outside.
  const bannerGeos: THREE.BufferGeometry[] = [];
  const banner = (x: number, z: number, rotY: number) => {
    const g = new THREE.PlaneGeometry(6, 1.5);
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, 1.25, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    bannerGeos.push(g);
  };
  banner(-13, FENCE.maxZ + 0.52, 0);
  banner(13, FENCE.maxZ + 0.52, 0);
  banner(-14, FENCE.maxZ - 0.52, Math.PI);
  banner(14, FENCE.maxZ - 0.52, Math.PI);
  banner(-20, FENCE.minZ + 0.52, 0);
  banner(20, FENCE.minZ + 0.52, 0);
  banner(FENCE.maxX - 0.52, 20, -Math.PI / 2);
  banner(FENCE.maxX - 0.52, -30, -Math.PI / 2);
  banner(FENCE.minX + 0.52, 34, Math.PI / 2);
  const banners = new THREE.Mesh(
    mergeGeometries(bannerGeos)!,
    new THREE.MeshLambertMaterial({ map: bannerTexture() }),
  );
  group.add(banners);

  // ------------------------------------------------------------ props (merged)
  const props = new Rig(M);
  const propsNode = node(group);
  // Pallets around the yard and inside the building.
  const pallet = palletBuilder(props);
  for (const [x, z] of [
    [-24, -52],
    [-22.5, -52],
    [18, -25],
    [19.5, -25],
    [30, -33],
  ] as [number, number][]) {
    const p = node(propsNode, [x, 0, z]);
    pallet(p);
  }
  // Site cabin (прорабская): blocky container with a lit window.
  props.box(propsNode, [6, 2.6, 2.6], 'cabin', [18.5, 1.4, 52.1]);
  props.box(propsNode, [6.2, 0.15, 2.8], 'white', [18.5, 2.75, 52.1]);
  props.box(propsNode, [1.6, 0.9, 0.06], 'glass', [16.5, 1.7, 50.78]);
  props.box(propsNode, [0.9, 2, 0.06], 'dark', [19.8, 1.1, 50.78]);
  props.box(propsNode, [0.8, 0.8, 0.8], 'red', [22, 0.4, 50.4]);
  // Rebar bundles and blocky pipes.
  for (let k = 0; k < 6; k++)
    props.box(propsNode, [6, 0.12, 0.12], 'dark', [-8, 0.1 + (k % 2) * 0.13, -26 + k * 0.15]);
  for (let k = 0; k < 3; k++)
    props.box(propsNode, [5, 0.5, 0.5], 'steel', [
      -48,
      0.27 + (k === 2 ? 0.5 : 0),
      2 + (k % 2) * 0.55,
    ]);
  // Portable toilet and a container near the gate.
  props.box(propsNode, [1.2, 2.3, 1.2], 'cabin', [-14, 1.15, 56]);
  // «Сметный отдел»: the estimates office cabin (tap opens /smeta).
  props.box(propsNode, [6, 2.6, 2.4], 'amber', [-20, 1.3, 50]);
  props.box(propsNode, [6.2, 0.15, 2.6], 'white', [-20, 2.68, 50]);
  props.box(propsNode, [1.6, 0.9, 0.06], 'glass', [-21.5, 1.6, 48.78]);
  props.box(propsNode, [0.9, 2, 0.06], 'dark', [-18.3, 1.05, 48.78]);
  // Floodlight masts with lamp heads.
  const lampHeads: THREE.Vector3[] = [];
  for (const mast of MASTS) {
    const [x, z] = mast.at;
    props.box(propsNode, [0.35, MAST_HEIGHT, 0.35], 'dark', [x, MAST_HEIGHT / 2, z]);
    props.box(propsNode, [1.0, 1.0, 1.0], 'concrete', [x, 0.5, z]);
    const rot = Math.atan2(mast.aim[0] - x, mast.aim[1] - z);
    props.box(propsNode, [2.4, 0.3, 0.3], 'dark', [x, MAST_HEIGHT, z], [0, rot + Math.PI / 2, 0]);
    for (const s of [-0.7, 0.7]) {
      const lx = x + Math.cos(rot) * s;
      const lz = z - Math.sin(rot) * s;
      props.box(propsNode, [0.6, 0.5, 0.3], 'lamp', [lx, MAST_HEIGHT + 0.35, lz], [0.5, rot, 0]);
    }
    lampHeads.push(new THREE.Vector3(x, MAST_HEIGHT, z));
  }
  // Flag poles at the gate and on the building.
  const flagPoles = [
    new THREE.Vector3(-GATE_HALF - 3, 0, FENCE.maxZ + 1.5),
    new THREE.Vector3(GATE_HALF + 3, 0, FENCE.maxZ + 1.5),
    new THREE.Vector3(BUILDING.minX + 1, 12, BUILDING.minZ + 1),
  ];
  for (const p of flagPoles) props.box(propsNode, [0.15, 7, 0.15], 'steel', [p.x, p.y + 3.5, p.z]);

  // Distant city and trees outside the fence.
  const city = new Voxels();
  for (let k = 0; k < (mobile ? 60 : 110); k++) {
    const a = rand() * Math.PI * 2;
    const r = 140 + rand() * 120;
    const h = 6 + Math.floor(rand() * 9) * 3;
    const w = 8 + Math.floor(rand() * 3) * 4;
    const shade = 0x8a8f98 + Math.floor(rand() * 3) * 0x0a0a0a;
    city.add(Math.cos(a) * r, h / 2, Math.sin(a) * r, shade, w, h, w);
  }
  const cityBuilt = city.build(voxelMat, { receive: false });
  group.add(cityBuilt.mesh);
  const trees = new Voxels();
  for (let k = 0; k < (mobile ? 45 : 90); k++) {
    let x = 0;
    let z = 0;
    do {
      x = (rand() - 0.5) * 200;
      z = (rand() - 0.5) * 210;
    } while (Math.abs(x) < 68 && Math.abs(z - 2) < 72);
    if (Math.abs(x) < 9 && z > 64) continue;
    const h = 2 + Math.floor(rand() * 3);
    for (let y = 0; y < h; y++) trees.add(x, y + 0.5, z, 0x5b3d22);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dy = 0; dy < 2; dy++)
          if (dy === 0 || (dx === 0 && dz === 0) || rand() > 0.5)
            trees.add(x + dx, h + dy + 0.5, z + dz, tint(0x3f6a2a, 0.12));
  }
  group.add(trees.build(voxelMat, { cast: false, receive: false }).mesh);
  // A couple of tower cranes on neighbouring sites.
  for (const [x, z, rot] of [
    [-120, -90, 0.6],
    [140, 30, 2.2],
  ] as [number, number, number][]) {
    const tower = node(propsNode, [x, 0, z]);
    tower.rotation.y = rot;
    props.box(tower, [1.6, 42, 1.6], 'amber', [0, 21, 0]);
    props.box(tower, [40, 1.2, 1.2], 'amber', [8, 42.5, 0]);
    props.box(tower, [3, 2, 2], 'dark', [-10, 41.5, 0]);
  }
  props.bake({ cast: true, receive: true });

  // ------------------------------------------------------------ night-only things
  const night: THREE.Object3D[] = [];
  const glow = dotTexture();
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe1a6,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xffcf86,
    map: glow,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const beamGeo = new THREE.CylinderGeometry(0.4, 6, 1, 4, 1, true);
  const poolGeos: THREE.BufferGeometry[] = [];
  const beamGeos: THREE.BufferGeometry[] = [];
  for (const mast of MASTS) {
    const [x, z] = mast.at;
    const [ax, az] = mast.aim;
    const top = new THREE.Vector3(x, MAST_HEIGHT + 0.2, z);
    const bottom = new THREE.Vector3(ax, 0, az);
    const dir = bottom.clone().sub(top);
    const g = beamGeo.clone();
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        top.clone().add(bottom).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, -1, 0),
          dir.clone().normalize(),
        ),
        new THREE.Vector3(1, dir.length(), 1),
      ),
    );
    beamGeos.push(g);
    const pool = new THREE.PlaneGeometry(22, 22);
    pool.rotateX(-Math.PI / 2);
    pool.translate(ax, 0.06, az);
    poolGeos.push(pool);
  }
  const beams = new THREE.Mesh(mergeGeometries(beamGeos)!, beamMat);
  const pools = new THREE.Mesh(mergeGeometries(poolGeos)!, poolMat);
  beams.renderOrder = 2;
  pools.renderOrder = 1;
  night.push(beams, pools);
  // Lit windows: warm panes set into the 2nd-floor holes, the cabin window, a lamp inside.
  const paneGeos: THREE.BufferGeometry[] = [];
  const cabinPane = new THREE.PlaneGeometry(1.5, 0.8);
  cabinPane.translate(16.5, 1.7, 50.74);
  paneGeos.push(cabinPane);
  const smetaPane = new THREE.PlaneGeometry(1.5, 0.8);
  smetaPane.translate(-21.5, 1.6, 48.74);
  paneGeos.push(smetaPane);
  const paneMat = new THREE.MeshBasicMaterial({
    color: 0xffc46b,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
  });
  const panes = new THREE.Mesh(mergeGeometries(paneGeos)!, paneMat);
  night.push(panes);
  night.forEach((o) => group.add(o));

  // ------------------------------------------------------------ puddles (shown when wet)
  const puddles = new THREE.Group();
  const puddleMat = new THREE.MeshPhongMaterial({
    color: 0x2a3440,
    specular: 0xbfc8d6,
    shininess: 90,
    transparent: true,
    opacity: 0.85,
  });
  const puddleGeos: THREE.BufferGeometry[] = [];
  for (const [x, z, w, d] of [
    [1, 36, 3, 2],
    [-2, 18, 2, 4],
    [2, 2, 4, 2],
    [-14, -14, 4, 2],
    [-26, -16, 3, 2],
    [-6, -40, 2, 3],
    [10, -30, 4, 2],
    [-16, 4, 2, 2],
    [24, 40, 3, 2],
    [-30, -36, 2, 2],
  ]) {
    const g = new THREE.PlaneGeometry(w!, d!);
    g.rotateX(-Math.PI / 2);
    g.translate(x!, 0.03, z!);
    puddleGeos.push(g);
  }
  const puddleMesh = new THREE.Mesh(mergeGeometries(puddleGeos)!, puddleMat);
  puddleMesh.receiveShadow = true;
  puddles.add(puddleMesh);
  puddles.visible = false;
  group.add(puddles);

  // ------------------------------------------------------------ flags (segments flutter)
  const SEGMENTS = 6;
  const flagMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial(),
    flagPoles.length * SEGMENTS,
  );
  for (let f = 0; f < flagPoles.length; f++)
    for (let s = 0; s < SEGMENTS; s++)
      flagMesh.setColorAt(
        f * SEGMENTS + s,
        new THREE.Color(s % 2 === 0 || f === 2 ? 0xf59e0b : 0x111827),
      );
  flagMesh.castShadow = true;
  flagMesh.frustumCulled = false;
  group.add(flagMesh);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3(0.42, 1.0, 0.06);
  const updateFlags = (time: number, wind: number, toward: number) => {
    // Flags stream downwind; with no wind they hang down.
    const lift = Math.min(1, wind / 8);
    const freq = 2 + wind * 0.9;
    for (let f = 0; f < flagPoles.length; f++) {
      const pole = flagPoles[f]!;
      let ox = 0;
      let oz = 0;
      let oy = 6.4;
      let angle = toward;
      for (let s = 0; s < SEGMENTS; s++) {
        const wave = Math.sin(time * freq - s * 0.9 + f) * (0.15 + 0.35 * lift);
        angle = toward + wave;
        const step = 0.42;
        const droop = (1 - lift) * 0.32 + 0.04;
        ox += Math.sin(angle) * step * (1 - droop);
        oz += Math.cos(angle) * step * (1 - droop);
        oy -= droop * step;
        p.set(pole.x + ox, pole.y + oy, pole.z + oz);
        e.set(0, angle + Math.PI / 2, 0);
        q.setFromEuler(e);
        m4.compose(p, q, sc);
        flagMesh.setMatrixAt(f * SEGMENTS + s, m4);
      }
    }
    flagMesh.instanceMatrix.needsUpdate = true;
  };
  updateFlags(0, 3, 0);

  // ------------------------------------------------------------ signs and billboards
  const clickables: THREE.Object3D[] = [];
  const signMesh = (
    tex: THREE.Texture,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    rotY: number,
    lit = false,
  ) => {
    const mat = lit
      ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      : new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    group.add(mesh);
    return mesh;
  };
  const signs = new Rig(M);
  const signNode = node(group);
  // Passport board inside the gate, facing the visitor walking in.
  const passport = canvasTexture(512, 384, () => {});
  signs.box(signNode, [0.2, 4.2, 0.2], 'dark', [-12.4, 2.1, 59.6]);
  signs.box(signNode, [0.2, 4.2, 0.2], 'dark', [-8.6, 2.1, 59.6]);
  signs.box(signNode, [4.2, 3.1, 0.12], 'dark', [-10.5, 2.75, 59.5]);
  signMesh(passport.texture, 4, 3, -10.5, 2.75, 59.58, 0);
  const setPassport = (p: WorldProgress) =>
    passport.redraw((ctx) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 512, 384);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 0, 512, 64);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('ПАСПОРТ ОБЪЕКТА', 20, 34);
      ctx.font = 'bold 34px Arial, sans-serif';
      ctx.fillText(p.projectName, 20, 104);
      ctx.font = '22px Arial, sans-serif';
      ctx.fillText(`Генподрядчик и техника: ${SITE.name}`, 20, 148);
      ctx.fillText(`Квартал ${SITE.name} · объект № ${p.projectIndex + 1}`, 20, 180);
      ctx.fillText('Старт квартала: 01.10.2026', 20, 212);
      ctx.fillText(`Сейчас: ${p.stageName} · ${p.totalPercent}%`, 20, 252);
      const step = 472 / STAGES.length;
      STAGES.forEach((stage, i) => {
        ctx.fillStyle = i < p.stage ? '#16a34a' : i === p.stage ? '#f59e0b' : '#cbd5e1';
        ctx.fillRect(20 + i * step, 290, step - 6, 22);
      });
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      const mx = 20 + (p.stage + p.stagePercent / 100) * step;
      ctx.moveTo(mx, 318);
      ctx.lineTo(mx - 10, 336);
      ctx.lineTo(mx + 10, 336);
      ctx.fill();
      ctx.font = '18px Arial, sans-serif';
      ctx.fillText(SITE.phone, 20, 362);
    });
  // Gate sign over the entrance.
  signs.box(signNode, [GATE_HALF * 2 + 3, 1.3, 0.3], 'dark', [0, 4.6, FENCE.maxZ]);
  const gateSign = canvasTexture(1024, 96, (ctx) => {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 1024, 96);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 46px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(`${SITE.platform} · генподрядчик и техника: ${SITE.name}`, 512, 50);
  });
  signMesh(gateSign.texture, GATE_HALF * 2 + 2.6, 1.1, 0, 4.6, FENCE.maxZ + 0.17, 0, true);
  // Neon on the site cabin.
  const neonTex = canvasTexture(512, 96, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 512, 96);
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 64px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(SITE.name, 256, 50);
  });
  const neon = signMesh(neonTex.texture, 4, 0.75, 18.5, 3.2, 50.75, 0, true);
  // Neon over the estimates office.
  const smetaTex = canvasTexture(768, 128, (ctx) => {
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#bae6fd';
    ctx.font = 'bold 54px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(`Сметный отдел ${SITE.name}`, 384, 66);
  });
  const smetaSign = signMesh(smetaTex.texture, 5.6, 0.95, -20, 3.25, 48.74, 0, true);
  (smetaSign.material as THREE.MeshBasicMaterial).transparent = true;
  smetaSign.userData.machine = 'smeta';
  clickables.push(smetaSign);
  const smetaDoor = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 2.6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  smetaDoor.position.set(-20, 1.3, 48.7);
  smetaDoor.userData.machine = 'smeta';
  group.add(smetaDoor);
  clickables.push(smetaDoor);
  (neon.material as THREE.MeshBasicMaterial).transparent = true;
  neon.userData.machine = 'backhoe';
  clickables.push(neon);
  // Billboards with rotating offers.
  const boards: {
    redraw: (fn?: (ctx: CanvasRenderingContext2D) => void) => void;
    mesh: THREE.Mesh;
    shown: number;
  }[] = [];
  for (const [x, z, rot, offset] of [
    [-26, 76, 0.25, 0],
    [-30, 47, 1.25, 2],
    [-54, -26, Math.PI / 2, 4],
  ] as [number, number, number, number][]) {
    const b = node(signNode, [x, 0, z]);
    b.rotation.y = rot;
    signs.box(b, [0.4, 5, 0.4], 'dark', [-2.6, 2.5, -0.3]);
    signs.box(b, [0.4, 5, 0.4], 'dark', [2.6, 2.5, -0.3]);
    signs.box(b, [8.3, 4.3, 0.25], 'dark', [0, 6.6, -0.2]);
    const tex = canvasTexture(768, 384, () => {});
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 4),
      new THREE.MeshLambertMaterial({
        map: tex.texture,
        emissive: 0xffffff,
        emissiveMap: tex.texture,
        emissiveIntensity: 0,
      }),
    );
    mesh.position.set(0, 6.6, -0.06);
    b.add(mesh);
    boards.push({ redraw: tex.redraw, mesh, shown: -1 + offset * 0 });
    mesh.userData.offset = offset;
    clickables.push(mesh);
  }
  const drawAd = (i: number) => (ctx: CanvasRenderingContext2D) => {
    const ad = AD_MESSAGES[i % AD_MESSAGES.length]!;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 768, 384);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 300, 768, 84);
    for (let k = 0; k < 6; k++) ctx.fillRect(24 + k * 30, 24, 16, 16);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 66px Arial, sans-serif';
    ctx.fillText(ad.title, 28, 120);
    ctx.font = '38px Arial, sans-serif';
    ctx.fillStyle = '#fde68a';
    ctx.fillText(ad.sub, 28, 200);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 50px Arial, sans-serif';
    ctx.fillText(`${SITE.phone} · ${SITE.name}`, 28, 344);
  };
  const updateAds = (time: number, night: number) => {
    const slot = Math.floor(time / 9);
    for (const board of boards) {
      const index = slot + (board.mesh.userData.offset as number);
      if (index !== board.shown) {
        board.shown = index;
        board.redraw(drawAd(index));
        board.mesh.userData.machine = AD_MESSAGES[index % AD_MESSAGES.length]!.machine;
      }
      (board.mesh.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.9 * night;
    }
    (neon.material as THREE.MeshBasicMaterial).color.setScalar(0.45 + 0.55 * night);
    (smetaSign.material as THREE.MeshBasicMaterial).color.setScalar(0.45 + 0.55 * night);
  };
  updateAds(0, 0);
  signs.bake({ cast: true, receive: true });

  return {
    group,
    terrain: { mesh: terrainBuilt.mesh, colors: terrainBuilt.colors },
    heaps: { mesh: heapsBuilt.mesh, colors: heapsBuilt.colors },
    farGround,
    night,
    nightMaterials: [beamMat, poolMat, paneMat],
    puddles,
    lampHeads,
    updateFlags,
    setPassport,
    clickables,
    updateAds,
    procCity: cityBuilt.mesh,
  };
}

/** Concrete frame the crane sets slabs on, and the stack it picks them from. */
export function buildCraneTargets(
  M: Materials,
  a: { x: number; z: number; rot: number },
  b: { x: number; z: number; rot: number },
) {
  const group = new THREE.Group();
  const rig = new Rig(M);
  const stack = node(group, [a.x, 0, a.z]);
  stack.rotation.y = a.rot;
  for (let k = 0; k < 3; k++) {
    rig.box(stack, [0.3, 0.2, 1.4], 'wood', [-2, 0.1 + k * 0.45, 0]);
    rig.box(stack, [0.3, 0.2, 1.4], 'wood', [2, 0.1 + k * 0.45, 0]);
    rig.box(stack, [6, 0.25, 1.6], 'concrete', [0, 0.32 + k * 0.45, 0]);
  }
  const frame = node(group, [b.x, 0, b.z]);
  frame.rotation.y = b.rot;
  for (const [x, z] of [
    [-2.6, -0.6],
    [2.6, -0.6],
    [-2.6, 0.6],
    [2.6, 0.6],
  ] as [number, number][])
    for (let y = 0; y < 6; y++)
      rig.box(frame, [0.8, 1, 0.8], y % 2 ? 'concrete' : 'concreteDark', [x, y + 0.5, z]);
  rig.box(frame, [6.2, 0.4, 0.5], 'concreteDark', [0, 5.8, -0.6]);
  rig.box(frame, [6.2, 0.4, 0.5], 'concreteDark', [0, 5.8, 0.6]);
  rig.bake({ cast: true, receive: true });
  return { group, stackTop: 0.32 + 2 * 0.45 + 0.125, frameTop: 6 };
}
