// The static site, in a film-like style: textured ground, fence with banners,
// heaps, stacks, floodlight masts, flags, the city
// around. Repeated blocks are InstancedMesh; one-off props are merged.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MachineType } from '@/lib/machinePhotos';
import { BUILDING, FENCE, GATE_HALF, PIT, PRICES, rub } from '@/lib/stroyka';
import { formatDate, formatMonth, STAGES, type WorldProgress } from '@/lib/stroyka/progress';
import { onOuterPlot, PLOTS } from '@/lib/stroyka/plots';
import { SITE } from '@/lib/site';
import {
  dotTexture,
  moundGeometry,
  node,
  pixelTexture,
  Rig,
  surfaceMaterial,
  Voxels,
  type Materials,
} from './kit';
import { palletBuilder } from './machines';
import { facadeMaterial } from './cityMesh';

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
  /** Dry, wet or snowy ground and heaps. */
  setGround(mode: 'dry' | 'wet' | 'snow'): void;
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
  /** Trees of the finished plots, drawn by the same instanced trees as the rest. */
  setPlotTrees(spots: [number, number, number][]): void;
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
  { title: 'Без булдырабыз!', sub: 'Мы сможем — техника СпецПласт16', machine: 'backhoe' },
  {
    title: 'Экскаватор-погрузчик',
    sub: `от ${rub(PRICES.other)} ₽/ч с машинистом`,
    machine: 'backhoe',
  },
  { title: 'Подача в день заявки', sub: 'свой парк · свои машинисты', machine: 'truck' },
  {
    title: 'Автокран 25 т',
    sub: `от ${rub(PRICES.crane)} ₽/ч с машинистом · есть и 32 т`,
    machine: 'crane',
  },
  {
    title: 'Самосвал',
    sub: `от ${rub(PRICES.truck)} ₽/ч с машинистом`,
    machine: 'truck',
  },
  { title: 'Автовышка', sub: `от ${rub(PRICES.agp)} ₽/ч с машинистом`, machine: 'agp' },
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

type FlagKind = 'ru' | 'tt' | 'brand';

/**
 * The flag of Russia (white, blue, red), of Tatarstan (green, a narrow white
 * band, red: 7/15, 1/15, 7/15) or ours with the «16» mark and the name.
 */
function flagTexture(kind: FlagKind) {
  return canvasTexture(240, 160, (ctx) => {
    if (kind === 'ru') {
      for (const [i, c] of ['#ffffff', '#0039a6', '#d52b1e'].entries()) {
        ctx.fillStyle = c;
        ctx.fillRect(0, (i * 160) / 3, 240, 160 / 3 + 1);
      }
    } else if (kind === 'tt') {
      ctx.fillStyle = '#009a49';
      ctx.fillRect(0, 0, 240, 75);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 74, 240, 12);
      ctx.fillStyle = '#ce1126';
      ctx.fillRect(0, 85, 240, 75);
    } else {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 0, 240, 160);
      ctx.fillStyle = '#111827';
      ctx.fillRect(18, 30, 64, 64);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 40px Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('16', 27, 64);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.fillText('Спец', 92, 48);
      ctx.fillText('Пласт16', 92, 82);
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.fillText('аренда спецтехники', 20, 128);
    }
  }).texture;
}

