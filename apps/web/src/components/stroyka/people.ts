// People (and the site dog) for /stroyka, built from small rounded parts of
// about 0.03–0.15 m. Each person is six merged meshes, one per animated group
// (body, head, two arms, two legs), with the colours in the vertices and one
// shared material, so a detailed worker costs 6 draw calls instead of ~15.
// Beyond ~25 m (or past the phone cap) a single-mesh low-detail figure
// stands in. The speaking character gets a mood face: one shared textured
// plane moved onto their head.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SITE } from '@/lib/site';
import { MOODS, type Mood } from '@/lib/stroyka/mood';

type V3 = [number, number, number];

// ---------------------------------------------------------------- textures

/**
 * One 256² atlas for every person: the top-left quarter is a soft block
 * grain (so faces read as voxels, like the terrain), a strip lower down is
 * the «СпецПласт16» vest print — white ground, dark letters, so the vertex
 * colour of the vest shows through as its background.
 */
function atlasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  let s = 11;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // Soft fabric grain (no block edges).
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const v = Math.round(228 + rand() * 20);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x * 2, y * 2, 2, 2);
    }
  // The vest print: 256×64 at y 176.
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SITE.name, 128, 209, 244);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const NOISE_UV = { u0: 0.004, u1: 0.496, v0: 0.504, v1: 0.996 };
const LOGO_UV = { u0: 0, u1: 1, v0: 1 - 240 / 256, v1: 1 - 176 / 256 };

/** Mood faces, 64×64 cells in a 4×3 grid: eyes, brows and mouth on white. */
const FACE_COLS = 4;
const FACE_ROWS = 3;
function faceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64 * FACE_COLS;
  canvas.height = 64 * FACE_ROWS;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  MOODS.forEach((mood, i) => {
    const ox = (i % FACE_COLS) * 64;
    const oy = Math.floor(i / FACE_COLS) * 64;
    const r = (x: number, y: number, w: number, h: number, c = '#1b1b1b') => {
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, oy + y, w, h);
    };
    const DARK = '#1b1b1b';
    const LIP = '#5a1f1c';
    const MOUTH = '#3a0f0e';
    // Eyes at x 13/45, y ~20; brows ~11; mouth ~51 (the nose block sits in between).
    const eyes = (h = 7, dy = 0, dx = 0) => {
      r(13 + dx, 18 + dy, 6, h, DARK);
      r(45 + dx, 18 + dy, 6, h, DARK);
    };
    const brows = (yl: number, yr: number, tiltL = 0, tiltR = 0) => {
      // Two 5-px halves per brow so they can slant.
      r(10, yl, 6, 3, DARK);
      r(16, yl + tiltL, 6, 3, DARK);
      r(42, yr + tiltR, 6, 3, DARK);
      r(48, yr, 6, 3, DARK);
    };
    switch (mood) {
      case 'happy':
        eyes(6);
        brows(9, 9);
        r(23, 52, 18, 3, LIP);
        r(20, 49, 4, 3, LIP);
        r(40, 49, 4, 3, LIP);
        break;
      case 'laugh':
        // Squeezed eyes ^ ^ and a wide open mouth.
        r(12, 21, 3, 2, DARK);
        r(15, 19, 4, 2, DARK);
        r(19, 21, 3, 2, DARK);
        r(44, 21, 3, 2, DARK);
        r(47, 19, 4, 2, DARK);
        r(51, 21, 3, 2, DARK);
        brows(8, 8);
        r(21, 46, 22, 11, MOUTH);
        r(25, 53, 14, 4, '#c0504a');
        break;
      case 'angry':
        eyes(5, 2);
        // Brows slanting down to the nose.
        brows(10, 10, 3, 3);
        r(24, 52, 16, 3, LIP);
        r(21, 55, 4, 3, LIP);
        r(39, 55, 4, 3, LIP);
        break;
      case 'surprised':
        r(12, 16, 8, 9, DARK);
        r(44, 16, 8, 9, DARK);
        brows(5, 5);
        // «o»
        r(27, 46, 10, 2, MOUTH);
        r(27, 56, 10, 2, MOUTH);
        r(25, 48, 2, 8, MOUTH);
        r(37, 48, 2, 8, MOUTH);
        r(27, 48, 10, 8, '#7a2a26');
        break;
      case 'thinking':
        eyes(6, -2, 2);
        brows(11, 7, 0, 0);
        r(32, 52, 10, 3, LIP);
        break;
      case 'tired':
        // Heavy lids: a line with half a pupil under it.
        r(11, 20, 10, 2, DARK);
        r(43, 20, 10, 2, DARK);
        r(13, 22, 6, 3, DARK);
        r(45, 22, 6, 3, DARK);
        brows(13, 13);
        r(26, 52, 12, 2, LIP);
        break;
      case 'proud':
        eyes(5, 1);
        brows(9, 10);
        r(24, 52, 16, 3, LIP);
        r(40, 49, 4, 3, LIP);
        break;
      case 'worried':
        eyes(6);
        // Brows rising to the nose.
        brows(11, 11, -3, -3);
        r(24, 53, 5, 2, LIP);
        r(29, 52, 6, 2, LIP);
        r(35, 53, 5, 2, LIP);
        break;
      case 'radio':
        eyes(6, 0, -2);
        brows(10, 10);
        r(27, 49, 10, 6, MOUTH);
        break;
      default:
        eyes();
        brows(11, 11);
        r(25, 51, 14, 3, LIP);
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.repeat.set(1 / FACE_COLS, 1 / FACE_ROWS);
  return texture;
}

let SHARED: { body: THREE.MeshStandardMaterial; face: THREE.MeshStandardMaterial } | null = null;

/** The shared materials (created on first use, in the browser). */
export function peopleMaterials() {
  if (!SHARED) {
    SHARED = {
      body: new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: atlasTexture(),
        roughness: 0.8,
      }),
      face: new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.7 }),
    };
  }
  return SHARED;
}

