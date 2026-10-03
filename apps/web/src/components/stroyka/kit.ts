// Shared materials and a builder that merges primitives into few meshes.
// Every rigid part of a machine is one mesh per material, so a whole machine
// costs a dozen draw calls instead of a hundred.
//
// Film look (owner's request, 2026-10-03, replaces the blocky style):
// physically based materials (glossy paint, metal, rubber, glass that reflect
// the sky), bevelled boxes, real cylinders and tyres, smooth heaps, and
// photo textures (Poly Haven, CC0) for dirt, gravel, sand and concrete.
import * as THREE from 'three';
import { SITE } from '@/lib/site';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** A physically based material: colour, roughness, metalness. */
const pbr = (
  color: number,
  roughness: number,
  metalness = 0,
  extra: THREE.MeshStandardMaterialParameters = {},
) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

const textureLoader = typeof window === 'undefined' ? null : new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

function loadTex(url: string, color: boolean, repeat: number) {
  const key = `${url}@${repeat}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const t = textureLoader!.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  // Sharper ground at a glancing angle on computers (phones keep 4).
  t.anisotropy =
    typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches ? 8 : 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, t);
  return t;
}

/** Photo textures (public/stroyka/tex, Poly Haven CC0, 1k): colour, normal, rough. */
export type Surface =
  | 'brown_mud_02'
  | 'bicolour_gravel'
  | 'concrete_slab_wall'
  | 'concrete_floor_worn_001'
  | 'coast_sand_01';

export function surfaceMaps(name: Surface, repeat = 1) {
  if (!textureLoader) return {};
  const base = `/stroyka/tex/${name}`;
  const arm = loadTex(`${base}_arm.jpg`, false, repeat);
  return {
    map: loadTex(`${base}_diff.jpg`, true, repeat),
    normalMap: loadTex(`${base}_nor.jpg`, false, repeat),
    roughnessMap: arm,
    aoMap: arm,
    aoMapIntensity: 0.6,
  };
}

/** A textured ground material; vertex or instance colours tint the photo. */
export function surfaceMaterial(
  name: Surface,
  repeat = 1,
  extra: THREE.MeshStandardMaterialParameters = {},
) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    ...surfaceMaps(name, repeat),
    ...extra,
  });
}

/** «СпецПласт16» printed on the back of the workers' vests. */
function vestLogo() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 4, 256, 6);
  ctx.fillRect(0, 54, 256, 6);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SITE.name, 128, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Site wear on a material: dust and dried mud rising from the ground (by
 * world height, so it stays right on moving machines), blotchy and duller
 * paint higher up. One cheap noise in the fragment shader, no textures.
 */
function grime(material: THREE.MeshStandardMaterial, strength = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grimeStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrimePos;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 grimeWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          grimeWorld = instanceMatrix * grimeWorld;
        #endif
        vGrimePos = (modelMatrix * grimeWorld).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrimePos;
        uniform float grimeStrength;
        float grimeHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float grimeNoise(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(grimeHash(i), grimeHash(i + vec3(1,0,0)), f.x),
                         mix(grimeHash(i + vec3(0,1,0)), grimeHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(grimeHash(i + vec3(0,0,1)), grimeHash(i + vec3(1,0,1)), f.x),
                         mix(grimeHash(i + vec3(0,1,1)), grimeHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        float gN = grimeNoise(vGrimePos * 3.1) * 0.6 + grimeNoise(vGrimePos * 11.0) * 0.4;
        // Mud: heavy near the ground, splashes up to about 1.4 m.
        float gMud = (1.0 - smoothstep(0.05, 1.4, vGrimePos.y + gN * 0.5)) * grimeStrength;
        // Dust and wear everywhere, in blotches.
        float gDust = smoothstep(0.45, 0.9, gN) * 0.35 * grimeStrength;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.26, 0.21, 0.16), clamp(gMud * 0.75, 0.0, 0.75));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.82, 0.76), gDust);
        roughnessFactor = clamp(roughnessFactor + gMud * 0.5 + gDust * 0.25, 0.0, 1.0);
        metalnessFactor = metalnessFactor * (1.0 - gMud * 0.8);`,
      );
  };
  material.customProgramCacheKey = () => `grime-${strength}`;
  return material;
}