/** «Без булдырабыз!» — «Мы сможем!», the famous Tatarstan builders' motto. */
function sloganTexture() {
  return canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#009a49';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 60, 512, 8);
    ctx.fillStyle = '#ce1126';
    ctx.fillRect(0, 66, 512, 62);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 50px Arial, sans-serif';
    ctx.fillText('БЕЗ БУЛДЫРАБЫЗ!', 256, 36);
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText(`Мы сможем! · ${SITE.name} · ${SITE.phone}`, 256, 98);
  }).texture;
}

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
  const voxelMat = new THREE.MeshStandardMaterial({ map: pixels, roughness: 0.85 });

  // ------------------------------------------------------------ terrain
  // One smooth ground mesh (1 m grid, the pit sloping down) with the mud
  // photo texture; vertex colours tint zones (roads, grass outside, wet or
  // snowy ground). The plot is drawn by the project (pit, foundation).
  const tmp = new THREE.Color();
  const tint = (hex: number, spread = 0.08) => {
    tmp.setHex(hex);
    const k = 1 + (rand() - 0.5) * 2 * spread;
    return tmp.clone().multiplyScalar(k);
  };
  const T = { minX: -76, maxX: 76, minZ: -80, maxZ: 80 };
  const nx = T.maxX - T.minX + 1;
  const nz = T.maxZ - T.minZ + 1;
  const positions = new Float32Array(nx * nz * 3);
  const uvs = new Float32Array(nx * nz * 2);
  const baseColors = new Float32Array(nx * nz * 3);
  const zoneColor = (x: number, z: number, top: number) => {
    const outside = x < FENCE.minX || x > FENCE.maxX || z < FENCE.minZ || z > FENCE.maxZ;
    if (top < 0) return top < -1 ? 0x8a6c55 : 0x9a7b62; // pit walls: darker, damp
    if (outside) return rand() < 0.15 ? 0x7f9a52 : 0x6f8c46; // grass over mud
    if (Math.abs(x) < 5 && z > -16) return 0xa8a6a2; // haul road from the gate
    if (z > -19 && z < -9 && x < 5) return 0xa8a6a2; // west road
    if (
      x > BUILDING.minX - 3 &&
      x < BUILDING.maxX + 3 &&
      z > BUILDING.minZ - 3 &&
      z < BUILDING.maxZ + 3
    )
      return 0xc9c3ba;
    return 0xe6d6c4;
  };
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = T.minX + i;
      const z = T.minZ + j;
      const k = j * nx + i;
      const top = groundTop(x, z);
      positions.set([x, top + (top === 0 ? (rand() - 0.5) * 0.06 : 0), z], k * 3);
      uvs.set([x / 4, z / 4], k * 2);
      const c = tint(zoneColor(x, z, top), 0.06);
      baseColors.set([c.r, c.g, c.b], k * 3);
    }
  const index: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const cx = T.minX + i + 0.5;
      const cz = T.minZ + j + 0.5;
      const plot =
        cx > BUILDING.minX && cx < BUILDING.maxX && cz > BUILDING.minZ && cz < BUILDING.maxZ;
      if (plot) continue;
      const a0 = j * nx + i;
      const b0 = a0 + 1;
      const c0 = a0 + nx;
      const d0 = c0 + 1;
      index.push(a0, c0, b0, b0, c0, d0);
    }
  const groundGeo = new THREE.BufferGeometry();
  groundGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  groundGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const groundColors = new THREE.BufferAttribute(baseColors.slice(), 3);
  groundGeo.setAttribute('color', groundColors);
  groundGeo.setIndex(index);
  groundGeo.computeVertexNormals();
  const groundMat = surfaceMaterial('brown_mud_02', 1, { vertexColors: true });
  // Break up the tiling like a real site: large patches of drier clay and
  // darker damp soil, by world position (two noise octaves, no texture).
  groundMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGroundXZ;
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
        }
        float gPatch;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        gPatch = gNoise(vGroundXZ / 23.0) * 0.65 + gNoise(vGroundXZ / 7.0) * 0.35;
        vec3 clay = diffuseColor.rgb * vec3(1.28, 1.16, 1.0);
        vec3 damp = diffuseColor.rgb * vec3(0.72, 0.7, 0.68);
        diffuseColor.rgb = mix(damp, clay, smoothstep(0.25, 0.8, gPatch));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(0.82, 1.08, gPatch), 0.0, 1.0);`,
      );
  };
  groundMat.customProgramCacheKey = () => 'ground-patches';
  const terrainMesh = new THREE.Mesh(groundGeo, groundMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // Ground beyond the site: a frame around it, so it never covers the pits,
  // with holes where the district plots draw their own ground (and pits).
  const frame: THREE.BufferGeometry[] = [];
  const R = 700;
  const holes = [T, ...PLOTS.slice(1)];
  const xs = [...new Set([-R, R, ...holes.flatMap((h) => [h.minX, h.maxX])])].sort((a, b) => a - b);
  const zs = [...new Set([-R, R, ...holes.flatMap((h) => [h.minZ, h.maxZ])])].sort((a, b) => a - b);
  const quads: [number, number, number, number][] = [];
  for (let j = 0; j + 1 < zs.length; j++) {
    let run: [number, number, number, number] | null = null;
    for (let k = 0; k + 1 < xs.length; k++) {
      const [x0, x1, z0, z1] = [xs[k]!, xs[k + 1]!, zs[j]!, zs[j + 1]!];
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const hole = holes.some((h) => mx > h.minX && mx < h.maxX && mz > h.minZ && mz < h.maxZ);
      if (!hole && run) run[1] = x1;
      else if (!hole) run = [x0, x1, z0, z1];
      if (hole && run) {
        quads.push(run);
        run = null;
      }
    }
    if (run) quads.push(run);
  }
  for (const [x0, x1, z0, z1] of quads) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv!;
    for (let q = 0; q < uv.count; q++)
      uv.setXY(q, (uv.getX(q) * (x1 - x0)) / 4, (uv.getY(q) * (z1 - z0)) / 4);
    g.translate((x0 + x1) / 2, -0.05, (z0 + z1) / 2);
    frame.push(g);
  }
  const farGround = new THREE.Mesh(
    mergeGeometries(frame)!,
    surfaceMaterial('brown_mud_02', 1, { color: 0x6f8c46 }),
  );
  farGround.receiveShadow = false;
  group.add(farGround);

  // ------------------------------------------------------------ heaps, stacks
  // Smooth mounds with their own photo textures: spoil, gravel, sand.
  const moundGeos: Record<'dirt' | 'gravel' | 'sand', THREE.BufferGeometry[]> = {
    dirt: [],
    gravel: [],
    sand: [],
  };
  const heap = (cx: number, cz: number, r: number, h: number, kind: 'dirt' | 'gravel' | 'sand') => {
    const g = moundGeometry().clone();
    g.scale(r * 1.15, h * 0.85, r * (0.9 + rand() * 0.2));
    g.rotateY(rand() * Math.PI);
    const uv = g.attributes.uv!;
    const p = g.attributes.position!;
    for (let q = 0; q < uv.count; q++) uv.setXY(q, p.getX(q) / 3, (p.getY(q) + p.getZ(q)) / 3);
    g.translate(cx, -0.05, cz);
    moundGeos[kind].push(g);
  };
  heap(-36, 32, 4.2, 4, 'dirt'); // spoil from the pit
  heap(-47, 30, 3.2, 3, 'dirt');
  heap(-35, -16.5, 2.4, 2, 'gravel'); // gravel the truck tips
  heap(-12, -60, 3, 3, 'sand'); // sand at the yard
  heap(9, 30, 2.6, 3, 'sand');
  heap(26, 6, 2.5, 2, 'dirt'); // the dozer's spoil
  const heapMats = {
    dirt: surfaceMaterial('brown_mud_02', 1),
    gravel: surfaceMaterial('bicolour_gravel', 1),
    sand: surfaceMaterial('coast_sand_01', 1),
  };
  const heapBase = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  for (const kind of ['dirt', 'gravel', 'sand'] as const) {
    const mesh = new THREE.Mesh(mergeGeometries(moundGeos[kind])!, heapMats[kind]);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    heapBase.set(heapMats[kind], heapMats[kind].color.clone());
  }
  // Block stacks in the yard (pallets of aerated blocks) and road cones.
  const heaps = new Voxels();
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++)
      for (let y = 0; y < 2; y++)
        heaps.add(-31 + i * 1.6, y + 0.5, -51.5 + j * 1.6, tint(0xe2ddd3, 0.04));
  group.add(heaps.build(voxelMat, { cast: true, receive: true }).mesh);
  const coneGeo = new THREE.ConeGeometry(0.22, 0.75, 16);
  const cones = new THREE.InstancedMesh(
    coneGeo,
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 }),
    6,
  );
  [
    [5.5, 40],
    [5.5, 30],
    [5.5, 20],
    [-5.5, 10],
    [5.5, -6],
    [-20, -19.6],
  ].forEach(([x, z], n) => {
    cones.setMatrixAt(n, new THREE.Matrix4().makeTranslation(x!, 0.37, z!));
  });
  cones.castShadow = true;
  group.add(cones);

  /** Dry, wet (darker) or snowy ground: tints the ground and the heaps. */
  const setGround = (mode: 'dry' | 'wet' | 'snow') => {
    const white = new THREE.Color(0xf4f7fb);
    const c = new THREE.Color();
    for (let q = 0; q < groundColors.count; q++) {
      c.setRGB(baseColors[q * 3]!, baseColors[q * 3 + 1]!, baseColors[q * 3 + 2]!);
      if (mode === 'snow') c.lerp(white, 0.85);
      if (mode === 'wet') c.multiplyScalar(0.62);
      groundColors.setXYZ(q, c.r, c.g, c.b);
    }
    groundColors.needsUpdate = true;
    // Wet ground and heaps shine a little.
    groundMat.roughness = mode === 'wet' ? 0.8 : 1;
    for (const [mat, base] of heapBase) {
      mat.color.copy(base);
      if (mode === 'snow') mat.color.lerp(white, 0.6);
      if (mode === 'wet') mat.color.multiplyScalar(0.7);
      mat.roughness = mode === 'wet' ? 0.85 : 1;
    }
    (farGround.material as THREE.MeshStandardMaterial).color.setHex(
      mode === 'snow' ? 0xe8eef4 : mode === 'wet' ? 0x4f6a34 : 0x6f8c46,
    );
  };

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
  // Every other banner carries the motto «Без булдырабыз!».
  const brandGeos = bannerGeos.filter((_, i) => i % 2 === 0);
  const sloganGeos = bannerGeos.filter((_, i) => i % 2 === 1);
  const banners = new THREE.Mesh(
    mergeGeometries(brandGeos)!,
    new THREE.MeshLambertMaterial({ map: bannerTexture() }),
  );
  const slogans = new THREE.Mesh(
    mergeGeometries(sloganGeos)!,
    new THREE.MeshLambertMaterial({ map: sloganTexture() }),
  );
  group.add(banners, slogans);
  // And a big one on the gate side of the site cabin row.
  {
    const g = new THREE.PlaneGeometry(9, 2.25);
    const board = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: sloganTexture() }));
    board.position.set(0, 7.2, FENCE.maxZ + 0.2);
    group.add(board);
  }

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
  // Flag poles (owner, 2026-10-03: the flags of Russia and Tatarstan
  // everywhere on the site, and ours): at the gate, on the building, by the
  // offices and along the fence.
  const flagPoles: { at: THREE.Vector3; kind: FlagKind }[] = [
    { at: new THREE.Vector3(-GATE_HALF - 3, 0, FENCE.maxZ + 1.5), kind: 'ru' },
    { at: new THREE.Vector3(GATE_HALF + 3, 0, FENCE.maxZ + 1.5), kind: 'tt' },
    { at: new THREE.Vector3(-GATE_HALF - 5.5, 0, FENCE.maxZ + 1.5), kind: 'brand' },
    { at: new THREE.Vector3(GATE_HALF + 5.5, 0, FENCE.maxZ + 1.5), kind: 'brand' },
    { at: new THREE.Vector3(BUILDING.minX + 1, 12, BUILDING.minZ + 1), kind: 'ru' },
    { at: new THREE.Vector3(BUILDING.maxX - 1, 12, BUILDING.minZ + 1), kind: 'tt' },
    { at: new THREE.Vector3(BUILDING.minX + 10, 12, BUILDING.minZ + 1), kind: 'brand' },
    { at: new THREE.Vector3(14.6, 0, 53.4), kind: 'ru' },
    { at: new THREE.Vector3(22.4, 0, 53.4), kind: 'tt' },
    { at: new THREE.Vector3(-23.6, 0, 51.6), kind: 'tt' },
    { at: new THREE.Vector3(-16.4, 0, 51.6), kind: 'ru' },
    { at: new THREE.Vector3(FENCE.minX + 1.5, 0, 0), kind: 'brand' },
    { at: new THREE.Vector3(FENCE.maxX - 1.5, 0, 0), kind: 'brand' },
  ];
  for (const { at: p } of flagPoles)
    props.box(propsNode, [0.15, 7, 0.15], 'steel', [p.x, p.y + 3.5, p.z]);

  // Distant city and trees outside the fence.
  const city = new Voxels();
  for (let k = 0; k < (mobile ? 60 : 110); k++) {
    const a = rand() * Math.PI * 2;
    const r = 140 + rand() * 120;
    const h = 6 + Math.floor(rand() * 9) * 3;
    const w = 8 + Math.floor(rand() * 3) * 4;
    const shade = 0x8a8f98 + Math.floor(rand() * 3) * 0x0a0a0a;
    if (onOuterPlot(Math.cos(a) * r, Math.sin(a) * r, w / 2 + 2)) continue;
    city.add(Math.cos(a) * r, h / 2, Math.sin(a) * r, shade, w, h, w);
  }
  // Until the real map loads: the same windowed facades as the city.
  const cityBuilt = city.build(facadeMaterial().material, { receive: false });
  group.add(cityBuilt.mesh);
  // Trees: a trunk and a lumpy crown of a few blobs, instanced.
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 7);
  const crownGeo = new THREE.IcosahedronGeometry(1, 2);
  {
    const cp = crownGeo.attributes.position!;
    for (let q = 0; q < cp.count; q++) {
      const v = new THREE.Vector3().fromBufferAttribute(cp, q);
      const n = 1 + 0.18 * Math.sin(v.x * 5 + v.y * 3) * Math.cos(v.z * 4 - v.y * 2);
      cp.setXYZ(q, v.x * n, v.y * n, v.z * n);
    }
    crownGeo.computeVertexNormals();
  }
  const treeSpots: [number, number, number][] = [];
  for (let k = 0; k < (mobile ? 45 : 90); k++) {
    let x = 0;
    let z = 0;
    do {
      x = (rand() - 0.5) * 200;
      z = (rand() - 0.5) * 210;
    } while (Math.abs(x) < 68 && Math.abs(z - 2) < 72);
    if (Math.abs(x) < 9 && z > 64) continue;
    if (onOuterPlot(x, z, 3)) continue;
    const h = 2 + Math.floor(rand() * 3);
    treeSpots.push([x, z, h]);
  }
  // Room for the trees of the finished district plots (same draw calls).
  const PLOT_TREES = 200;
  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshStandardMaterial({ color: 0x5b3d22, roughness: 0.95 }),
    treeSpots.length + PLOT_TREES,
  );
  const crowns = new THREE.InstancedMesh(
    crownGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    (treeSpots.length + PLOT_TREES) * 3,
  );
  const tm = new THREE.Matrix4();
  treeSpots.forEach(([x, z, h], n) => {
    trunks.setMatrixAt(
      n,
      tm.compose(
        new THREE.Vector3(x, h / 2, z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, h, 1),
      ),
    );
    for (let c = 0; c < 3; c++) {
      const r = 1.1 + rand() * 0.6;
      tm.compose(
        new THREE.Vector3(x + (rand() - 0.5) * 1.2, h + 0.6 + c * 0.55, z + (rand() - 0.5) * 1.2),
        new THREE.Quaternion(),
        new THREE.Vector3(r, r * 0.85, r),
      );
      crowns.setMatrixAt(n * 3 + c, tm);
      crowns.setColorAt(n * 3 + c, tint(0x3f6a2a, 0.15));
    }
  });
  const placeTree = ([x, z, h]: [number, number, number], n: number, k: number) => {
    trunks.setMatrixAt(
      n,
      tm.compose(
        new THREE.Vector3(x, h / 2, z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, h, 1),
      ),
    );
    for (let c = 0; c < 3; c++) {
      // Deterministic jitter (not rand(): the plot trees change with the timeline).
      const j = Math.sin((n * 3 + c) * 12.9898 + k) * 0.5;
      const r = 1.1 + (j + 0.5) * 0.6;
      tm.compose(
        new THREE.Vector3(x + j * 1.2, h + 0.6 + c * 0.55, z - j * 1.1),
        new THREE.Quaternion(),
        new THREE.Vector3(r, r * 0.85, r),
      );
      crowns.setMatrixAt(n * 3 + c, tm);
      crowns.setColorAt(
        n * 3 + c,
        new THREE.Color(0x3f6a2a).multiplyScalar(0.9 + (j + 0.5) * 0.25),
      );
    }
  };
  const setPlotTrees = (spots: [number, number, number][]) => {
    const list = spots.slice(0, PLOT_TREES);
    list.forEach((spot, i) => placeTree(spot, treeSpots.length + i, 7));
    trunks.count = treeSpots.length + list.length;
    crowns.count = trunks.count * 3;
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
  };
  setPlotTrees([]);
  group.add(trunks, crowns);
  // A couple of tower cranes on neighbouring sites (clear of the district plots).
  for (const [x, z, rot] of [
    [-120, -90, 0.6],
    [205, 40, 0.15],
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

  // ------------------------------------------------------------ flags (cloth that flutters)
  // Each flag is a cloth of 12×4 cells: the vertices wave with the wind
  // every frame, the texture is the real flag.
  const FLAG_W = 2.4;
  const FLAG_H = 1.6;
  const COLS = 12;
  const flagTextures: Record<FlagKind, THREE.Texture> = {
    ru: flagTexture('ru'),
    tt: flagTexture('tt'),
    brand: flagTexture('brand'),
  };
  const flags = flagPoles.map(({ at, kind }) => {
    const geo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, COLS, 4);
    geo.translate(FLAG_W / 2, 0, 0);
    const base = Float32Array.from(geo.attributes.position!.array);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: flagTextures[kind],
        side: THREE.DoubleSide,
        roughness: 0.85,
      }),
    );
    mesh.position.set(at.x, at.y + 6.2, at.z);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { mesh, base, phase: at.x * 0.37 + at.z * 0.11 };
  });
  const updateFlags = (time: number, wind: number, toward: number) => {
    // Flags stream downwind; with no wind they hang down along the pole.
    const lift = Math.min(1, wind / 8);
    const freq = 2 + wind * 0.9;
    for (const f of flags) {
      f.mesh.rotation.y = toward - Math.PI / 2;
      const pos = f.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const x = f.base[i * 3]!;
        const y = f.base[i * 3 + 1]!;
        const k = x / FLAG_W; // 0 at the pole, 1 at the free edge
        const wave = Math.sin(time * freq - x * 2.6 + f.phase) * (0.06 + 0.22 * lift) * k;
        // Hanging: the cloth swings down toward the pole as the wind drops.
        const hang = (1 - lift) * k;
        arr[i * 3] = x * (1 - hang * 0.55);
        arr[i * 3 + 1] = y - hang * x * 0.75;
        arr[i * 3 + 2] = wave + Math.sin(time * 1.3 + y * 3 + f.phase) * 0.03 * k;
      }
      pos.needsUpdate = true;
      f.mesh.geometry.computeVertexNormals();
    }
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
      ctx.fillText(
        `Начало работ: ${formatDate(p.startedAt)} · сдача ≈ ${formatMonth(p.finishAt)}`,
        20,
        212,
      );
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
    const text = `${SITE.platform} · генподрядчик и техника: ${SITE.name}`;
    let px = 46;
    do ctx.font = `bold ${px--}px Arial, sans-serif`;
    while (ctx.measureText(text).width > 980 && px > 20);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, 512, 50);
  });
  signMesh(gateSign.texture, GATE_HALF * 2 + 2.6, 1.1, 0, 4.6, FENCE.maxZ + 0.17, 0, true);
  // Safety signs in Russian and Tatar (owner, 2026-10-03: more Tatar on site).
  const SAFETY: { tt: string; ru: string; at: [number, number]; rot: number; color: string }[] = [
    {
      tt: 'Рәхим итегез!',
      ru: 'Добро пожаловать!',
      at: [-6, 62.2],
      rot: Math.PI,
      color: '#16a34a',
    },
    { tt: 'Каска киегез', ru: 'Работать в каске', at: [6, 62.2], rot: Math.PI, color: '#2563eb' },
    {
      tt: 'Сак булыгыз! Техника эшли',
      ru: 'Осторожно! Работает техника',
      at: [-26, 30],
      rot: Math.PI * 0.75,
      color: '#dc2626',
    },
    {
      tt: 'Стрела астында басмагыз',
      ru: 'Не стоять под стрелой',
      at: [26, 28],
      rot: -Math.PI * 0.6,
      color: '#dc2626',
    },
    {
      tt: 'Төзелеш мәйданы',
      ru: 'Строительная площадка',
      at: [-40, 56],
      rot: Math.PI * 0.85,
      color: '#f59e0b',
    },
  ];
  for (const sign of SAFETY) {
    const [sx, sz] = sign.at;
    const tex = canvasTexture(384, 256, (ctx) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 384, 256);
      ctx.fillStyle = sign.color;
      ctx.fillRect(0, 0, 384, 26);
      ctx.fillRect(0, 230, 384, 26);
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fit = (text: string, size: number, y: number) => {
        let px = size;
        do ctx.font = `bold ${px--}px Arial, sans-serif`;
        while (ctx.measureText(text).width > 350 && px > 14);
        ctx.fillText(text, 192, y);
      };
      fit(sign.tt, 38, 92);
      ctx.fillStyle = '#475569';
      fit(sign.ru, 30, 158);
    });
    const ux = Math.sin(sign.rot);
    const uz = Math.cos(sign.rot);
    signs.box(signNode, [0.12, 2.6, 0.12], 'dark', [sx, 1.3, sz]);
    signs.box(signNode, [1.7, 1.15, 0.06], 'dark', [sx, 2.25, sz], [0, sign.rot, 0]);
    signMesh(tex.texture, 1.6, 1.07, sx + ux * 0.04, 2.25, sz + uz * 0.04, sign.rot);
  }
  // Big «СпецПласт16» boards at the corners, seen from anywhere on the site.
  const bigBrand = canvasTexture(1024, 384, (ctx) => {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 1024, 384);
    ctx.fillStyle = '#111827';
    ctx.fillRect(40, 60, 230, 230);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 150px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('16', 62, 182);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 120px Arial, sans-serif';
    ctx.fillText(SITE.name, 300, 130);
    ctx.font = 'bold 44px Arial, sans-serif';
    ctx.fillText('Аренда спецтехники · махсус техника арендага', 300, 232);
    ctx.font = 'bold 56px Arial, sans-serif';
    ctx.fillText(SITE.phone, 300, 316);
  });
  for (const [bx, bz, rot] of [
    [-54, 58, Math.PI * 0.8],
    [54, 58, -Math.PI * 0.8],
    [-54, -58, Math.PI * 0.2],
    [54, -58, -Math.PI * 0.2],
  ] as [number, number, number][]) {
    const ux = Math.sin(rot);
    const uz = Math.cos(rot);
    for (const s2 of [-2.6, 2.6])
      signs.box(signNode, [0.3, 6, 0.3], 'dark', [
        bx + Math.cos(rot) * s2,
        3,
        bz - Math.sin(rot) * s2,
      ]);
    signs.box(signNode, [8.2, 3.2, 0.25], 'dark', [bx, 6.2, bz], [0, rot, 0]);
    const board = signMesh(bigBrand.texture, 8, 3, bx + ux * 0.14, 6.2, bz + uz * 0.14, rot);
    board.userData.machine = 'backhoe';
    clickables.push(board);
  }
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
    setGround,
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
    setPlotTrees,
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