/** Drops the shared materials (the engine disposes them with the scene). */
export function resetPeopleMaterials() {
  SHARED = null;
}

// ---------------------------------------------------------------- geometry

// Strongly rounded boxes: limbs read as rounded forms, the head as an
// egg — a figure, not a stack of cubes (film look, 2026-10-03).
const UNIT_BOX = new RoundedBoxGeometry(1, 1, 1, 3, 0.32);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

/** Collects coloured blocks and merges them into one geometry. */
class Blocks {
  private list: THREE.BufferGeometry[] = [];

  private push(
    base: THREE.BufferGeometry,
    size: V3,
    pos: V3,
    color: number | THREE.Color,
    rot: V3,
    uv: typeof NOISE_UV,
  ) {
    // Rounded boxes are non-indexed, planes indexed: merge as non-indexed.
    const g = base.index ? base.toNonIndexed() : base.clone();
    tmpQ.setFromEuler(tmpE.set(rot[0], rot[1], rot[2]));
    g.applyMatrix4(
      tmpM.compose(new THREE.Vector3(...pos), tmpQ, new THREE.Vector3(size[0], size[1], size[2])),
    );
    const n = g.attributes.position!.count;
    const c = color instanceof THREE.Color ? color : tmpC.setHex(color);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const uvs = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uvs.count; i++)
      uvs.setXY(i, uv.u0 + (uv.u1 - uv.u0) * uvs.getX(i), uv.v0 + (uv.v1 - uv.v0) * uvs.getY(i));
    this.list.push(g);
  }

  box(size: V3, pos: V3, color: number | THREE.Color, rot: V3 = [0, 0, 0]) {
    this.push(UNIT_BOX, size, pos, color, rot, NOISE_UV);
    return this;
  }

  /** A flat print (the vest logo) of w×h facing +Z, turned by rot. */
  print(w: number, h: number, pos: V3, color: number | THREE.Color, rot: V3) {
    this.push(UNIT_PLANE, [w, h, 1], pos, color, rot, LOGO_UV);
    return this;
  }

  mesh(parent: THREE.Object3D, cast = true) {
    const geo = mergeGeometries(this.list, false)!;
    this.list.forEach((g) => g.dispose());
    this.list = [];
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, peopleMaterials().body);
    mesh.castShadow = cast;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    parent.add(mesh);
    return mesh;
  }
}

const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);

/** A one-mesh vertex-coloured prop from [size, position, colour] blocks (the fir tree, flowers). */
export function voxelMesh(blocks: [V3, V3, number][], cast = true) {
  const b = new Blocks();
  for (const [size, pos, color] of blocks) b.box(size, pos, color);
  return b.mesh(new THREE.Group(), cast);
}