/** Black-and-yellow hazard stripes (outriggers, bumpers, counterweights). */
function hazardTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2b705';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#151515';
  for (let k = -2; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(k * 64, 0);
    ctx.lineTo(k * 64 + 32, 0);
    ctx.lineTo(k * 64 + 160, 128);
    ctx.lineTo(k * 64 + 128, 128);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Tyre tread: chevron lugs across the tread, as a bump map (canvas, no file). */
function treadTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#000000';
  // u runs around the wheel, v around the tube from the outer edge (v = 0 and
  // 1 meet on the tread): chevron grooves centred there, drawn twice to wrap.
  for (const off of [-32, 32]) {
    for (let k = 0; k < 32; k++) {
      const x = k * 16;
      ctx.beginPath();
      ctx.moveTo(x, 14 + off);
      ctx.lineTo(x + 6, 32 + off);
      ctx.lineTo(x, 50 + off);
      ctx.lineTo(x + 4, 50 + off);
      ctx.lineTo(x + 10, 32 + off);
      ctx.lineTo(x + 4, 14 + off);
      ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createMaterials() {
  return {
    vestLogo: pbr(0xffffff, 0.75, 0, { map: vestLogo() }),
    // Machine paint: glossy clear coat that catches the sky.
    yellow: grime(pbr(0xf0a20b, 0.38, 0.05)),
    amber: grime(pbr(0xc9700a, 0.45, 0.05)),
    dark: grime(pbr(0x1f2937, 0.55, 0.3)),
    black: grime(pbr(0x161616, 0.85, 0), 0.7), // rubber, plastics
    steel: grime(pbr(0x9aa1ab, 0.32, 0.9), 0.6),
    // Tyres: rubber with a lugged tread, caked with mud low down.
    tyre: grime(pbr(0x141414, 0.9, 0, { bumpMap: treadTexture(), bumpScale: 2.5 }), 0.55),
    glass: pbr(0x0b1620, 0.03, 0.85, { emissive: 0x06080a, envMapIntensity: 2.4 }),
    concrete: surfaceMaterial('concrete_slab_wall', 1, { color: 0xd6d0c8 }),
    concreteDark: surfaceMaterial('concrete_floor_worn_001', 1, { color: 0xa39c93 }),
    block: pbr(0xe8e3d9, 0.9, 0),
    dirt: surfaceMaterial('brown_mud_02', 1),
    gravel: surfaceMaterial('bicolour_gravel', 1),
    fence: pbr(0x2f3d4f, 0.5, 0.4),
    vest: pbr(0xf97316, 0.7, 0),
    white: pbr(0xf1f5f9, 0.45, 0.05),
    skin: pbr(0xc98d68, 0.65, 0),
    pants: pbr(0x334155, 0.85, 0),
    red: grime(pbr(0xc81e1e, 0.4, 0.05), 0.6),
    hazard: grime(pbr(0xffffff, 0.5, 0.05, { map: hazardTexture() }), 0.7),
    // Hydraulic hoses: glossy black rubber.
    hose: pbr(0x111111, 0.45, 0),
    wood: pbr(0x9a6a33, 0.85, 0),
    cabin: pbr(0x3b6e8f, 0.4, 0.1),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff2c4 }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff3b2f }),
    beacon: new THREE.MeshBasicMaterial({ color: 0xffa21a }),
  };
}
export type Materials = ReturnType<typeof createMaterials>;
export type MatKey = keyof Materials;

/** A unit box with softly bevelled edges: no toy-like sharp cubes. */
const UNIT_BOX = new RoundedBoxGeometry(1, 1, 1, 2, 0.06);
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
// A tyre: a thick ring around the axle (Z after rotation), and the rim inside.
const TYRE = new THREE.TorusGeometry(0.72, 0.28, 14, 40);
const RIM = new THREE.CylinderGeometry(0.5, 0.5, 1, 18).rotateX(Math.PI / 2);
// Hex wheel nut.
const NUT = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).rotateX(Math.PI / 2);

type V3 = [number, number, number];
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

function compose(pos: V3, rot: V3, scale: V3) {
  tmpEuler.set(rot[0], rot[1], rot[2]);
  tmpQuat.setFromEuler(tmpEuler);
  return tmpMatrix.compose(new THREE.Vector3(...pos), tmpQuat, new THREE.Vector3(...scale));
}

export class Rig {
  private parts = new Map<THREE.Object3D, Map<MatKey, THREE.BufferGeometry[]>>();
  constructor(private materials: Materials) {}

  add(
    node: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    mat: MatKey,
    pos: V3 = [0, 0, 0],
    rot: V3 = [0, 0, 0],
    scale: V3 = [1, 1, 1],
  ) {
    // Rounded boxes are non-indexed, cylinders and tyres indexed: merge as non-indexed.
    const base = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const geo = base.applyMatrix4(compose(pos, rot, scale));
    let byMat = this.parts.get(node);
    if (!byMat) this.parts.set(node, (byMat = new Map()));
    const list = byMat.get(mat);
    if (list) list.push(geo);
    else byMat.set(mat, [geo]);
    return this;
  }

  /** A box of size w×h×d centred at pos. */
  box(node: THREE.Object3D, size: V3, mat: MatKey, pos: V3, rot: V3 = [0, 0, 0]) {
    return this.add(node, UNIT_BOX, mat, pos, rot, size);
  }

