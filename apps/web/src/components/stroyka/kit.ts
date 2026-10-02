// Shared materials and a builder that merges primitives into few meshes.
// Every rigid part of a machine is one mesh per material, so a whole machine
// costs a dozen draw calls instead of a hundred.
import * as THREE from 'three';
import { SITE } from '@/lib/site';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });

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

export function createMaterials() {
  return {
    vestLogo: lambert(0xffffff, { map: vestLogo() }),
    yellow: lambert(0xf59e0b),
    amber: lambert(0xd97706),
    dark: lambert(0x1f2937),
    black: lambert(0x141414),
    steel: lambert(0x8b929c),
    glass: lambert(0x2b3a4a, { emissive: 0x3a2412 }),
    concrete: lambert(0xb8b2aa),
    concreteDark: lambert(0x8a837b),
    block: lambert(0xe2ddd3),
    dirt: lambert(0x8a6240),
    gravel: lambert(0x9b968f),
    fence: lambert(0x2f3d4f),
    vest: lambert(0xf97316),
    white: lambert(0xf1f5f9),
    skin: lambert(0xc98d68),
    pants: lambert(0x334155),
    red: lambert(0xdc2626),
    wood: lambert(0x9a6a33),
    cabin: lambert(0x3b6e8f),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff2c4 }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff3b2f }),
    beacon: new THREE.MeshBasicMaterial({ color: 0xffa21a }),
  };
}
export type Materials = ReturnType<typeof createMaterials>;
export type MatKey = keyof Materials;

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

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
    const geo = geometry.clone().applyMatrix4(compose(pos, rot, scale));
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

  /**
   * A square post along Y (rotate it for axles): the blocky style has no
   * cylinders, so a «cylinder» of radius r is a 2r × h × 2r box.
   */
  cyl(node: THREE.Object3D, radius: number, h: number, mat: MatKey, pos: V3, rot: V3 = [0, 0, 0]) {
    return this.add(node, UNIT_BOX, mat, pos, rot, [radius * 2, h, radius * 2]);
  }

  /** A block wheel whose axle runs along Z, with a steel hub. */
  wheel(node: THREE.Object3D, pos: V3, r: number, w: number) {
    this.box(node, [r * 1.9, r * 1.9, w], 'black', pos);
    this.box(node, [r * 0.9, r * 0.9, w + 0.04], 'steel', pos);
    return this;
  }

  /** A stepped heap of blocks (dirt, sand) of base radius r and height h. */
  heap(node: THREE.Object3D, r: number, h: number, mat: MatKey, pos: V3 = [0, 0, 0], steps = 3) {
    for (let i = 0; i < steps; i++) {
      const k = 1 - i / steps;
      this.box(node, [r * 2 * k, h / steps, r * 2 * k * 0.9], mat, [
        pos[0],
        pos[1] + (h / steps) * (i + 0.5),
        pos[2],
      ]);
    }
    return this;
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

/** A tiny procedural pixel texture (grey noise) so cube faces read as blocks. */
export function pixelTexture(size = 16, seed = 7) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      // Finer and softer grain: small specks instead of chunky pixels.
      const v = Math.round((edge ? 206 : 224) + rand() * 24);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
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