// ---------------------------------------------------------------- looks

export type Facial = 'none' | 'moustache' | 'beard' | 'stubble';

export interface PersonLook {
  skin: number;
  hair: number;
  hat: number;
  vest: number;
  shirt: number;
  pants: number;
  boots: number;
  gloves: number | null;
  facial: Facial;
  female: boolean;
  glasses: boolean;
  headset: boolean;
  rolled: boolean;
  /** Shoulder width factor. */
  build: number;
  /** Overall scale. */
  height: number;
}

export const HAT = {
  white: 0xf4f6f8,
  orange: 0xf97316,
  yellow: 0xfacc15,
  red: 0xdc2626,
  blue: 0x38bdf8,
  dark: 0x1f2937,
};
export const VEST = { orange: 0xf97316, yellow: 0xd9f02b, dark: 0x23324a };

const SKINS = [0xf1c9a5, 0xe3b28d, 0xd39a74, 0xc48a62, 0xa8704c, 0x8d5a3b];
const HAIRS = [0x1f1a17, 0x3b2a1f, 0x5a3b26, 0x6b6560, 0x9ca3af, 0x2b2b2b];
const SHIRTS = [0x2f4f7f, 0x5b6573, 0x3d6b4f, 0x7a5c3a, 0x1e3a5f, 0x8a2f2f, 0x4b5563];
const PANTS = [0x2b3445, 0x334155, 0x3f3a33, 0x26303d, 0x45403a];
const BOOTS = [0x2a1d14, 0x151515, 0x4a3320];

/** A small deterministic PRNG from a string id. */
export function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  let s = h >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded look: skin, hair, shirt, build and height vary; `fixed` wins. */
export function lookFor(id: string, fixed: Partial<PersonLook> = {}): PersonLook {
  const r = seeded(id);
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)]!;
  const female = fixed.female ?? false;
  const roll = r();
  const look: PersonLook = {
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hat: r() < 0.5 ? HAT.orange : HAT.yellow,
    vest: VEST.orange,
    shirt: pick(SHIRTS),
    pants: pick(PANTS),
    boots: pick(BOOTS),
    gloves: r() < 0.45 ? pick([0xd9b44a, 0x6b7280, 0xe5e7eb]) : null,
    facial: female
      ? 'none'
      : roll < 0.22
        ? 'moustache'
        : roll < 0.36
          ? 'beard'
          : roll < 0.5
            ? 'stubble'
            : 'none',
    female,
    glasses: false,
    headset: false,
    rolled: r() < 0.3,
    build: female ? 0.9 + r() * 0.06 : 0.94 + r() * 0.18,
    height: female ? 0.93 + r() * 0.04 : 0.95 + r() * 0.1,
  };
  return { ...look, ...fixed };
}

// ---------------------------------------------------------------- people

export interface Person {
  root: THREE.Group;
  /** Hips up: breathing and sway. */
  body: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** The single-mesh stand-in for distance. */
  lod: THREE.Mesh;
  look: PersonLook;
  detailed: boolean;
  /** 0–1, varies breathing and idle timing between people. */
  seed: number;
}

const SILVER = 0xdfe3e8;
const HIP = 0.9;