  /** A round post along Y of radius r and height h (rotate it for axles). */
  cyl(node: THREE.Object3D, radius: number, h: number, mat: MatKey, pos: V3, rot: V3 = [0, 0, 0]) {
    return this.add(node, UNIT_CYL, mat, pos, rot, [radius * 2, h, radius * 2]);
  }

  /** A wheel whose axle runs along Z: rubber tyre of radius r, steel rim. */
  wheel(node: THREE.Object3D, pos: V3, r: number, w: number) {
    this.add(node, TYRE, 'tyre', pos, [0, 0, 0], [r, r, w / 0.56]);
    this.add(node, RIM, 'steel', pos, [0, 0, 0], [r * 1.05, r * 1.05, w * 0.9]);
    this.add(node, RIM, 'dark', pos, [0, 0, 0], [r * 0.45, r * 0.45, w + 0.02]);
    // Hub cap and wheel nuts on both faces.
    for (const side of [-1, 1]) {
      const z = pos[2] + side * (w / 2 + 0.012);
      this.add(node, RIM, 'steel', [pos[0], pos[1], z], [0, 0, 0], [r * 0.22, r * 0.22, 0.05]);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        this.add(
          node,
          NUT,
          'steel',
          [pos[0] + Math.cos(a) * r * 0.32, pos[1] + Math.sin(a) * r * 0.32, z],
          [0, 0, 0],
          [r * 0.07, r * 0.07, 0.04],
        );
      }
    }
    return this;
  }

  /**
   * A flat part cut from a 2D outline (in the node's XY plane) and extruded
   * `depth` along Z, centred, with softened edges: booms, buckets, hoods.
   */
  profile(
    node: THREE.Object3D,
    outline: [number, number][],
    depth: number,
    mat: MatKey,
    pos: V3 = [0, 0, 0],
    rot: V3 = [0, 0, 0],
    bevel = 0.025,
  ) {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, depth - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 8,
    });
    geo.translate(0, 0, -depth / 2 + bevel);
    this.add(node, geo, mat, pos, rot);
    geo.dispose();
    return this;
  }

  /** A hose through the given points (node frame), radius r. */
  hose(node: THREE.Object3D, points: V3[], r = 0.03, mat: MatKey = 'hose') {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const geo = new THREE.TubeGeometry(curve, points.length * 6, r, 6, false);
    this.add(node, geo, mat);
    geo.dispose();
    return this;
  }

  /** A smooth mound (dirt, sand) of base radius r and height h. */
  heap(node: THREE.Object3D, r: number, h: number, mat: MatKey, pos: V3 = [0, 0, 0]) {
    return this.add(node, moundGeometry(), mat, pos, [0, 0, 0], [r, h, r * 0.9]);
  }

  /** Merges everything added so far into one mesh per node and material. */
  bake({ cast = true, receive = false } = {}) {
    for (const [node, byMat] of this.parts) {
      for (const [mat, list] of byMat) {
        const merged = list.length === 1 ? list[0]! : mergeGeometries(list, false);
        if (!merged) continue;
        list.forEach((g) => g !== merged && g.dispose());
        const mesh = new THREE.Mesh(merged, this.materials[mat]);
        mesh.castShadow = cast && mat !== 'glass' && mat !== 'lamp';
        mesh.receiveShadow = receive;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        node.add(mesh);
      }
    }
    this.parts.clear();
  }
}

let mound: THREE.BufferGeometry | null = null;
/** A unit mound: a soft cone with a lumpy surface, base radius 1, height 1. */
export function moundGeometry() {
  if (mound) return mound;
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    // Angle-of-repose cone with a rounded top and a flared foot.
    profile.push(
      new THREE.Vector2(Math.max(0.001, 1 - t) ** 0.9, Math.sin((t * Math.PI) / 2) ** 1.4),
    );
  }
  const g = new THREE.LatheGeometry(profile.reverse(), 24);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const n = 1 + 0.07 * Math.sin(x * 9 + z * 5) * Math.cos(z * 7 - x * 3) * (1 - y);
    pos.setXYZ(i, x * n, y, z * n);
  }
  g.computeVertexNormals();
  mound = g;
  return g;
}

/** A group node at a position, optionally added to a parent. */
export function node(parent: THREE.Object3D | null, pos: V3 = [0, 0, 0], name = '') {
  const group = new THREE.Group();
  group.position.set(...pos);
  group.name = name;
  parent?.add(group);
  return group;
}

/** Smooth 0→1 between a and b. */
export function smooth(a: number, b: number, x: number) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Interpolates keyframes [time, ...values] over a looping cycle with smooth
 * easing between neighbours. The last key should repeat the first.
 */