/** A worker facing +Z: hard hat with a brim, face, vest with stripes and the print. */
export function makePerson(look: PersonLook, seedId = ''): Person {
  const W = look.build;
  const root = new THREE.Group();
  root.scale.setScalar(look.height);
  const body = group(root, [0, HIP, 0]);
  const head = group(body, [0, 0.69, 0]);
  const sx = 0.2 * W + 0.058;
  const armL = group(body, [sx, 0.6, 0]);
  const armR = group(body, [-sx, 0.6, 0]);
  const legL = group(root, [0.095 * W, HIP, 0]);
  const legR = group(root, [-0.095 * W, HIP, 0]);
  const vestDark = shade(look.vest, 0.72);

  // Torso: belt, vest with two reflective bands, collar, the print on the back.
  const b = new Blocks();
  b.box([0.37 * W, 0.07, 0.22], [0, 0.035, 0], 0x2b2118);
  b.box([0.06, 0.05, 0.012], [0, 0.035, 0.112], 0xb0a58a);
  b.box([0.4 * W, 0.5, 0.23], [0, 0.33, 0], look.vest);
  b.box([0.405 * W, 0.034, 0.234], [0, 0.19, 0], SILVER);
  b.box([0.405 * W, 0.034, 0.234], [0, 0.29, 0], SILVER);
  for (const x of [0.1 * W, -0.1 * W]) b.box([0.034, 0.24, 0.006], [x, 0.44, 0.117], SILVER);
  b.box([0.012, 0.37, 0.006], [0, 0.28, 0.117], vestDark);
  b.box([0.08, 0.13, 0.008], [0, 0.515, 0.114], look.shirt);
  b.box([0.39 * W, 0.05, 0.21], [0, 0.6, 0], look.shirt);
  b.box([0.16, 0.035, 0.16], [0, 0.64, 0], shade(look.shirt, 0.85));
  b.box([0.1, 0.06, 0.1], [0, 0.67, 0], look.skin);
  b.box([0.08, 0.06, 0.008], [0.1 * W, 0.12, 0.117], vestDark);
  b.print(0.3 * W, 0.075, [0, 0.455, -0.1165], look.vest, [0, Math.PI, 0]);
  b.mesh(body);

  // Head: ears, nose, eyes, brows, mouth, facial hair, hair, the hard hat.
  const h = new Blocks();
  const skin = look.skin;
  h.box([0.21, 0.24, 0.21], [0, 0.12, 0], skin);
  for (const x of [0.1175, -0.1175])
    h.box([0.025, 0.055, 0.045], [x, 0.12, -0.005], shade(skin, 0.9));
  h.box([0.04, 0.05, 0.03], [0, 0.1, 0.12], shade(skin, 0.94));
  for (const x of [0.048, -0.048]) {
    h.box([0.05, 0.034, 0.008], [x, 0.14, 0.106], 0xf4f1ea);
    h.box([0.022, 0.03, 0.006], [x - Math.sign(x) * 0.006, 0.14, 0.111], 0x1b1b1b);
    h.box(
      [0.056, 0.014, 0.008],
      [x, 0.171, 0.107],
      look.female ? shade(look.hair, 1.2) : look.hair,
    );
  }
  h.box([0.065, 0.016, 0.006], [0, 0.06, 0.108], 0x7a2e2a);
  if (look.facial === 'moustache' || look.facial === 'beard')
    h.box([0.1, 0.022, 0.014], [0, 0.079, 0.112], look.hair);
  if (look.facial === 'beard') {
    h.box([0.19, 0.06, 0.03], [0, 0.03, 0.106], look.hair);
    for (const x of [0.1, -0.1]) h.box([0.02, 0.11, 0.15], [x, 0.07, 0.02], look.hair);
  }
  if (look.facial === 'stubble') h.box([0.2, 0.07, 0.004], [0, 0.036, 0.1055], shade(skin, 0.72));
  h.box([0.215, 0.1, 0.03], [0, 0.15, -0.1], look.hair);
  for (const x of [0.106, -0.106]) h.box([0.012, 0.06, 0.12], [x, 0.17, -0.04], look.hair);
  if (look.female) {
    h.box([0.06, 0.15, 0.05], [0, 0.07, -0.13], look.hair);
    for (const x of [0.11, -0.11]) h.box([0.02, 0.16, 0.08], [x, 0.11, -0.06], look.hair);
  }
  if (look.glasses) {
    for (const x of [0.048, -0.048]) h.box([0.066, 0.042, 0.006], [x, 0.14, 0.116], 0x22303c);
    h.box([0.03, 0.01, 0.006], [0, 0.145, 0.116], 0x111111);
  }
  if (look.headset) {
    h.box([0.03, 0.065, 0.065], [-0.125, 0.12, 0], 0x111827);
    h.box([0.012, 0.012, 0.1], [-0.11, 0.07, 0.06], 0x111827);
  }
  // Hard hat: dome, crown, ridge, brim and a peak at the front.
  const hat = look.hat;
  h.box([0.24, 0.09, 0.25], [0, 0.27, 0], hat);
  h.box([0.18, 0.04, 0.2], [0, 0.33, 0], hat);
  h.box([0.036, 0.03, 0.22], [0, 0.355, 0], shade(hat, 0.86));
  h.box([0.27, 0.02, 0.29], [0, 0.226, 0.005], shade(hat, 0.95));
  h.box([0.18, 0.018, 0.07], [0, 0.222, 0.172], shade(hat, 0.95));
  h.mesh(head);

  // Arms: sleeves (or rolled up), cuff, hand or glove.
  for (const arm of [armL, armR]) {
    const a = new Blocks();
    a.box([0.11, 0.28, 0.12], [0, -0.12, 0], look.shirt);
    a.box([0.1, 0.22, 0.11], [0, -0.37, 0], look.rolled ? skin : shade(look.shirt, 0.95));
    a.box([0.106, 0.03, 0.116], [0, look.rolled ? -0.255 : -0.475, 0], shade(look.shirt, 0.8));
    a.box([0.09, 0.1, 0.09], [0, -0.54, 0.005], look.gloves ?? skin);
    a.mesh(arm);
  }

  // Legs: trousers with a reflective band, boots with soles.
  for (const leg of [legL, legR]) {
    const l = new Blocks();
    l.box([0.16, 0.42, 0.18], [0, -0.2, 0], look.pants);
    l.box([0.15, 0.36, 0.17], [0, -0.58, 0], shade(look.pants, 0.93));
    l.box([0.154, 0.028, 0.174], [0, -0.62, 0], SILVER);
    l.box([0.16, 0.12, 0.25], [0, -0.84, 0.035], look.boots);
    l.box([0.17, 0.024, 0.26], [0, -0.888, 0.035], 0x121212);
    l.mesh(leg);
  }

  // The stand-in: one mesh, a dozen blocks.
  const d = new Blocks();
  d.box([0.34 * W, 0.78, 0.18], [0, 0.51, 0], look.pants);
  d.box([0.36 * W, 0.12, 0.25], [0, 0.06, 0.03], look.boots);
  d.box([0.4 * W, 0.58, 0.23], [0, 1.22, 0], look.vest);
  d.box([0.405 * W, 0.034, 0.234], [0, 1.14, 0], SILVER);
  for (const x of [sx, -sx]) d.box([0.11, 0.56, 0.12], [x, 1.26, 0], look.shirt);
  d.box([0.21, 0.26, 0.21], [0, 1.72, 0], skin);
  d.box([0.27, 0.13, 0.29], [0, 1.9, 0.01], hat);
  const lod = d.mesh(root);
  lod.visible = false;

  const person: Person = {
    root,
    body,
    head,
    legL,
    legR,
    armL,
    armR,
    lod,
    look,
    detailed: true,
    seed: seeded(seedId || String(look.skin + look.shirt))(),
  };
  return person;
}

function group(parent: THREE.Object3D, pos: V3) {
  const g = new THREE.Group();
  g.position.set(...pos);
  parent.add(g);
  return g;
}

/** Switches between the detailed figure and the one-mesh stand-in. */
export function setDetail(p: Person, on: boolean) {
  if (p.detailed === on) return;
  p.detailed = on;
  p.body.visible = p.legL.visible = p.legR.visible = on;
  p.lod.visible = !on;
}

/** Walk cycle; `phase` grows with the distance walked. */
export function walk(person: Person, phase: number, amount: number) {
  const swing = Math.sin(phase) * 0.55 * amount;
  person.legL.rotation.x = swing;
  person.legR.rotation.x = -swing;
  person.armL.rotation.x = -swing * 0.8;
  person.armR.rotation.x = swing * 0.8;
  person.armL.rotation.z = person.armR.rotation.z = 0;
  person.body.position.y = HIP + Math.abs(Math.cos(phase)) * 0.03 * amount;
  person.body.rotation.y = Math.sin(phase) * 0.06 * amount;
}

export interface Pose {
  time: number;
  /** 0–1 walking. */
  walk: number;
  phase: number;
  /** Seated (lunch). */
  sit: boolean;
  /** Talking: gestures by mood. */
  talking: boolean;
  mood: Mood;
  /** Head turn relative to the body, radians (already clamped). */
  look: number;
}

/**
 * Idle breathing and sway, head turn, talking gestures and the walk, on the
 * few animated groups only. Cheap: a handful of sines per person.
 */