export function keyframes(keys: number[][], time: number, out: number[]) {
  const period = keys[keys.length - 1]![0]!;
  const t = ((time % period) + period) % period;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t >= a[0]! && t <= b[0]!) {
      const k = smooth(a[0]!, b[0]!, t);
      for (let j = 1; j < a.length; j++) out[j - 1] = a[j]! + (b[j]! - a[j]!) * k;
      return out;
    }
  }
  return out;
}

/** A soft round sprite for particles and glows. */
export function dotTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A pool of falling square particles (dirt from a bucket, gravel from a body). */
export class Debris {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  constructor(
    count: number,
    color: number,
    size: number,
    private floor: number,
  ) {
    this.pos = new Float32Array(count * 3).fill(-999);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color,
        size,
      }),
    );
    this.points.frustumCulled = false;
  }
  setFloor(y: number) {
    this.floor = y;
  }
  emit(at: THREE.Vector3, spread: number, count: number) {
    const n = this.life.length;
    for (let i = 0; i < count; i++) {
      const k = this.next;
      this.next = (this.next + 1) % n;
      this.pos[k * 3] = at.x + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 1] = at.y + (Math.random() - 0.5) * spread * 0.5;
      this.pos[k * 3 + 2] = at.z + (Math.random() - 0.5) * spread;
      this.vel[k * 3] = (Math.random() - 0.5) * 0.8;
      this.vel[k * 3 + 1] = -Math.random() * 0.6;
      this.vel[k * 3 + 2] = (Math.random() - 0.5) * 0.8;
      this.life[k] = 2;
    }
  }
  update(dt: number) {
    const n = this.life.length;
    let any = false;
    for (let k = 0; k < n; k++) {
      if (this.life[k]! <= 0) continue;
      any = true;
      this.life[k]! -= dt;
      this.vel[k * 3 + 1]! -= 9.8 * dt;
      this.pos[k * 3]! += this.vel[k * 3]! * dt;
      this.pos[k * 3 + 1]! += this.vel[k * 3 + 1]! * dt;
      this.pos[k * 3 + 2]! += this.vel[k * 3 + 2]! * dt;
      if (this.pos[k * 3 + 1]! < this.floor || this.life[k]! <= 0) {
        this.life[k] = 0;
        this.pos[k * 3 + 1] = -999;
      }
    }
    if (any) this.points.geometry.attributes.position!.needsUpdate = true;
  }
}

/**
 * A soft concrete-like grain for panels (fence, building shell, city): fine
 * smooth noise with linear filtering, no block edges.
 */
export function pixelTexture(size = 128, seed = 7) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(222 + rand() * 22 - (rand() < 0.02 ? 30 : 0));
    img.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  // Two blurred passes give pores and stains instead of pixels.
  ctx.filter = 'blur(1px)';
  ctx.drawImage(canvas, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface VoxelItem {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  c: THREE.Color;
  r: number;
}

/**
 * Collects cubes (position, size, colour) and turns them into one
 * InstancedMesh: terrain, heaps, the fence and the building shell are each a
 * single draw call however many blocks they have.
 */
export class Voxels {
  private items: VoxelItem[] = [];
  /** Adds a block of size s (or s×sy×sz) centred at x, y, z. */
  add(
    x: number,
    y: number,
    z: number,
    color: number | THREE.Color,
    s = 1,
    sy = s,
    sz = s,
    rotY = 0,
  ) {
    const c = color instanceof THREE.Color ? color.clone() : new THREE.Color(color);
    this.items.push({ x, y, z, sx: s, sy, sz, c, r: rotY });
  }
  get count() {
    return this.items.length;
  }
  build(material: THREE.Material, { cast = false, receive = true } = {}) {
    const mesh = new THREE.InstancedMesh(UNIT_BOX, material, Math.max(1, this.items.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const e = new THREE.Euler();
    this.items.forEach((it, i) => {
      q.setFromEuler(e.set(0, it.r, 0));
      m.compose(p.set(it.x, it.y, it.z), q, sc.set(it.sx, it.sy, it.sz));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, it.c);
    });
    mesh.count = this.items.length;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return { mesh, colors: this.items.map((it) => it.c.clone()), items: this.items };
  }
}

/** Re-tints an instanced mesh: base colours mixed toward `tint` by k, times `scale`. */
export function retint(
  mesh: THREE.InstancedMesh,
  base: THREE.Color[],
  tint: THREE.Color,
  k: number,
  scale = 1,
  filter?: (i: number) => boolean,
) {
  const c = new THREE.Color();
  for (let i = 0; i < base.length; i++) {
    c.copy(base[i]!);
    if (!filter || filter(i)) c.lerp(tint, k);
    c.multiplyScalar(scale);
    mesh.setColorAt(i, c);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