export function animatePerson(p: Person, pose: Pose) {
  const t = pose.time + p.seed * 10;
  const { armL, armR, body, head } = p;
  head.rotation.y += (pose.look - head.rotation.y) * 0.12;
  head.rotation.x = 0;
  if (pose.walk > 0.01) {
    walk(p, pose.phase, pose.walk);
    return;
  }
  // Breathing and a slight sway.
  body.position.y = HIP + Math.sin(t * 1.7) * 0.006;
  body.rotation.z = Math.sin(t * 0.45) * 0.025;
  body.rotation.y = 0;
  body.rotation.x = 0;
  armL.rotation.set(Math.sin(t * 0.5) * 0.05, 0, 0.04);
  armR.rotation.set(-Math.sin(t * 0.55) * 0.05, 0, -0.04);
  if (pose.sit) {
    p.legL.rotation.x = p.legR.rotation.x = -1.4;
    armR.rotation.x = -1.2 + Math.sin(t * 0.8) * 0.2;
    return;
  }
  p.legL.rotation.x = p.legR.rotation.x = 0;
  if (!pose.talking) return;
  const g = Math.sin(t * 2.6);
  switch (pose.mood) {
    case 'angry':
      // Both fists up and shaking.
      armR.rotation.set(-1.9 + Math.sin(t * 14) * 0.15, 0, -0.25);
      armL.rotation.set(-1.7 + Math.sin(t * 13) * 0.15, 0, 0.25);
      body.rotation.x = 0.05;
      break;
    case 'laugh':
      // Hands on the belly, shoulders shaking.
      armR.rotation.set(-0.5, 0, 0.45);
      armL.rotation.set(-0.5, 0, -0.45);
      body.position.y += Math.abs(Math.sin(t * 11)) * 0.015;
      body.rotation.x = -0.08;
      head.rotation.x = -0.18;
      break;
    case 'surprised':
      armR.rotation.set(-0.6, 0, -0.7);
      armL.rotation.set(-0.6, 0, 0.7);
      head.rotation.x = -0.08;
      break;
    case 'thinking':
      // A hand to the chin.
      armR.rotation.set(-1.95, 0, 0.55);
      head.rotation.x = 0.1;
      break;
    case 'proud':
      // Hands on the hips.
      armR.rotation.set(0.2, 0, -0.4);
      armL.rotation.set(0.2, 0, 0.4);
      body.rotation.x = -0.05;
      break;
    case 'tired':
      armR.rotation.set(-0.15, 0, -0.08);
      head.rotation.x = 0.14;
      break;
    case 'radio':
      // The walkie-talkie at the face.
      armR.rotation.set(-2.0, 0, 0.45);
      break;
    default:
      // Pointing and explaining.
      armR.rotation.set(-1.25 - Math.max(0, g) * 0.35, 0, -0.12);
      armL.rotation.set(-0.35 - Math.max(0, -g) * 0.3, 0, 0.1);
  }
}

// ---------------------------------------------------------------- mood face

/** One textured face plane, moved onto whoever is speaking. */
export class MoodFace {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private owner: Person | null = null;
  constructor() {
    this.mat = peopleMaterials().face;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.17), this.mat);
    this.mesh.position.set(0, 0.115, 0.1155);
    this.mesh.visible = false;
  }
  show(p: Person, mood: Mood) {
    if (this.owner !== p) {
      p.head.add(this.mesh);
      this.owner = p;
    }
    this.mat.color.setHex(p.look.skin);
    const i = Math.max(0, MOODS.indexOf(mood));
    this.mat.map!.offset.set(
      (i % FACE_COLS) / FACE_COLS,
      1 - (Math.floor(i / FACE_COLS) + 1) / FACE_ROWS,
    );
    this.mesh.visible = true;
  }
  hide() {
    this.mesh.visible = false;
  }
  get person() {
    return this.mesh.visible ? this.owner : null;
  }
}

// ---------------------------------------------------------------- the dog

export interface Dog {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  legs: THREE.Group[];
  /** The mesh to tap. */
  hit: THREE.Mesh;
}

/** «Бетон», the site mongrel: tan with a white chest and a red collar, facing +Z. */
export function makeDog(): Dog {
  const root = new THREE.Group();
  const body = group(root, [0, 0.3, 0]);
  const head = group(body, [0, 0.1, 0.25]);
  const tail = group(body, [0, 0.07, -0.25]);
  const legs = [
    group(root, [0.07, 0.24, 0.17]),
    group(root, [-0.07, 0.24, 0.17]),
    group(root, [0.07, 0.24, -0.17]),
    group(root, [-0.07, 0.24, -0.17]),
  ];
  const TAN = 0xb27b47;
  const DARK = 0x6e4526;
  const WHITE = 0xf1ece2;
  const bb = new Blocks();
  bb.box([0.2, 0.18, 0.46], [0, 0.02, 0], TAN);
  bb.box([0.21, 0.1, 0.18], [0, 0.07, -0.08], DARK);
  bb.box([0.15, 0.1, 0.12], [0, -0.03, 0.19], WHITE);
  bb.box([0.16, 0.03, 0.04], [0, 0.07, 0.22], 0xdc2626);
  bb.box([0.03, 0.03, 0.01], [0, 0.04, 0.245], 0xfacc15);
  const bodyMesh = bb.mesh(body);
  const hb = new Blocks();
  hb.box([0.16, 0.15, 0.15], [0, 0.04, 0.05], TAN);
  hb.box([0.1, 0.08, 0.1], [0, 0.0, 0.16], 0xd8b48a);
  hb.box([0.045, 0.035, 0.02], [0, 0.03, 0.215], 0x141414);
  hb.box([0.04, 0.012, 0.01], [0, -0.025, 0.21], 0x5a1f1c);
  for (const x of [0.042, -0.042]) hb.box([0.028, 0.028, 0.01], [x, 0.07, 0.126], 0x141414);
  hb.box([0.04, 0.08, 0.03], [0.065, 0.12, 0.02], DARK);
  hb.box([0.04, 0.03, 0.07], [-0.065, 0.12, 0.04], DARK, [0.4, 0, 0]);
  hb.mesh(head);
  const tb = new Blocks();
  tb.box([0.04, 0.04, 0.2], [0, 0, -0.09], TAN);
  tb.box([0.042, 0.042, 0.05], [0, 0, -0.18], WHITE);
  tb.mesh(tail);
  tail.rotation.x = 0.6;
  for (const leg of legs) {
    const lb = new Blocks();
    lb.box([0.055, 0.22, 0.06], [0, -0.12, 0], TAN);
    lb.box([0.06, 0.03, 0.075], [0, -0.225, 0.01], WHITE);
    lb.mesh(leg);
  }
  return { root, body, head, tail, legs, hit: bodyMesh };
}

export type DogPose = 'stand' | 'trot' | 'sit' | 'sleep';

/** Tail wag, trot, sit and sleep. */
export function animateDog(d: Dog, pose: DogPose, time: number, phase: number) {
  const [fl, fr, bl, br] = d.legs as [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  const wag = pose === 'sleep' ? 0.15 : pose === 'trot' ? 0.5 : 0.8;
  d.tail.rotation.y = Math.sin(time * (pose === 'sleep' ? 1.5 : 13)) * wag;
  d.body.rotation.set(0, 0, 0);
  d.body.position.y = 0.3;
  d.head.rotation.set(0, 0, 0);
  for (const leg of d.legs) leg.rotation.set(0, 0, 0);
  for (const leg of d.legs) leg.position.y = 0.24;
  d.tail.rotation.x = 0.6;
  if (pose === 'trot') {
    const s = Math.sin(phase) * 0.6;
    fl.rotation.x = br.rotation.x = s;
    fr.rotation.x = bl.rotation.x = -s;
    d.body.position.y = 0.3 + Math.abs(Math.cos(phase)) * 0.02;
    d.head.rotation.x = Math.sin(phase * 2) * 0.05;
  } else if (pose === 'sit') {
    d.body.rotation.x = -0.55;
    d.body.position.y = 0.26;
    bl.rotation.x = br.rotation.x = -1.4;
    bl.position.y = br.position.y = 0.12;
    d.head.rotation.x = 0.45 + Math.sin(time * 0.7) * 0.06;
    d.tail.rotation.x = -0.6;
  } else if (pose === 'sleep') {
    d.body.position.y = 0.11;
    for (const leg of d.legs) {
      leg.rotation.x = leg === fl || leg === fr ? -1.5 : 1.5;
      leg.position.y = 0.08;
    }
    d.head.rotation.x = 0.35;
    d.body.rotation.z = 0.08 + Math.sin(time * 1.2) * 0.012;
    d.tail.rotation.x = -0.1;
  } else {
    d.head.rotation.y = Math.sin(time * 0.6) * 0.3;
  }
}
