import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural construction machines built to real-world proportions (metres).
// Silhouettes come from side-profile shapes extruded across the machine,
// running gear from lathed tyres with moulded tread, and hydraulic rams that
// re-aim themselves between their pins whenever the pivots move.
//
// Convention: every machine faces +x, y is up, the ground is y = 0 and +z is
// the machine's right-hand side.

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export interface MachineMaterials {
  paint: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshPhysicalMaterial;
  /** Black painted steel: frames, ROPS, guards. */
  dark: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  /** Bright worn steel: cutting edges, teeth, pins. */
  wear: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  rim: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  interior: THREE.MeshStandardMaterial;
  /** Headlight and work-light lenses; emissiveIntensity is the lamp level. */
  lens: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  amber: THREE.MeshStandardMaterial;
  beacon: THREE.MeshStandardMaterial;
  hazard: THREE.MeshStandardMaterial;
  soil: THREE.MeshStandardMaterial;
  /** World-space height (scene units) up to which paint picks up road dirt; read when shaders compile. */
  grime: { value: number };
  dispose(): void;
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Deterministic pseudo-random numbers so textures and heaps look the same on every load. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Tileable speckled ground: dark asphalt or compacted soil. */
export function createGroundTexture(kind: 'asphalt' | 'soil', size = 512) {
  const random = seeded(kind === 'asphalt' ? 7 : 11);
  const texture = canvasTexture(size, (ctx) => {
    const base = kind === 'asphalt' ? [44, 45, 48] : [74, 58, 42];
    ctx.fillStyle = `rgb(${base.join(',')})`;
    ctx.fillRect(0, 0, size, size);
    // Broad blotches, then fine aggregate.
    for (let i = 0; i < 90; i++) {
      const r = size * (0.04 + random() * 0.12);
      const x = random() * size;
      const y = random() * size;
      const shade = (random() - 0.5) * (kind === 'asphalt' ? 18 : 30);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = base.map((v) => Math.round(v + shade)).join(',');
      g.addColorStop(0, `rgba(${c},0.5)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          ctx.save();
          ctx.translate(dx, dy);
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
          ctx.restore();
        }
      }
    }
    for (let i = 0; i < size * size * 0.06; i++) {
      const v = random();
      const l = kind === 'asphalt' ? 25 + v * 70 : 45 + v * 70;
      const tint = kind === 'asphalt' ? [l, l, l + 3] : [l * 1.25, l, l * 0.72];
      ctx.fillStyle = `rgba(${tint.map(Math.round).join(',')},${0.25 + random() * 0.5})`;
      const s = random() < 0.9 ? 1 : 2;
      ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), s, s);
    }
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMachineMaterials(
  options: { paint?: number; accent?: number; rim?: number } = {},
): MachineMaterials {
  const paintColor = options.paint ?? 0xf2a900;
  const hazardMap = canvasTexture(64, (ctx) => {
    ctx.fillStyle = '#f2a900';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#16171a';
    for (let i = -64; i < 128; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 16 + 64, 64);
      ctx.lineTo(i + 64, 64);
      ctx.fill();
    }
  });
  hazardMap.colorSpace = THREE.SRGBColorSpace;
  const soilMap = createGroundTexture('soil', 256);
  soilMap.repeat.set(2, 2);

  const grime = { value: 0.9 };
  // Paint gets dustier and duller towards the ground. The height is baked
  // into the shader when it compiles, so set `grime.value` before rendering.
  const addGrime = (material: THREE.Material) => {
    material.customProgramCacheKey = () => `grime:${grime.value.toFixed(3)}`;
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vGrimeY;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvGrimeY = (modelMatrix * vec4(transformed, 1.0)).y;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying float vGrimeY;\nconst float grimeHeight = ${grime.value.toFixed(3)};`,
        )
        .replace(
          '#include <color_fragment>',
          [
            '#include <color_fragment>',
            'float grimeK = 1.0 - smoothstep(0.0, grimeHeight, vGrimeY);',
            'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.43, 0.36), grimeK * grimeK * 0.85);',
          ].join('\n'),
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, grimeK * 0.8);',
        );
    };
    return material;
  };
  const paintOf = (color: number) =>
    addGrime(
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.42,
        metalness: 0.22,
        clearcoat: 0.45,
        clearcoatRoughness: 0.32,
      }),
    ) as THREE.MeshPhysicalMaterial;

  const kit: MachineMaterials = {
    paint: paintOf(paintColor),
    accent: paintOf(options.accent ?? paintColor),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.55, metalness: 0.35 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.42, metalness: 0.75 }),
    wear: new THREE.MeshStandardMaterial({ color: 0xb4b2ad, roughness: 0.32, metalness: 0.9 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.12, metalness: 1 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.9, metalness: 0 }),
    rim: addGrime(
      new THREE.MeshStandardMaterial({
        color: options.rim ?? paintColor,
        roughness: 0.45,
        metalness: 0.3,
        side: THREE.DoubleSide,
      }),
    ) as THREE.MeshStandardMaterial,
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x22323a,
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.38,
      envMapIntensity: 1.8,
      side: THREE.DoubleSide,
    }),
    interior: new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.8 }),
    lens: new THREE.MeshStandardMaterial({
      color: 0xdfe5ea,
      emissive: 0xfff2d2,
      emissiveIntensity: 0.05,
      roughness: 0.08,
      metalness: 0.4,
    }),
    tail: new THREE.MeshStandardMaterial({
      color: 0x8a0f0f,
      emissive: 0xff1a1a,
      emissiveIntensity: 0.25,
      roughness: 0.2,
    }),
    amber: new THREE.MeshStandardMaterial({
      color: 0xc26a00,
      emissive: 0xff8a00,
      emissiveIntensity: 0.3,
      roughness: 0.2,
    }),
    beacon: new THREE.MeshStandardMaterial({
      color: 0xff9a1f,
      emissive: 0xff7a00,
      emissiveIntensity: 1.4,
      roughness: 0.25,
      transparent: true,
      opacity: 0.88,
    }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardMap, roughness: 0.5, metalness: 0.2 }),
    soil: new THREE.MeshStandardMaterial({ map: soilMap, color: 0xb59a80, roughness: 0.98 }),
    grime,
    dispose() {
      hazardMap.dispose();
      soilMap.dispose();
      for (const value of Object.values(kit)) {
        if (value instanceof THREE.Material) value.dispose();
      }
    },
  };
  return kit;
}

/** Neutral studio reflections for painted metal, glass and chrome. */
export function createEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const texture = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  return texture;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

type Pt = readonly [number, number] | readonly [number, number, number];

const UP = new THREE.Vector3(0, 1, 0);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Closed shape through `points` with rounded corners (third value overrides the radius). */
function roundedShape(points: readonly Pt[], radius: number) {
  const shape = new THREE.Shape();
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[(i - 1 + n) % n]!;
    const c = points[i]!;
    const q = points[(i + 1) % n]!;
    const d1 = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1;
    const d2 = Math.hypot(q[0] - c[0], q[1] - c[1]) || 1;
    const r = Math.min(c[2] ?? radius, d1 / 2, d2 / 2);
    const ax = c[0] + ((p[0] - c[0]) / d1) * r;
    const ay = c[1] + ((p[1] - c[1]) / d1) * r;
    const bx = c[0] + ((q[0] - c[0]) / d2) * r;
    const by = c[1] + ((q[1] - c[1]) / d2) * r;
    if (i === 0) shape.moveTo(ax, ay);
    else shape.lineTo(ax, ay);
    if (r > 0) shape.quadraticCurveTo(c[0], c[1], bx, by);
  }
  shape.closePath();
  return shape;
}

/** Side profile (x, y) extruded symmetrically across z, with softened edges. */
function extrude(points: readonly Pt[], width: number, radius = 0.04, bevel = 0.012) {
  const b = Math.min(bevel, width * 0.3);
  const depth = Math.max(0.001, width - 2 * b);
  const raw = new THREE.ExtrudeGeometry(roundedShape(points, radius), {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 2,
    curveSegments: 6,
  });
  raw.translate(0, 0, -depth / 2);
  const geometry = toCreasedNormals(raw, 0.7);
  raw.dispose();
  return geometry;
}

/** Outline of a beam that follows a centre line with the given half-thicknesses. */
function beamOutline(center: readonly (readonly [number, number])[], half: readonly number[]) {
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  center.forEach(([x, y], i) => {
    const prev = center[Math.max(0, i - 1)]!;
    const next = center[Math.min(center.length - 1, i + 1)]!;
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const h = half[Math.min(i, half.length - 1)]!;
    top.push([x - ty * h, y + tx * h]);
    bottom.push([x + ty * h, y - tx * h]);
  });
  return [...top, ...bottom.reverse()];
}

function rbox(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  radius = Math.min(0.05, Math.min(w, h, d) * 0.25),
) {
  return mesh(new RoundedBoxGeometry(w, h, d, 2, radius), material, x, y, z);
}

function cylinder(
  radius: number,
  length: number,
  material: THREE.Material,
  axis: 'x' | 'y' | 'z',
  x = 0,
  y = 0,
  z = 0,
  segments = 18,
  radiusBottom = radius,
) {
  const geometry = new THREE.CylinderGeometry(radius, radiusBottom, length, segments);
  if (axis === 'x') geometry.rotateZ(-Math.PI / 2);
  if (axis === 'z') geometry.rotateX(Math.PI / 2);
  return mesh(geometry, material, x, y, z);
}

/** A round (or, with 4 segments, square) bar between two points. */
function bar(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  seg = 10,
) {
  const dir = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(radius, radius, dir.length(), seg);
  if (seg === 4) geometry.rotateY(Math.PI / 4);
  const m = mesh(geometry, material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  return m;
}

/** A thin flat panel spanning a → b in the x-y plane, `width` deep in z. */
function pane(
  a: readonly [number, number],
  b: readonly [number, number],
  width: number,
  material: THREE.Material,
  z = 0,
  thickness = 0.02,
) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const m = mesh(
    new THREE.BoxGeometry(Math.hypot(dx, dy), thickness, width),
    material,
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    z,
  );
  m.rotation.z = Math.atan2(dy, dx);
  return m;
}

/** Arc band (mudguard, fender) around the z axis. */
function arcBand(radius: number, thickness: number, width: number, from: number, to: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius + thickness, from, to, false);
  shape.absarc(0, 0, radius, to, from, true);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.translate(0, 0, -width / 2);
  return geometry;
}

function merge(geometries: THREE.BufferGeometry[]) {
  const prepared = geometries.map((g) => {
    const flat = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(flat.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') flat.deleteAttribute(name);
    }
    return flat;
  });
  const merged = mergeGeometries(prepared) ?? new THREE.BufferGeometry();
  for (const g of new Set([...geometries, ...prepared])) g.dispose();
  return merged;
}

/** Lumpy heap of loose soil with its base at y = 0 (unit radius and height). */
export function createSoilHeapGeometry(seed = 3) {
  const random = seeded(seed);
  const geometry = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const phases = Array.from({ length: 6 }, () => random() * Math.PI * 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const angle = Math.atan2(p.z, p.x);
    const lump =
      1 +
      0.1 * Math.sin(angle * 3 + phases[0]!) +
      0.06 * Math.sin(angle * 7 + phases[1]!) +
      0.05 * Math.sin(p.y * 9 + angle * 2 + phases[2]!) +
      0.04 * (random() - 0.5);
    const height = 1 + 0.12 * Math.sin(angle * 2 + phases[3]!) + 0.06 * (random() - 0.5);
    position.setXYZ(i, p.x * lump, Math.max(0, p.y * height), p.z * lump);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Running gear
// ---------------------------------------------------------------------------

interface WheelSpec {
  radius: number;
  width: number;
  rim: number;
  tread: 'lug' | 'road';
  dual?: boolean;
  holes?: boolean;
}

type GeometryCache = Map<string, THREE.BufferGeometry>;

function cached(cache: GeometryCache, key: string, build: () => THREE.BufferGeometry) {
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = build();
    cache.set(key, geometry);
  }
  return geometry;
}

function tyreGeometry(spec: WheelSpec) {
  const { radius: R, width, rim } = spec;
  const hw = width / 2;
  const depth = spec.tread === 'lug' ? R * 0.075 : R * 0.035;
  const Rb = R - depth;
  const side = Rb - rim;
  const half: [number, number][] = [
    [rim, -hw * 0.78],
    [rim + side * 0.25, -hw * 0.95],
    [rim + side * 0.62, -hw],
    [Rb - side * 0.1, -hw * 0.95],
    [Rb - side * 0.02, -hw * 0.82],
    [Rb, -hw * 0.6],
  ];
  const profile = [
    ...half,
    ...half
      .slice()
      .reverse()
      .map(([r, y]) => [r, -y] as [number, number]),
  ];
  const lathe = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    48,
  );
  lathe.rotateX(Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [lathe];
  if (spec.tread === 'lug') {
    // Chevron lugs, as on loader and backhoe tyres.
    const count = Math.round(R * 30);
    for (let i = 0; i < count; i++) {
      for (const s of [-1, 1]) {
        const g = new THREE.BoxGeometry(R * 0.12, depth * 1.3, hw * 1.08);
        g.rotateY(s * 0.55);
        g.translate(0, Rb + depth * 0.45, s * hw * 0.44);
        g.rotateZ(((i + (s > 0 ? 0.5 : 0)) / count) * Math.PI * 2);
        parts.push(g);
      }
    }
  } else {
    const count = Math.round(R * 64);
    for (let i = 0; i < count; i++) {
      for (const [row, offset] of [
        [-0.62, 0],
        [0, 0.5],
        [0.62, 0],
      ] as const) {
        const g = new THREE.BoxGeometry(R * 0.075, depth * 1.2, hw * 0.5);
        g.translate(0, Rb + depth * 0.4, row * hw);
        g.rotateZ(((i + offset) / count) * Math.PI * 2);
        parts.push(g);
      }
    }
  }
  return merge(parts);
}

function rimGeometry(spec: WheelSpec) {
  const { rim, width } = spec;
  const hw = width / 2;
  const barrel = new THREE.CylinderGeometry(rim * 0.98, rim * 0.98, width * 0.8, 32, 1, true);
  barrel.rotateX(Math.PI / 2);
  const flanges = [-1, 1].map((s) => {
    const g = new THREE.TorusGeometry(rim, 0.022, 6, 36);
    g.translate(0, 0, s * hw * 0.8);
    return g;
  });
  const disc = new THREE.LatheGeometry(
    [
      [rim * 0.98, hw * 0.05],
      [rim * 0.82, hw * 0.12],
      [rim * 0.58, hw * 0.42],
      [rim * 0.34, hw * 0.5],
      [0.001, hw * 0.5],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  );
  disc.rotateX(Math.PI / 2);
  return merge([barrel, ...flanges, disc]);
}

function hubGeometry(spec: WheelSpec) {
  const { rim, width } = spec;
  const hw = width / 2;
  const parts: THREE.BufferGeometry[] = [];
  const cap = new THREE.CylinderGeometry(rim * 0.2, rim * 0.26, 0.1, 20);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, hw * 0.5 + 0.05);
  parts.push(cap);
  const nuts = spec.holes ? 10 : 8;
  for (let i = 0; i < nuts; i++) {
    const a = (i / nuts) * Math.PI * 2;
    const g = new THREE.CylinderGeometry(0.018, 0.018, 0.05, 6);
    g.rotateX(Math.PI / 2);
    g.translate(Math.cos(a) * rim * 0.34, Math.sin(a) * rim * 0.34, hw * 0.5 + 0.02);
    parts.push(g);
  }
  return merge(parts);
}

function holesGeometry(spec: WheelSpec) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const g = new THREE.CylinderGeometry(spec.rim * 0.1, spec.rim * 0.1, 0.01, 12);
    g.rotateX(Math.PI / 2);
    // Sits just proud of the sloping disc face.
    g.translate(Math.cos(a) * spec.rim * 0.66, Math.sin(a) * spec.rim * 0.66, spec.width * 0.2);
    parts.push(g);
  }
  return merge(parts);
}

/**
 * A wheel that rolls about its local z axis. `side` is -1 for the left-hand
 * wheels so their dished rims face outwards too.
 */
function wheel(kit: MachineMaterials, cache: GeometryCache, spec: WheelSpec, side: number) {
  const key = `${spec.radius}/${spec.width}/${spec.rim}/${spec.tread}`;
  const tyre = cached(cache, `tyre ${key}`, () => tyreGeometry(spec));
  const rim = cached(cache, `rim ${key}`, () => rimGeometry(spec));
  const hub = cached(cache, `hub ${key}`, () => hubGeometry(spec));
  const spin = new THREE.Group();
  const body = new THREE.Group();
  if (side < 0) body.rotation.y = Math.PI;
  spin.add(body);
  const offsets = spec.dual ? [spec.width * 0.54, -spec.width * 0.54] : [0];
  offsets.forEach((offset, i) => {
    const t = mesh(tyre, kit.rubber, 0, 0, offset);
    const r = mesh(rim, kit.rim, 0, 0, offset);
    body.add(t, r);
    if (i === 0) {
      body.add(mesh(hub, kit.steel, 0, 0, offset));
      if (spec.holes) {
        body.add(
          mesh(
            cached(cache, `holes ${key}`, () => holesGeometry(spec)),
            kit.dark,
            0,
            0,
            offset,
          ),
        );
      }
    }
  });
  return spin;
}

// ---------------------------------------------------------------------------
// Hydraulics
// ---------------------------------------------------------------------------

interface Updatable {
  update(): void;
}

const tmp = new THREE.Vector3();

/**
 * Hydraulic ram between a pin on one part and a pin on another. The barrel
 * stays put on `base`; the chrome rod slides out as the pins separate.
 */
function ram(
  kit: MachineMaterials,
  base: THREE.Object3D,
  target: THREE.Object3D,
  radius: number,
  options: { stages?: number; barrel?: number; material?: THREE.Material } = {},
): Updatable {
  const group = new THREE.Group();
  base.add(group);
  const stages = options.stages ?? 1;
  const barrelGeometry = new THREE.CylinderGeometry(radius, radius, 1, 16);
  barrelGeometry.rotateX(Math.PI / 2);
  barrelGeometry.translate(0, 0, 0.5);
  const barrel = mesh(barrelGeometry, options.material ?? kit.dark);
  group.add(barrel);
  const eye = cylinder(radius * 0.9, radius * 1.6, kit.dark, 'y', 0, 0, 0, 12);
  group.add(eye);
  const rods: THREE.Mesh[] = [];
  const rodCount = stages === 1 ? 1 : stages - 1;
  for (let i = 0; i < rodCount; i++) {
    const r = stages === 1 ? radius * 0.55 : radius * (0.86 - i * 0.14);
    const g = new THREE.CylinderGeometry(r, r, 1, 14);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, 0.5);
    const rod = mesh(g, kit.chrome);
    rods.push(rod);
    group.add(rod);
  }
  const tip = cylinder(radius * 0.7, radius * 1.4, kit.dark, 'y', 0, 0, 0, 10);
  group.add(tip);
  let barrelLength = -1;
  return {
    update() {
      target.getWorldPosition(tmp);
      group.lookAt(tmp);
      base.worldToLocal(tmp);
      const length = tmp.length();
      if (barrelLength < 0) barrelLength = length * (options.barrel ?? 0.62);
      const b = Math.min(barrelLength, length * 0.96);
      barrel.scale.z = b;
      if (stages === 1) {
        rods[0]!.scale.z = length;
      } else {
        // Telescopic: each stage pokes out of the previous one.
        const step = Math.max(0, (length - b) / rodCount);
        rods.forEach((rod, i) => {
          rod.position.z = step * (i + 1);
          rod.scale.z = b;
        });
      }
      tip.position.z = length;
    },
  };
}

/** A straight link (rope, tie rod) stretched between two objects. */
function link(
  base: THREE.Object3D,
  target: THREE.Object3D,
  radius: number,
  material: THREE.Material,
  segments = 8,
): Updatable {
  const group = new THREE.Group();
  base.add(group);
  const geometry = new THREE.CylinderGeometry(radius, radius, 1, segments);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, 0.5);
  const m = mesh(geometry, material);
  group.add(m);
  return {
    update() {
      target.getWorldPosition(tmp);
      group.lookAt(tmp);
      base.worldToLocal(tmp);
      m.scale.z = Math.max(0.001, tmp.length());
    },
  };
}

function pin(parent: THREE.Object3D, x: number, y: number, z = 0) {
  const anchor = new THREE.Object3D();
  anchor.position.set(x, y, z);
  parent.add(anchor);
  return anchor;
}

// ---------------------------------------------------------------------------
// Lamps, cabs and fittings
// ---------------------------------------------------------------------------

/** Round headlight facing `yaw` (0 = +x). Returns the beam anchor. */
function headlight(
  kit: MachineMaterials,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  radius = 0.08,
  yaw = 0,
) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  group.add(cylinder(radius * 1.25, 0.1, kit.dark, 'x', -0.04, 0, 0, 18));
  group.add(cylinder(radius, 0.02, kit.lens, 'x', 0.02, 0, 0, 18));
  parent.add(group);
  return pin(group, 0.04, 0, 0);
}

/** Rectangular LED work light. */
function workLight(
  kit: MachineMaterials,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  pitch = -0.2,
) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.set(0, yaw, pitch, 'YZX');
  group.add(rbox(0.09, 0.11, 0.16, kit.dark, 0, 0, 0, 0.02));
  group.add(mesh(new THREE.BoxGeometry(0.01, 0.085, 0.13), kit.lens, 0.046, 0, 0));
  group.add(bar(v(-0.02, -0.05, 0), v(-0.02, -0.11, 0), 0.012, kit.dark, 6));
  parent.add(group);
  return pin(group, 0.05, 0, 0);
}

/** Rotating amber beacon. Returns the rotating reflector. */
function beacon(kit: MachineMaterials, parent: THREE.Object3D, x: number, y: number, z: number) {
  parent.add(cylinder(0.085, 0.05, kit.dark, 'y', x, y + 0.025, z, 16));
  const dome = new THREE.LatheGeometry(
    [
      [0.07, 0],
      [0.07, 0.1],
      [0.055, 0.14],
      [0.02, 0.16],
      [0.001, 0.162],
    ].map(([r, h]) => new THREE.Vector2(r, h)),
    20,
  );
  const domeMesh = mesh(dome, kit.beacon, x, y + 0.05, z);
  domeMesh.castShadow = false;
  parent.add(domeMesh);
  const rotator = new THREE.Group();
  rotator.position.set(x, y + 0.11, z);
  rotator.add(mesh(new THREE.BoxGeometry(0.02, 0.06, 0.09), kit.amber, 0.02, 0, 0));
  parent.add(rotator);
  return rotator;
}

function mirror(
  kit: MachineMaterials,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  side: number,
  reach = 0.28,
  height = 0.28,
) {
  parent.add(bar(v(x, y, z), v(x + 0.05, y + 0.05, z + side * reach), 0.014, kit.dark, 6));
  parent.add(
    rbox(0.035, height, height * 0.6, kit.dark, x + 0.06, y + 0.05, z + side * reach, 0.012),
  );
}

interface CabSpec {
  rear: number;
  front: number;
  floor: number;
  top: number;
  halfWidth: number;
  /** How far the top of the front pillars leans back. */
  rake: number;
  sill?: number;
  roof?: THREE.Material;
}

/** Operator's ROPS cab: black frame, tinted glass all round, seat and wheel inside. */
function ropsCab(kit: MachineMaterials, spec: CabSpec) {
  const g = new THREE.Group();
  const { rear: x0, front: x1, floor: y0, top: y1, halfWidth: hw, rake } = spec;
  const sill = y0 + (spec.sill ?? 0.28);
  const frontAt = (y: number) => x1 - (rake * (y - y0)) / (y1 - y0);
  const post = 0.05;
  for (const z of [-hw, hw]) {
    g.add(bar(v(x1, y0, z), v(x1 - rake, y1, z), post, kit.dark, 4));
    g.add(bar(v(x0, y0, z), v(x0, y1, z), post, kit.dark, 4));
    const xm = lerp(x0, x1, 0.45);
    g.add(bar(v(xm, sill, z), v(xm, y1, z), post * 0.55, kit.dark, 4));
    g.add(bar(v(x0, sill, z), v(frontAt(sill), sill, z), post * 0.6, kit.dark, 4));
    const glass = mesh(
      extrude(
        [
          [x0 + 0.04, sill + 0.03],
          [frontAt(sill) - 0.04, sill + 0.03],
          [x1 - rake - 0.04, y1 - 0.03],
          [x0 + 0.04, y1 - 0.03],
        ],
        0.014,
        0.03,
        0,
      ),
      kit.glass,
      0,
      0,
      z,
    );
    glass.castShadow = false;
    g.add(glass);
    // Lower door panel.
    g.add(
      mesh(
        extrude(
          [
            [x0 + 0.03, y0],
            [x1 - 0.03, y0],
            [frontAt(sill) - 0.03, sill],
            [x0 + 0.03, sill],
          ],
          0.03,
          0.01,
          0.005,
        ),
        kit.dark,
        0,
        0,
        z,
      ),
    );
    // Door handle.
    g.add(rbox(0.12, 0.025, 0.03, kit.steel, xm + 0.18, sill + 0.35, z + Math.sign(z) * 0.03));
  }
  // Windscreen and rear window.
  const screen = pane([x1, sill], [x1 - rake, y1], hw * 2 - 0.06, kit.glass, 0, 0.014);
  screen.castShadow = false;
  g.add(screen);
  g.add(pane([x1, y0], [frontAt(sill), sill], hw * 2 - 0.04, kit.dark, 0, 0.03));
  const back = pane([x0, sill], [x0, y1], hw * 2 - 0.06, kit.glass, 0, 0.014);
  back.castShadow = false;
  g.add(back);
  g.add(pane([x0, y0], [x0, sill], hw * 2 - 0.04, kit.dark, 0, 0.03));
  // Wiper.
  g.add(
    pane(
      [x1 - 0.01, sill + 0.08],
      [x1 - rake * 0.55, lerp(sill, y1, 0.55)],
      0.012,
      kit.dark,
      0.15,
      0.012,
    ),
  );
  // Roof with a slight overhang, and a dark rain strip.
  const roofMaterial = spec.roof ?? kit.paint;
  g.add(
    rbox(
      x1 - rake - x0 + 0.2,
      0.1,
      hw * 2 + 0.16,
      roofMaterial,
      (x0 + x1 - rake) / 2,
      y1 + 0.05,
      0,
      0.045,
    ),
  );
  g.add(
    rbox(
      x1 - rake - x0 + 0.1,
      0.04,
      hw * 2 + 0.04,
      kit.dark,
      (x0 + x1 - rake) / 2,
      y1 - 0.01,
      0,
      0.015,
    ),
  );
  // Interior: floor, seat, console, steering wheel.
  g.add(rbox(x1 - x0 - 0.06, 0.04, hw * 2 - 0.06, kit.interior, (x0 + x1) / 2, y0 + 0.02, 0));
  const seatX = lerp(x0, x1, 0.32);
  g.add(rbox(0.46, 0.12, 0.5, kit.interior, seatX, y0 + 0.42, 0, 0.04));
  g.add(rbox(0.12, 0.62, 0.48, kit.interior, seatX - 0.25, y0 + 0.78, 0, 0.04));
  g.add(rbox(0.3, 0.3, 0.3, kit.interior, seatX, y0 + 0.22, 0));
  g.add(rbox(0.4, 0.5, 0.18, kit.interior, seatX + 0.05, y0 + 0.3, hw - 0.14));
  const wheelX = x1 - rake * 0.3 - 0.3;
  g.add(bar(v(x1 - 0.1, y0 + 0.1, 0), v(wheelX, y0 + 0.78, 0), 0.03, kit.interior));
  const steering = mesh(
    new THREE.TorusGeometry(0.17, 0.018, 8, 28),
    kit.interior,
    wheelX,
    y0 + 0.8,
    0,
  );
  steering.rotation.y = Math.PI / 2;
  steering.rotation.x = 0.5;
  g.add(steering);
  return g;
}

/** Cab-over truck cab, positioned relative to the front axle (x = 0). */
function truckCab(kit: MachineMaterials) {
  const g = new THREE.Group();
  const hw = 1.2;
  // Body shell from the side profile.
  g.add(
    mesh(
      extrude(
        [
          [-0.55, 1.2],
          [0.97, 1.2],
          [1.0, 1.98],
          [0.88, 2.82],
          [0.74, 2.98],
          [-0.5, 2.98],
          [-0.57, 2.9],
        ],
        hw * 2,
        0.09,
        0.03,
      ),
      kit.accent,
    ),
  );
  // Windscreen, raked back, with a dark frame.
  const screen = pane([1.005, 2.02], [0.885, 2.79], hw * 2 - 0.22, kit.glass, 0, 0.02);
  screen.position.x += 0.012;
  screen.castShadow = false;
  g.add(screen);
  g.add(pane([1.0, 1.99], [0.88, 2.81], hw * 2 - 0.12, kit.dark, 0, 0.012));
  g.add(pane([0.965, 2.06], [0.9, 2.5], 0.015, kit.dark, 0.35, 0.012));
  g.add(pane([0.965, 2.06], [0.9, 2.5], 0.015, kit.dark, -0.35, 0.012));
  // Side windows and door seams.
  for (const s of [-1, 1]) {
    const z = s * (hw + 0.004);
    const glass = mesh(
      extrude(
        [
          [0.05, 2.05],
          [0.9, 2.05],
          [0.8, 2.74],
          [0.05, 2.74],
        ],
        0.016,
        0.04,
        0,
      ),
      kit.glass,
      0,
      0,
      z,
    );
    glass.castShadow = false;
    g.add(glass);
    g.add(
      mesh(
        extrude(
          [
            [0.02, 2.02],
            [0.94, 2.02],
            [0.83, 2.77],
            [0.02, 2.77],
          ],
          0.008,
          0.05,
          0,
        ),
        kit.dark,
        0,
        0,
        z - s * 0.004,
      ),
    );
    g.add(rbox(0.012, 1.55, 0.01, kit.dark, 0.0, 2.0, z));
    g.add(rbox(0.14, 0.03, 0.03, kit.steel, 0.12, 1.92, z + s * 0.02));
    // Steps under the door.
    g.add(rbox(0.36, 0.05, 0.22, kit.dark, 0.4, 0.95, s * (hw - 0.1)));
    g.add(rbox(0.36, 0.05, 0.22, kit.dark, 0.4, 0.66, s * (hw - 0.1)));
    // Mirrors on long arms.
    mirror(kit, g, 0.86, 2.2, s * hw, s, 0.3, 0.42);
    // Front mudguard.
    const guard = mesh(arcBand(0.6, 0.03, 0.42, 0.25, Math.PI - 0.1), kit.dark, 0, 0.54, s * 0.95);
    g.add(guard);
  }
  // Grille band and bumper with lamps.
  g.add(rbox(0.04, 0.5, hw * 2 - 0.5, kit.dark, 0.985, 1.68, 0, 0.015));
  for (let i = 0; i < 4; i++) {
    g.add(rbox(0.03, 0.035, hw * 2 - 0.6, kit.steel, 1.0, 1.5 + i * 0.12, 0, 0.01));
  }
  g.add(rbox(0.26, 0.36, hw * 2 + 0.04, kit.dark, 1.05, 1.02, 0, 0.05));
  g.add(rbox(0.04, 0.1, 0.5, kit.steel, 1.19, 1.02, 0, 0.01));
  const lamps: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    lamps.push(headlight(kit, g, 1.16, 1.07, s * 0.92, 0.075));
    g.add(rbox(0.03, 0.06, 0.16, kit.amber, 1.18, 1.07, s * 1.1, 0.01));
    g.add(cylinder(0.045, 0.03, kit.lens, 'x', 1.19, 0.9, s * 0.75, 12));
  }
  // Sun visor and roof marker lamps.
  const visor = rbox(0.34, 0.04, hw * 2 - 0.1, kit.dark, 0.9, 2.99, 0, 0.015);
  visor.rotation.z = -0.12;
  g.add(visor);
  for (const z of [-0.2, 0, 0.2]) g.add(rbox(0.05, 0.04, 0.08, kit.amber, 0.82, 3.02, z, 0.01));
  // Interior silhouette.
  g.add(rbox(0.5, 0.7, 0.5, kit.interior, 0.25, 1.75, -0.6));
  g.add(rbox(0.5, 0.7, 0.5, kit.interior, 0.25, 1.75, 0.6));
  const steering = mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 28), kit.interior, 0.7, 2.0, -0.6);
  steering.rotation.set(0, Math.PI / 2, 0.9);
  g.add(steering);
  return { group: g, lamps };
}

// ---------------------------------------------------------------------------
// Machine base
// ---------------------------------------------------------------------------

export interface MachineModel {
  root: THREE.Group;
  /** Overall travel length and height, metres. */
  length: number;
  height: number;
  materials: MachineMaterials;
  /** Headlight beam anchors; beams shine along the anchor's +x. */
  headlights: THREE.Object3D[];
  /** Rotating beacon reflectors. */
  beacons: THREE.Object3D[];
  /** Advances wheels / tracks by `distance` metres (negative reverses). */
  roll(distance: number): void;
  /** Steering (or articulation) angle in radians, positive to the left. */
  steer(angle: number): void;
  /** Re-aims rams and cables; call after moving any pivot. */
  update(): void;
  dispose(): void;
}

interface Roller {
  object: THREE.Object3D;
  radius: number;
}

function finishModel(
  root: THREE.Group,
  kit: MachineMaterials,
  cache: GeometryCache,
  parts: {
    length: number;
    height: number;
    headlights: THREE.Object3D[];
    beacons: THREE.Object3D[];
    rollers: Roller[];
    updatables: Updatable[];
    steerPivots?: THREE.Object3D[];
    onRoll?: (distance: number) => void;
    onSteer?: (angle: number) => void;
  },
): MachineModel {
  const model: MachineModel = {
    root,
    length: parts.length,
    height: parts.height,
    materials: kit,
    headlights: parts.headlights,
    beacons: parts.beacons,
    roll(distance) {
      for (const { object, radius } of parts.rollers) object.rotation.z -= distance / radius;
      parts.onRoll?.(distance);
    },
    steer(angle) {
      for (const pivot of parts.steerPivots ?? []) pivot.rotation.y = angle;
      parts.onSteer?.(angle);
    },
    update() {
      root.updateMatrixWorld(true);
      for (const item of parts.updatables) item.update();
    },
    dispose() {
      const done = new Set<{ dispose(): void }>();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const geometry = object.geometry as THREE.BufferGeometry;
          if (!done.has(geometry)) {
            done.add(geometry);
            geometry.dispose();
          }
        }
      });
      for (const geometry of cache.values()) geometry.dispose();
      kit.dispose();
    },
  };
  model.update();
  return model;
}

// ---------------------------------------------------------------------------
// Backhoe loader (экскаватор-погрузчик), 4CX-class: four equal wheels
// ---------------------------------------------------------------------------

export type HoePose = {
  swing: number;
  boom: number;
  stick: number;
  bucket: number;
};

export interface BackhoeLoaderModel extends MachineModel {
  pivots: {
    swing: THREE.Object3D;
    boom: THREE.Object3D;
    stick: THREE.Object3D;
    bucket: THREE.Object3D;
    loaderArms: THREE.Object3D;
    loaderBucket: THREE.Object3D;
    stabilisers: THREE.Object3D[];
    wheels: THREE.Object3D[];
  };
  /** Teeth of the backhoe bucket and the front bucket's cutting edge. */
  bucketTip: THREE.Object3D;
  loaderEdge: THREE.Object3D;
  /** Swing axis of the backhoe in model coordinates. */
  hoeOrigin: THREE.Vector3;
  /** Folded for travel. */
  hoeTravel: HoePose;
  /**
   * Joint angles that put the bucket teeth `reach` metres behind the swing
   * axis and `height` metres above the ground, with the bucket at `pitch`
   * (angle of the bucket in the boom plane; 0 = pointing away, -π/2 = down).
   */
  solveHoe(reach: number, height: number, pitch: number, swing?: number): HoePose;
  setHoe(pose: HoePose): void;
  /** Loader arms: 0 = bucket on the ground, 1 = fully raised; tilt in radians (+ = rolled back). */
  setLoader(lift: number, tilt: number): void;
  /** 0 = stowed, 1 = feet on the ground. */
  setStabilisers(t: number): void;
}

const HOE_BOOM_TIP: [number, number] = [2.45, 0.05];
const HOE_STICK_LENGTH = 1.95;
const HOE_BOOM_PIVOT: [number, number] = [0.3, 0.32];
const HOE_PIVOT_HEIGHT = 0.88;
const HOE_TEETH: [number, number] = [0.62, -0.66];

export function buildBackhoeLoader(
  kit: MachineMaterials = createMachineMaterials(),
): BackhoeLoaderModel {
  const root = new THREE.Group();
  const cache: GeometryCache = new Map();
  const updatables: Updatable[] = [];
  const headlights: THREE.Object3D[] = [];
  const beacons: THREE.Object3D[] = [];
  const R = 0.66;
  const track = 0.9;
  const spec: WheelSpec = { radius: R, width: 0.5, rim: 0.36, tread: 'lug' };
  const rollers: Roller[] = [];
  const steerPivots: THREE.Object3D[] = [];
  const wheelObjects: THREE.Object3D[] = [];
  for (const x of [1.1, -1.1]) {
    for (const side of [-1, 1]) {
      const w = wheel(kit, cache, spec, side);
      if (x > 0) {
        const pivot = new THREE.Group();
        pivot.position.set(x, R, side * track);
        pivot.add(w);
        const guard = mesh(arcBand(R + 0.07, 0.035, 0.56, 0.35, 2.7), kit.dark, 0, 0, side * 0.02);
        pivot.add(guard);
        root.add(pivot);
        steerPivots.push(pivot);
      } else {
        w.position.set(x, R, side * track);
        root.add(w);
        root.add(mesh(arcBand(R + 0.06, 0.035, 0.58, 0.25, 2.2), kit.dark, x, R, side * track));
      }
      wheelObjects.push(w);
      rollers.push({ object: w, radius: R });
    }
  }

  // Chassis, axles and front counterweight.
  root.add(rbox(4.0, 0.36, 0.72, kit.dark, 0.05, 0.8, 0));
  for (const x of [1.1, -1.1]) {
    root.add(cylinder(0.09, track * 2 - 0.3, kit.dark, 'z', x, R, 0, 14));
    root.add(mesh(new THREE.SphereGeometry(0.2, 16, 12), kit.dark, x, R, 0));
  }
  root.add(rbox(0.24, 0.38, 1.16, kit.dark, 2.24, 0.84, 0, 0.06));
  root.add(cylinder(0.05, 0.3, kit.wear, 'y', 2.3, 0.66, 0, 10));

  // Engine hood.
  const hood: Pt[] = [
    [0.36, 0.96],
    [2.02, 0.96],
    [2.14, 1.08],
    [2.14, 1.42],
    [2.02, 1.56, 0.1],
    [0.36, 1.74],
  ];
  root.add(mesh(extrude(hood, 0.96, 0.08, 0.03), kit.paint));
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) {
      root.add(
        rbox(0.3, 0.025, 0.01, kit.dark, 1.0 + i * 0.18, 1.34 - i * 0.012, s * 0.482, 0.005),
      );
    }
  }
  // Grille and headlights.
  root.add(rbox(0.03, 0.36, 0.7, kit.dark, 2.145, 1.26, 0, 0.01));
  for (let i = 0; i < 5; i++)
    root.add(rbox(0.02, 0.025, 0.66, kit.steel, 2.16, 1.12 + i * 0.07, 0));
  for (const s of [-1, 1]) {
    headlights.push(headlight(kit, root, 2.1, 1.5, s * 0.36, 0.07));
    root.add(rbox(0.03, 0.05, 0.1, kit.amber, 2.14, 1.62, s * 0.4, 0.01));
  }
  // Exhaust stack and air intake.
  root.add(cylinder(0.05, 0.75, kit.dark, 'y', 1.75, 2.0, 0.3, 12));
  root.add(cylinder(0.06, 0.12, kit.chrome, 'y', 1.75, 2.4, 0.3, 12));
  root.add(cylinder(0.075, 0.42, kit.dark, 'y', 1.35, 1.9, -0.3, 14));
  root.add(cylinder(0.11, 0.1, kit.dark, 'y', 1.35, 2.15, -0.3, 16));

  // Loader towers either side of the hood.
  for (const s of [-1, 1]) {
    root.add(
      mesh(
        extrude(
          [
            [0.02, 0.9],
            [0.72, 0.9],
            [0.46, 2.0],
            [0.18, 2.02],
          ],
          0.12,
          0.05,
        ),
        kit.paint,
        0,
        0,
        s * 0.6,
      ),
    );
  }

  // Cab over the rear axle, lower body between the wheels.
  root.add(rbox(1.9, 0.5, 1.28, kit.paint, -0.55, 1.18, 0, 0.06));
  root.add(
    ropsCab(kit, { rear: -1.5, front: 0.34, floor: 1.4, top: 2.92, halfWidth: 0.8, rake: 0.1 }),
  );
  for (const s of [-1, 1]) mirror(kit, root, 0.26, 2.25, s * 0.82, s, 0.2);
  beacons.push(beacon(kit, root, -1.25, 2.97, -0.55));
  for (const s of [-1, 1]) {
    headlights.push(workLight(kit, root, 0.3, 2.9, s * 0.62));
    workLight(kit, root, -1.52, 2.9, s * 0.62, Math.PI);
  }
  // Steps and grab handles.
  for (const s of [-1, 1]) {
    root.add(rbox(0.3, 0.04, 0.2, kit.dark, -0.2, 0.62, s * 0.62));
    root.add(bar(v(0.2, 1.55, s * 0.84), v(0.18, 2.5, s * 0.84), 0.016, kit.dark, 6));
  }

  // Rear body, tail lights and the backhoe mounting frame.
  root.add(
    mesh(
      extrude(
        [
          [-2.08, 0.9],
          [-1.45, 0.9],
          [-1.45, 1.6],
          [-2.02, 1.52],
        ],
        1.28,
        0.07,
        0.02,
      ),
      kit.paint,
    ),
  );
  for (const s of [-1, 1]) root.add(rbox(0.04, 0.1, 0.16, kit.tail, -2.06, 1.4, s * 0.52));
  root.add(rbox(0.36, 0.95, 1.5, kit.dark, -2.22, 1.05, 0, 0.05));

  // Stabiliser legs.
  const stabilisers: {
    pivot: THREE.Group;
    inner: THREE.Object3D;
    foot: THREE.Object3D;
    side: number;
  }[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(-2.24, 1.36, s * 0.72);
    root.add(pivot);
    pivot.add(rbox(0.22, 0.95, 0.2, kit.paint, 0, -0.42, 0, 0.03));
    pivot.add(cylinder(0.08, 0.3, kit.dark, 'x', 0, 0, 0, 14));
    const inner = new THREE.Group();
    pivot.add(inner);
    inner.add(rbox(0.15, 0.8, 0.14, kit.dark, 0, -0.62, 0, 0.02));
    const foot = new THREE.Group();
    foot.position.y = -1.0;
    inner.add(foot);
    foot.add(rbox(0.42, 0.06, 0.34, kit.dark, 0, -0.03, 0, 0.02));
    foot.add(cylinder(0.05, 0.2, kit.dark, 'x', 0, 0.02, 0, 10));
    stabilisers.push({ pivot, inner, foot, side: s });
  }

  // Front loader: arms, cross tube, rams, bucket.
  const arms = new THREE.Group();
  arms.position.set(0.32, 1.9, 0);
  root.add(arms);
  const armLine: [number, number][] = [
    [0, 0],
    [1.0, 0.05],
    [1.72, -0.42],
    [2.12, -1.36],
  ];
  for (const s of [-1, 1]) {
    arms.add(
      mesh(
        extrude(beamOutline(armLine, [0.12, 0.14, 0.12, 0.1]), 0.11, 0.05),
        kit.paint,
        0,
        0,
        s * 0.575,
      ),
    );
    arms.add(cylinder(0.075, 0.16, kit.dark, 'z', 0, 0, s * 0.575, 14));
  }
  arms.add(cylinder(0.07, 1.26, kit.paint, 'z', 1.55, -0.24, 0, 14));
  const loaderBucket = new THREE.Group();
  loaderBucket.position.set(2.12, -1.36, 0);
  arms.add(loaderBucket);
  const bucketWidth = 2.24;
  loaderBucket.add(
    mesh(
      extrude(
        beamOutline(
          [
            [0.02, 0.64],
            [-0.06, 0.2],
            [0.06, -0.24],
            [0.36, -0.42],
            [1.0, -0.44],
          ],
          [0.025],
        ),
        bucketWidth,
        0.02,
        0.008,
      ),
      kit.paint,
    ),
  );
  for (const s of [-1, 1]) {
    loaderBucket.add(
      mesh(
        extrude(
          [
            [0.0, 0.68],
            [0.24, 0.68],
            [1.04, -0.38],
            [1.0, -0.47],
            [0.36, -0.46],
            [0.0, -0.3],
            [-0.09, 0.2],
          ],
          0.035,
          0.04,
          0.008,
        ),
        kit.paint,
        0,
        0,
        s * (bucketWidth / 2),
      ),
    );
    loaderBucket.add(
      mesh(
        extrude(
          [
            [-0.12, 0.02],
            [0.08, -0.12],
            [0.1, 0.72],
            [-0.06, 0.74],
          ],
          0.05,
          0.03,
        ),
        kit.paint,
        0,
        0,
        s * 0.575,
      ),
    );
  }
  loaderBucket.add(rbox(0.06, 0.06, bucketWidth + 0.04, kit.paint, 0.08, 0.66, 0, 0.02));
  loaderBucket.add(rbox(0.16, 0.035, bucketWidth, kit.wear, 1.0, -0.455, 0, 0.012));
  const loaderEdge = pin(loaderBucket, 1.05, -0.45);
  for (const s of [-1, 1]) {
    updatables.push(
      ram(kit, pin(root, 0.92, 0.95, s * 0.575), pin(arms, 1.12, -0.12, s * 0.575), 0.07),
    );
    updatables.push(
      ram(kit, pin(arms, 0.28, 0.2, s * 0.575), pin(loaderBucket, -0.02, 0.58, s * 0.575), 0.065, {
        barrel: 0.55,
      }),
    );
  }

  // Backhoe: swing casting, boom, dipper, bucket.
  const hoeOrigin = new THREE.Vector3(-2.46, 0, 0);
  const hoe = new THREE.Group();
  hoe.position.set(hoeOrigin.x, HOE_PIVOT_HEIGHT, 0);
  hoe.rotation.y = Math.PI;
  root.add(hoe);
  const swing = new THREE.Group();
  hoe.add(swing);
  swing.add(
    mesh(
      extrude(
        [
          [-0.14, -0.48],
          [0.22, -0.48],
          [0.46, 0.18],
          [0.42, 0.5],
          [0.08, 0.52],
          [-0.14, 0.3],
        ],
        0.46,
        0.07,
        0.02,
      ),
      kit.paint,
    ),
  );
  swing.add(cylinder(0.1, 0.16, kit.dark, 'y', -0.02, 0.58, 0, 16));
  swing.add(cylinder(0.1, 0.16, kit.dark, 'y', -0.02, -0.55, 0, 16));
  const boom = new THREE.Group();
  boom.position.set(HOE_BOOM_PIVOT[0], HOE_BOOM_PIVOT[1], 0);
  swing.add(boom);
  boom.add(
    mesh(
      extrude(
        beamOutline(
          [
            [-0.05, 0],
            [1.05, 0.52],
            [HOE_BOOM_TIP[0], HOE_BOOM_TIP[1]],
          ],
          [0.17, 0.21, 0.13],
        ),
        0.3,
        0.1,
        0.02,
      ),
      kit.paint,
    ),
  );
  boom.add(cylinder(0.11, 0.38, kit.dark, 'z', 0, 0, 0, 16));
  boom.add(cylinder(0.1, 0.36, kit.dark, 'z', HOE_BOOM_TIP[0], HOE_BOOM_TIP[1], 0, 16));
  const stick = new THREE.Group();
  stick.position.set(HOE_BOOM_TIP[0], HOE_BOOM_TIP[1], 0);
  boom.add(stick);
  stick.add(
    mesh(
      extrude(
        beamOutline(
          [
            [-0.34, 0.36],
            [0, 0],
            [1.0, -0.05],
            [HOE_STICK_LENGTH, 0],
          ],
          [0.09, 0.17, 0.13, 0.09],
        ),
        0.24,
        0.08,
        0.02,
      ),
      kit.paint,
    ),
  );
  stick.add(cylinder(0.08, 0.3, kit.dark, 'z', HOE_STICK_LENGTH, 0, 0, 14));
  const bucket = new THREE.Group();
  bucket.position.set(HOE_STICK_LENGTH, 0, 0);
  stick.add(bucket);
  const hoeBucketWidth = 0.6;
  bucket.add(
    mesh(
      extrude(
        beamOutline(
          [
            [-0.04, 0.2],
            [0.34, 0.27],
            [0.7, 0.14],
            [0.9, -0.12],
            [0.86, -0.38],
            [0.7, -0.52],
          ],
          [0.02],
        ),
        hoeBucketWidth,
        0.02,
        0.006,
      ),
      kit.paint,
    ),
  );
  for (const s of [-1, 1]) {
    bucket.add(
      mesh(
        extrude(
          [
            [-0.06, 0.24],
            [0.34, 0.3],
            [0.72, 0.17],
            [0.93, -0.12],
            [0.89, -0.4],
            [0.7, -0.55],
            [0.1, -0.06],
            [-0.06, 0.06],
          ],
          0.025,
          0.03,
          0.006,
        ),
        kit.paint,
        0,
        0,
        s * (hoeBucketWidth / 2),
      ),
    );
    bucket.add(
      mesh(
        extrude(
          [
            [-0.14, 0.12],
            [0.12, -0.06],
            [0.2, 0.26],
            [-0.2, 0.4],
          ],
          0.03,
          0.03,
        ),
        kit.dark,
        0,
        0,
        s * 0.11,
      ),
    );
  }
  const toothDir = Math.atan2(-0.52 + 0.38, 0.7 - 0.86);
  for (let i = 0; i < 5; i++) {
    const tooth = mesh(
      extrude(
        [
          [-0.02, -0.035],
          [0.13, -0.008],
          [0.15, 0.006],
          [-0.02, 0.035],
        ],
        0.06,
        0.01,
        0.005,
      ),
      kit.wear,
      0.7,
      -0.53,
      (i - 2) * 0.125,
    );
    tooth.rotation.z = toothDir;
    bucket.add(tooth);
  }
  const bucketTip = pin(bucket, HOE_TEETH[0], HOE_TEETH[1]);
  updatables.push(ram(kit, pin(swing, 0.36, -0.3), pin(boom, 0.92, 0.26), 0.085));
  updatables.push(ram(kit, pin(boom, 0.98, 0.72), pin(stick, -0.34, 0.36), 0.075));
  updatables.push(ram(kit, pin(stick, 0.25, 0.22), pin(bucket, -0.16, 0.34), 0.065));

  const hoeTravel: HoePose = { swing: 0, boom: 1.45, stick: -2.75, bucket: -2.4 };

  const [bx, by] = HOE_BOOM_TIP;
  const L1 = Math.hypot(bx, by);
  const beta = Math.atan2(by, bx);
  const L2 = HOE_STICK_LENGTH;

  function solveHoe(reach: number, height: number, pitch: number, swingAngle = 0): HoePose {
    // Bucket pin from the teeth position, then two-link IK in the boom plane.
    const c = Math.cos(pitch);
    const s = Math.sin(pitch);
    const px = reach - (HOE_TEETH[0] * c - HOE_TEETH[1] * s);
    const py = height - HOE_PIVOT_HEIGHT - (HOE_TEETH[0] * s + HOE_TEETH[1] * c);
    const dx = px - HOE_BOOM_PIVOT[0];
    const dy = py - HOE_BOOM_PIVOT[1];
    const d = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, Math.hypot(dx, dy)));
    const a = Math.atan2(dy, dx);
    const k = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
    const chord = a + k;
    const ex = L1 * Math.cos(chord);
    const ey = L1 * Math.sin(chord);
    const stickAngle = Math.atan2(dy - ey, dx - ex);
    const boomAngle = chord - beta;
    return {
      swing: swingAngle,
      boom: boomAngle,
      stick: stickAngle - boomAngle,
      bucket: pitch - stickAngle,
    };
  }

  const model = finishModel(root, kit, cache, {
    length: 6.3,
    height: 3.75,
    headlights,
    beacons,
    rollers,
    updatables,
    steerPivots,
  });

  const result: BackhoeLoaderModel = {
    ...model,
    pivots: {
      swing,
      boom,
      stick,
      bucket,
      loaderArms: arms,
      loaderBucket,
      stabilisers: stabilisers.map((item) => item.pivot),
      wheels: wheelObjects,
    },
    bucketTip,
    loaderEdge,
    hoeOrigin,
    hoeTravel,
    solveHoe,
    setHoe(pose) {
      swing.rotation.y = pose.swing;
      boom.rotation.z = pose.boom;
      stick.rotation.z = pose.stick;
      bucket.rotation.z = pose.bucket;
    },
    setLoader(lift, tilt) {
      arms.rotation.z = lift * 0.95;
      loaderBucket.rotation.z = tilt - lift * 0.95;
    },
    setStabilisers(t) {
      const k = Math.min(1, Math.max(0, t));
      for (const { pivot, inner, foot, side } of stabilisers) {
        const angle = lerp(0.16, 0.5, k);
        pivot.rotation.x = -side * angle;
        inner.position.y = -lerp(0, 0.5, k);
        foot.rotation.x = side * angle;
      }
    },
  };
  result.setHoe(hoeTravel);
  result.setLoader(0.25, 0.3);
  result.setStabilisers(0);
  result.update();
  return result;
}

// ---------------------------------------------------------------------------
// Truck-mounted mobile crane (автокран), 6x4 carrier, 4-section boom
// ---------------------------------------------------------------------------

export interface MobileCraneModel extends MachineModel {
  pivots: {
    turret: THREE.Object3D;
    boom: THREE.Object3D;
    sections: THREE.Object3D[];
    hook: THREE.Object3D;
  };
  hookPoint: THREE.Object3D;
  /** 0 = stowed, 1 = beams out and pads on the ground. */
  setOutriggers(t: number): void;
  /** Elevation (rad), telescope extension 0…1, hook height above ground (m). */
  setBoom(elevation: number, extension: number, hookHeight: number, sway?: number): void;
}

function boomSectionGeometry(width: number, height: number, length: number) {
  const shape = roundedShape(
    [
      [-width / 2, height / 2],
      [width / 2, height / 2],
      [width / 2, -height * 0.05],
      [width * 0.2, -height / 2],
      [-width * 0.2, -height / 2],
      [-width / 2, -height * 0.05],
    ],
    Math.min(width, height) * 0.14,
  );
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelOffset: -0.02,
    bevelSegments: 1,
    curveSegments: 4,
  });
  raw.rotateY(-Math.PI / 2);
  raw.translate(length, 0, 0);
  const geometry = toCreasedNormals(raw, 0.6);
  raw.dispose();
  return geometry;
}

export function buildMobileCrane(
  kit: MachineMaterials = createMachineMaterials({ accent: 0xe9e7e1, rim: 0x6b7078 }),
): MobileCraneModel {
  const root = new THREE.Group();
  const cache: GeometryCache = new Map();
  const updatables: Updatable[] = [];
  const beacons: THREE.Object3D[] = [];
  const R = 0.55;
  const front = 3.35;
  const rollers: Roller[] = [];
  const steerPivots: THREE.Object3D[] = [];
  const single: WheelSpec = { radius: R, width: 0.32, rim: 0.28, tread: 'road', holes: true };
  const dual: WheelSpec = { ...single, dual: true };
  for (const x of [front, -0.35, -1.7]) {
    for (const s of [-1, 1]) {
      const isFront = x === front;
      const w = wheel(kit, cache, isFront ? single : dual, s);
      if (isFront) {
        const pivot = new THREE.Group();
        pivot.position.set(x, R, s * 0.98);
        pivot.add(w);
        root.add(pivot);
        steerPivots.push(pivot);
      } else {
        w.position.set(x, R, s * 0.8);
        root.add(w);
      }
      rollers.push({ object: w, radius: R });
    }
    root.add(cylinder(0.08, 1.6, kit.dark, 'z', x, R, 0, 12));
  }
  // Rear bogie mudguards.
  for (const s of [-1, 1]) {
    root.add(rbox(2.2, 0.04, 0.72, kit.dark, -1.02, 1.2, s * 0.84, 0.015));
  }

  // Frame, subframe deck and cab.
  for (const s of [-1, 1]) root.add(rbox(7.3, 0.3, 0.1, kit.dark, 0.4, 0.95, s * 0.45, 0.02));
  root.add(rbox(5.4, 0.34, 2.3, kit.paint, -0.55, 1.25, 0, 0.05));
  root.add(rbox(5.2, 0.02, 2.1, kit.steel, -0.55, 1.43, 0, 0.005));
  const cab = truckCab(kit);
  cab.group.position.x = front;
  root.add(cab.group);
  const headlights = cab.lamps;
  beacons.push(beacon(kit, cab.group, -0.3, 2.99, -0.8));
  // Rear bumper with lamps.
  root.add(mesh(new THREE.BoxGeometry(0.12, 0.2, 2.3), kit.hazard, -3.25, 0.8, 0));
  for (const s of [-1, 1]) root.add(rbox(0.04, 0.1, 0.24, kit.tail, -3.32, 0.95, s * 0.9));
  // Fuel tank and tool boxes between the axles.
  root.add(cylinder(0.26, 0.9, kit.steel, 'x', 1.95, 0.9, -1.0, 20));
  root.add(rbox(0.9, 0.5, 0.4, kit.dark, 1.95, 0.85, 1.0));

  // Outriggers: boxes across the frame, beams slide out, jacks drop.
  const outriggers: { beam: THREE.Object3D; jack: THREE.Object3D; side: number }[] = [];
  for (const x of [2.2, -2.85]) {
    root.add(rbox(0.46, 0.38, 2.36, kit.paint, x, 0.9, 0, 0.04));
    for (const s of [-1, 1]) {
      const beam = new THREE.Group();
      beam.position.set(x, 0.9, 0);
      root.add(beam);
      beam.add(rbox(0.34, 0.28, 1.9, kit.paint, 0, 0, s * 0.3, 0.03));
      beam.add(mesh(new THREE.BoxGeometry(0.36, 0.06, 0.24), kit.hazard, 0, 0.12, s * 1.15));
      const housing = new THREE.Group();
      housing.position.z = s * 1.3;
      beam.add(housing);
      housing.add(cylinder(0.12, 0.6, kit.paint, 'y', 0, 0.1, 0, 16));
      const jack = new THREE.Group();
      housing.add(jack);
      jack.add(cylinder(0.085, 0.7, kit.chrome, 'y', 0, -0.2, 0, 14));
      jack.add(cylinder(0.3, 0.05, kit.steel, 'y', 0, -0.57, 0, 22));
      outriggers.push({ beam, jack, side: s });
    }
  }

  // Boom rest behind the cab.
  for (const s of [-1, 1])
    root.add(bar(v(2.62, 1.4, s * 0.55), v(2.62, 3.05, s * 0.3), 0.05, kit.dark, 4));
  root.add(rbox(0.16, 0.12, 0.8, kit.dark, 2.62, 3.08, 0, 0.02));

  // Superstructure.
  const turret = new THREE.Group();
  turret.position.set(-1.0, 1.44, 0);
  root.add(turret);
  turret.add(cylinder(0.85, 0.14, kit.dark, 'y', 0, 0.07, 0, 32));
  turret.add(rbox(2.5, 0.46, 1.9, kit.paint, -0.35, 0.37, 0, 0.06));
  for (const s of [-1, 1]) {
    turret.add(
      mesh(
        extrude(
          [
            [-1.35, 0.55],
            [0.85, 0.55],
            [0.5, 1.2],
            [-0.8, 2.25],
            [-1.3, 2.2],
          ],
          0.1,
          0.06,
        ),
        kit.paint,
        0,
        0,
        s * 0.42,
      ),
    );
  }
  // Counterweight and winch.
  turret.add(rbox(0.62, 0.95, 1.95, kit.dark, -1.72, 0.9, 0, 0.06));
  for (let i = 0; i < 3; i++)
    turret.add(rbox(0.64, 0.02, 1.97, kit.steel, -1.72, 0.6 + i * 0.3, 0));
  turret.add(cylinder(0.28, 0.75, kit.dark, 'z', -1.15, 1.35, 0, 22));
  turret.add(cylinder(0.25, 0.7, kit.steel, 'z', -1.15, 1.35, 0, 22));
  // Operator's cab on the left of the boom.
  const opCab = new THREE.Group();
  opCab.position.set(0.25, 0.6, -0.78);
  turret.add(opCab);
  opCab.add(
    mesh(
      extrude(
        [
          [-0.55, 0],
          [0.55, 0],
          [0.62, 0.55],
          [0.48, 1.3],
          [-0.55, 1.3],
        ],
        0.74,
        0.06,
        0.02,
      ),
      kit.paint,
    ),
  );
  opCab.add(pane([0.625, 0.6], [0.5, 1.24], 0.64, kit.glass, 0, 0.02));
  const opSide = mesh(
    extrude(
      [
        [-0.2, 0.62],
        [0.5, 0.62],
        [0.4, 1.22],
        [-0.2, 1.22],
      ],
      0.02,
      0.03,
      0,
    ),
    kit.glass,
    0,
    0,
    -0.375,
  );
  opCab.add(opSide);
  opCab.add(rbox(1.2, 0.05, 0.8, kit.dark, -0.02, 1.32, 0, 0.02));
  beacons.push(beacon(kit, opCab, -0.35, 1.34, 0));
  headlights.push(workLight(kit, opCab, 0.5, 1.36, 0.25));

  // Telescopic boom.
  const boom = new THREE.Group();
  boom.position.set(-1.05, 2.02, 0);
  turret.add(boom);
  boom.add(cylinder(0.14, 0.95, kit.dark, 'z', 0, 0, 0, 16));
  const sizes: [number, number, number, number][] = [
    [0.66, 0.74, 6.6, -0.4],
    [0.56, 0.62, 6.25, -0.05],
    [0.47, 0.52, 6.05, 0.15],
    [0.38, 0.42, 5.9, 0.35],
  ];
  const sections: THREE.Object3D[] = [];
  sizes.forEach(([w, h, length, start], i) => {
    const section = new THREE.Group();
    section.position.x = start;
    boom.add(section);
    section.add(mesh(boomSectionGeometry(w, h, length), i === 0 ? kit.paint : kit.accent));
    // Wear pads and a dark collar at the head of each section.
    section.add(rbox(0.12, h + 0.02, w + 0.02, kit.dark, length - 0.06, 0, 0, 0.02));
    sections.push(section);
  });
  const last = sections[sections.length - 1]!;
  const tipX = sizes[sizes.length - 1]![2];
  const head = new THREE.Group();
  head.position.x = tipX;
  last.add(head);
  head.add(
    mesh(
      extrude(
        [
          [-0.05, 0.2],
          [0.35, 0.2],
          [0.55, -0.05],
          [0.45, -0.3],
          [-0.05, -0.22],
        ],
        0.4,
        0.06,
      ),
      kit.paint,
    ),
  );
  for (const z of [-0.1, 0.1]) head.add(cylinder(0.2, 0.05, kit.steel, 'z', 0.38, -0.05, z, 22));
  head.add(cylinder(0.05, 0.44, kit.dark, 'z', 0.38, -0.05, 0, 10));
  // Rope and hook block, hanging plumb from the head sheave.
  const hanger = new THREE.Group();
  hanger.position.set(0.38, -0.25, 0);
  head.add(hanger);
  const hook = new THREE.Group();
  hanger.add(hook);
  hook.add(mesh(new THREE.BoxGeometry(0.36, 0.42, 0.2), kit.hazard, 0, -0.21, 0));
  for (const z of [-0.105, 0.105]) hook.add(rbox(0.4, 0.46, 0.02, kit.dark, 0, -0.21, z, 0.01));
  hook.add(cylinder(0.1, 0.24, kit.steel, 'z', 0, -0.04, 0, 16));
  hook.add(cylinder(0.05, 0.18, kit.steel, 'y', 0, -0.5, 0, 12));
  const hookCurve = mesh(
    new THREE.TorusGeometry(0.11, 0.035, 10, 24, Math.PI * 1.45),
    kit.steel,
    0.02,
    -0.7,
    0,
  );
  hookCurve.rotation.z = Math.PI * 0.72;
  hook.add(hookCurve);
  const hookPoint = pin(hook, 0, -0.75);
  const ropeLeft = pin(hanger, 0, 0, -0.03);
  const ropeRight = pin(hanger, 0, 0, 0.03);
  updatables.push(link(ropeLeft, pin(hook, 0, -0.02, -0.03), 0.012, kit.steel, 6));
  updatables.push(link(ropeRight, pin(hook, 0, -0.02, 0.03), 0.012, kit.steel, 6));
  // Hoist rope along the boom from the winch.
  updatables.push(link(pin(turret, -1.15, 1.62), pin(head, 0.3, 0.16), 0.012, kit.steel, 6));
  // Luffing ram.
  updatables.push(
    ram(kit, pin(turret, 0.62, 0.62), pin(sections[0]!, 2.55, -0.32), 0.15, { barrel: 0.85 }),
  );

  const model = finishModel(root, kit, cache, {
    length: 8.1,
    height: 3.8,
    headlights,
    beacons,
    rollers,
    updatables,
    steerPivots,
  });

  const result: MobileCraneModel = {
    ...model,
    pivots: { turret, boom, sections, hook },
    hookPoint,
    setOutriggers(t) {
      const extend = Math.min(1, t / 0.6);
      const drop = Math.max(0, (t - 0.6) / 0.4);
      for (const { beam, jack, side } of outriggers) {
        beam.position.z = side * 1.35 * extend;
        jack.position.y = lerp(0.22, -0.3, drop);
      }
    },
    setBoom(elevation, extension, hookHeight, sway = 0) {
      boom.rotation.z = elevation;
      sections.forEach((section, i) => {
        section.position.x = sizes[i]![3] + i * 4.6 * extension;
      });
      hanger.rotation.z = -elevation + sway;
      root.updateMatrixWorld(true);
      hanger.getWorldPosition(tmp);
      root.worldToLocal(tmp);
      const drop = Math.max(0.35, tmp.y - hookHeight);
      hook.position.y = -drop;
    },
  };
  result.setOutriggers(0);
  result.setBoom(-0.015, 0, 1.25);
  result.update();
  return result;
}

// ---------------------------------------------------------------------------
// Articulated front wheel loader (фронтальный погрузчик), 950-class
// ---------------------------------------------------------------------------

export interface WheelLoaderModel extends MachineModel {
  pivots: { frontFrame: THREE.Object3D; arms: THREE.Object3D; bucket: THREE.Object3D };
  bucketEdge: THREE.Object3D;
  /** lift 0 = bucket on the ground, 1 = full height; tilt in radians (+ = rolled back). */
  setLoader(lift: number, tilt: number): void;
}

export function buildWheelLoader(
  kit: MachineMaterials = createMachineMaterials({ rim: 0xf2a900 }),
): WheelLoaderModel {
  const root = new THREE.Group();
  const cache: GeometryCache = new Map();
  const updatables: Updatable[] = [];
  const headlights: THREE.Object3D[] = [];
  const beacons: THREE.Object3D[] = [];
  const R = 0.8;
  const spec: WheelSpec = { radius: R, width: 0.6, rim: 0.42, tread: 'lug' };
  const rollers: Roller[] = [];
  const frontFrame = new THREE.Group();
  frontFrame.position.x = 0.05;
  root.add(frontFrame);

  for (const s of [-1, 1]) {
    const rear = wheel(kit, cache, spec, s);
    rear.position.set(-1.65, R, s * 1.05);
    root.add(rear);
    rollers.push({ object: rear, radius: R });
    root.add(mesh(arcBand(R + 0.08, 0.04, 0.66, 0.1, 2.2), kit.dark, -1.65, R, s * 1.05));
    const fw = wheel(kit, cache, spec, s);
    fw.position.set(1.6, R, s * 1.05);
    frontFrame.add(fw);
    rollers.push({ object: fw, radius: R });
    frontFrame.add(mesh(arcBand(R + 0.08, 0.04, 0.66, 0.5, 2.6), kit.dark, 1.6, R, s * 1.05));
  }
  root.add(cylinder(0.12, 1.7, kit.dark, 'z', -1.65, R, 0, 14));
  frontFrame.add(cylinder(0.12, 1.7, kit.dark, 'z', 1.6, R, 0, 14));
  root.add(mesh(new THREE.SphereGeometry(0.26, 16, 12), kit.dark, -1.65, R, 0));
  frontFrame.add(mesh(new THREE.SphereGeometry(0.26, 16, 12), kit.dark, 1.6, R, 0));

  // Rear frame: chassis, hood, counterweight, fenders and walkways.
  root.add(rbox(3.3, 0.5, 1.0, kit.dark, -1.75, 0.9, 0, 0.05));
  root.add(
    mesh(
      extrude(
        [
          [-1.3, 1.12],
          [-3.3, 1.12],
          [-3.42, 1.3],
          [-3.42, 2.02],
          [-3.25, 2.2, 0.12],
          [-1.36, 2.36],
        ],
        1.3,
        0.1,
        0.03,
      ),
      kit.paint,
    ),
  );
  root.add(rbox(0.03, 0.55, 1.0, kit.dark, -3.43, 1.66, 0, 0.01));
  for (let i = 0; i < 6; i++)
    root.add(rbox(0.02, 0.03, 0.96, kit.steel, -3.445, 1.44 + i * 0.09, 0));
  root.add(rbox(0.46, 0.66, 2.1, kit.paint, -3.5, 0.98, 0, 0.12));
  for (const s of [-1, 1]) {
    root.add(rbox(0.05, 0.12, 0.18, kit.tail, -3.74, 1.18, s * 0.82, 0.02));
    workLight(kit, root, -3.3, 2.3, s * 0.55, Math.PI);
    root.add(rbox(1.6, 0.04, 0.6, kit.dark, -1.65, 1.72, s * 1.02, 0.01));
    for (let i = 0; i < 6; i++) {
      root.add(rbox(1.6, 0.012, 0.012, kit.steel, -1.65, 1.745, s * (0.76 + i * 0.1)));
    }
    root.add(bar(v(-2.4, 1.74, s * 1.3), v(-2.4, 2.35, s * 1.3), 0.018, kit.paint, 8));
    root.add(bar(v(-0.9, 1.74, s * 1.3), v(-0.9, 2.35, s * 1.3), 0.018, kit.paint, 8));
    root.add(bar(v(-2.4, 2.35, s * 1.3), v(-0.9, 2.35, s * 1.3), 0.018, kit.paint, 8));
  }
  // Ladder to the cab.
  for (const z of [-1.28, -1.02])
    root.add(bar(v(-0.72, 0.35, z), v(-0.82, 1.72, z), 0.02, kit.dark, 6));
  for (let i = 0; i < 4; i++)
    root.add(rbox(0.06, 0.03, 0.26, kit.dark, -0.73 - i * 0.025, 0.45 + i * 0.36, -1.15));
  // Exhaust and pre-cleaner.
  root.add(cylinder(0.065, 0.6, kit.dark, 'y', -2.6, 2.55, 0.3, 12));
  root.add(cylinder(0.075, 0.1, kit.chrome, 'y', -2.6, 2.86, 0.3, 12));
  root.add(cylinder(0.09, 0.4, kit.dark, 'y', -2.0, 2.5, -0.3, 14));
  root.add(cylinder(0.13, 0.12, kit.dark, 'y', -2.0, 2.73, -0.3, 16));
  // Cab.
  root.add(rbox(1.5, 0.5, 1.2, kit.paint, -0.62, 1.42, 0, 0.06));
  root.add(
    ropsCab(kit, { rear: -1.35, front: 0.1, floor: 1.66, top: 3.36, halfWidth: 0.76, rake: 0.08 }),
  );
  for (const s of [-1, 1]) {
    headlights.push(workLight(kit, root, 0.06, 3.35, s * 0.6));
    mirror(kit, root, 0.05, 2.5, s * 0.78, s, 0.22);
  }
  beacons.push(beacon(kit, root, -1.1, 3.41, 0.5));

  // Front frame with loader tower.
  frontFrame.add(
    mesh(
      extrude(
        [
          [0.0, 0.62],
          [2.2, 0.62],
          [2.32, 1.02],
          [1.2, 1.38],
          [0.86, 2.36],
          [0.34, 2.36],
          [0.05, 1.3],
        ],
        0.86,
        0.08,
        0.03,
      ),
      kit.paint,
    ),
  );
  frontFrame.add(cylinder(0.1, 0.5, kit.dark, 'y', -0.02, 1.0, 0, 14));
  for (const s of [-1, 1]) headlights.push(headlight(kit, frontFrame, 0.9, 2.2, s * 0.46, 0.08));

  const arms = new THREE.Group();
  arms.position.set(0.62, 2.22, 0);
  frontFrame.add(arms);
  const armLine: [number, number][] = [
    [0, 0],
    [1.35, -0.32],
    [2.62, -1.72],
  ];
  for (const s of [-1, 1]) {
    arms.add(
      mesh(extrude(beamOutline(armLine, [0.16, 0.2, 0.13]), 0.14, 0.07), kit.paint, 0, 0, s * 0.58),
    );
    arms.add(cylinder(0.09, 0.2, kit.dark, 'z', 0, 0, s * 0.58, 14));
  }
  arms.add(cylinder(0.11, 1.3, kit.paint, 'z', 1.45, -0.42, 0, 16));
  const bucket = new THREE.Group();
  bucket.position.set(2.62, -1.72, 0);
  arms.add(bucket);
  const bw = 3.0;
  bucket.add(
    mesh(
      extrude(
        beamOutline(
          [
            [0.02, 1.0],
            [-0.1, 0.38],
            [0.04, -0.2],
            [0.46, -0.46],
            [1.28, -0.48],
          ],
          [0.03],
        ),
        bw,
        0.03,
        0.01,
      ),
      kit.paint,
    ),
  );
  for (const s of [-1, 1]) {
    bucket.add(
      mesh(
        extrude(
          [
            [0.0, 1.05],
            [0.36, 1.03],
            [1.34, -0.4],
            [1.3, -0.51],
            [0.44, -0.51],
            [-0.02, -0.26],
            [-0.14, 0.36],
          ],
          0.045,
          0.05,
          0.01,
        ),
        kit.paint,
        0,
        0,
        s * (bw / 2),
      ),
    );
    bucket.add(
      mesh(
        extrude(
          [
            [-0.16, -0.06],
            [0.1, -0.12],
            [0.12, 0.98],
            [-0.14, 0.9],
          ],
          0.06,
          0.04,
        ),
        kit.paint,
        0,
        0,
        s * 0.58,
      ),
    );
  }
  bucket.add(rbox(0.08, 0.08, bw + 0.06, kit.paint, 0.1, 1.02, 0, 0.03));
  bucket.add(rbox(0.2, 0.04, bw, kit.wear, 1.28, -0.5, 0, 0.012));
  for (let i = 0; i < 9; i++) {
    const tooth = mesh(
      extrude(
        [
          [-0.05, -0.04],
          [0.16, -0.01],
          [0.18, 0.005],
          [-0.05, 0.04],
        ],
        0.08,
        0.012,
        0.006,
      ),
      kit.wear,
      1.34,
      -0.5,
      (i - 4) * 0.34,
    );
    bucket.add(tooth);
  }
  const bucketEdge = pin(bucket, 1.4, -0.5);
  // Z-bar tilt linkage: lever on the cross tube, ram behind, link to the bucket.
  const lever = new THREE.Group();
  lever.position.set(1.45, -0.42, 0);
  arms.add(lever);
  lever.add(
    mesh(
      extrude(
        [
          [-0.1, 0.62],
          [0.1, 0.62],
          [0.12, -0.5],
          [-0.08, -0.52],
        ],
        0.16,
        0.06,
      ),
      kit.paint,
    ),
  );
  const leverTop = pin(lever, 0, 0.56);
  const leverBottom = pin(lever, 0.02, -0.46);
  updatables.push(ram(kit, pin(frontFrame, 1.05, 1.36), leverTop, 0.1, { barrel: 0.6 }));
  updatables.push(link(leverBottom, pin(bucket, -0.04, 0.8), 0.06, kit.paint, 8));
  for (const s of [-1, 1]) {
    updatables.push(
      ram(kit, pin(frontFrame, 0.95, 0.95, s * 0.46), pin(arms, 1.28, -0.5, s * 0.46), 0.09),
    );
  }

  const model = finishModel(root, kit, cache, {
    length: 8.4,
    height: 3.45,
    headlights,
    beacons,
    rollers,
    updatables,
    onSteer(angle) {
      frontFrame.rotation.y = angle * 0.8;
    },
  });
  const result: WheelLoaderModel = {
    ...model,
    pivots: { frontFrame, arms, bucket },
    bucketEdge,
    setLoader(lift, tilt) {
      arms.rotation.z = lift * 1.15;
      bucket.rotation.z = tilt - lift * 1.15;
      lever.rotation.z = -tilt * 0.9;
    },
  };
  result.setLoader(0.12, 0.4);
  result.update();
  return result;
}

// ---------------------------------------------------------------------------
// 6x4 dump truck (самосвал), cab-over
// ---------------------------------------------------------------------------

export interface DumpTruckModel extends MachineModel {
  pivots: { body: THREE.Object3D; load: THREE.Object3D };
  tailPoint: THREE.Object3D;
  /** Body tip angle 0…1 (1 ≈ 50°) and how full the body is, 0…1. */
  setTip(t: number, load: number): void;
}

export function buildDumpTruck(
  kit: MachineMaterials = createMachineMaterials({ paint: 0xe0620f, rim: 0x5d6168 }),
): DumpTruckModel {
  const root = new THREE.Group();
  const cache: GeometryCache = new Map();
  const updatables: Updatable[] = [];
  const beacons: THREE.Object3D[] = [];
  const R = 0.55;
  const front = 2.6;
  const rollers: Roller[] = [];
  const steerPivots: THREE.Object3D[] = [];
  const single: WheelSpec = { radius: R, width: 0.32, rim: 0.28, tread: 'road', holes: true };
  const dual: WheelSpec = { ...single, dual: true };
  for (const x of [front, -0.55, -1.9]) {
    for (const s of [-1, 1]) {
      const isFront = x === front;
      const w = wheel(kit, cache, isFront ? single : dual, s);
      if (isFront) {
        const pivot = new THREE.Group();
        pivot.position.set(x, R, s * 0.98);
        pivot.add(w);
        root.add(pivot);
        steerPivots.push(pivot);
      } else {
        w.position.set(x, R, s * 0.8);
        root.add(w);
      }
      rollers.push({ object: w, radius: R });
    }
    root.add(cylinder(0.08, 1.6, kit.dark, 'z', x, R, 0, 12));
  }
  for (const s of [-1, 1]) {
    // Leaf springs of the rear bogie, mud flaps, side guards.
    root.add(rbox(1.5, 0.12, 0.1, kit.dark, -1.22, 0.78, s * 0.52, 0.02));
    root.add(rbox(0.03, 0.5, 0.62, kit.rubber, -2.55, 0.52, s * 0.82, 0.01));
    root.add(rbox(1.3, 0.05, 0.05, kit.dark, 1.3, 0.55, s * 1.12));
    root.add(rbox(1.3, 0.05, 0.05, kit.dark, 1.3, 0.8, s * 1.12));
  }
  for (const s of [-1, 1]) root.add(rbox(6.7, 0.28, 0.1, kit.dark, 0.25, 0.95, s * 0.45, 0.02));
  for (const x of [-2.7, -1.2, 0.5, 2.0]) root.add(rbox(0.1, 0.2, 0.9, kit.dark, x, 0.95, 0));
  // Fuel tank, battery box, air tanks.
  root.add(cylinder(0.3, 1.0, kit.steel, 'x', 1.3, 0.88, -1.0, 22));
  root.add(rbox(0.7, 0.5, 0.36, kit.dark, 1.2, 0.85, 1.0));
  root.add(cylinder(0.12, 0.8, kit.steel, 'x', 0.3, 0.72, 0.8, 14));
  // Rear bumper and lamps.
  root.add(mesh(new THREE.BoxGeometry(0.12, 0.18, 2.3), kit.hazard, -2.88, 0.7, 0));
  for (const s of [-1, 1]) root.add(rbox(0.05, 0.12, 0.28, kit.tail, -2.95, 0.88, s * 0.9, 0.01));

  const cab = truckCab(kit);
  cab.group.position.x = front;
  root.add(cab.group);
  const headlights = cab.lamps;
  beacons.push(beacon(kit, cab.group, -0.25, 2.99, -0.85));
  // Air intake and exhaust behind the cab.
  root.add(cylinder(0.11, 1.9, kit.dark, 'y', front - 0.68, 2.1, 0.95, 16));
  root.add(cylinder(0.14, 0.2, kit.dark, 'y', front - 0.68, 3.1, 0.95, 16));
  root.add(cylinder(0.07, 2.0, kit.dark, 'y', front - 0.68, 2.1, -0.9, 12));
  root.add(rbox(4.9, 0.16, 1.0, kit.dark, -0.45, 1.16, 0, 0.02));

  // Tipping body.
  const body = new THREE.Group();
  body.position.set(-2.85, 1.24, 0);
  root.add(body);
  const bodyLength = 4.75;
  const hw = 1.22;
  const h = 1.15;
  const t = 0.05;
  const section = roundedShape(
    [
      [-hw, h, 0],
      [-hw, 0.1, 0.4],
      [-hw + 0.3, 0, 0.2],
      [hw - 0.3, 0, 0.2],
      [hw, 0.1, 0.4],
      [hw, h, 0],
      [hw - t, h, 0],
      [hw - t, 0.12, 0.35],
      [hw - 0.3, t, 0.18],
      [-hw + 0.3, t, 0.18],
      [-hw + t, 0.12, 0.35],
      [-hw + t, h, 0],
    ],
    0.05,
  );
  const shell = new THREE.ExtrudeGeometry(section, {
    depth: bodyLength,
    bevelEnabled: false,
    curveSegments: 6,
  });
  shell.rotateY(-Math.PI / 2);
  shell.translate(bodyLength, 0, 0);
  const shellGeometry = toCreasedNormals(shell, 0.6);
  shell.dispose();
  body.add(mesh(shellGeometry, kit.paint));
  // Headboard with a short visor over the cab.
  body.add(
    rbox(0.08, h + 0.08, hw * 2 + 0.04, kit.paint, bodyLength - 0.02, h / 2 + 0.02, 0, 0.03),
  );
  const visor = rbox(0.55, 0.06, hw * 2, kit.paint, bodyLength + 0.24, h + 0.08, 0, 0.02);
  visor.rotation.z = 0.08;
  body.add(visor);
  // Top rails, side ribs, under-frame.
  for (const s of [-1, 1]) {
    body.add(
      rbox(bodyLength, 0.1, 0.1, kit.paint, bodyLength / 2, h - 0.03, s * (hw + 0.02), 0.03),
    );
    for (let i = 0; i < 6; i++) {
      body.add(
        rbox(0.07, h - 0.3, 0.06, kit.paint, 0.35 + i * 0.82, h / 2 + 0.05, s * (hw + 0.02), 0.02),
      );
    }
    body.add(rbox(bodyLength, 0.18, 0.12, kit.dark, bodyLength / 2, -0.06, s * 0.45, 0.02));
  }
  body.add(rbox(0.1, 0.12, hw * 2, kit.paint, 0.02, 0.05, 0, 0.03));
  for (const s of [-1, 1]) body.add(cylinder(0.07, 0.2, kit.dark, 'z', 0.02, -0.06, s * 0.45, 12));
  // Load of soil.
  const load = new THREE.Group();
  load.position.set(bodyLength * 0.55, 0.05, 0);
  body.add(load);
  const heap = mesh(createSoilHeapGeometry(5), kit.soil);
  heap.scale.set(2.2, 0.9, 1.1);
  load.add(heap);
  const tailPoint = pin(body, -0.1, 0.2);
  updatables.push(
    ram(kit, pin(root, front - 0.55, 0.72), pin(body, bodyLength + 0.1, 0.75), 0.13, {
      stages: 4,
      barrel: 0.95,
      material: kit.dark,
    }),
  );

  const model = finishModel(root, kit, cache, {
    length: 7.6,
    height: 3.1,
    headlights,
    beacons,
    rollers,
    updatables,
    steerPivots,
  });
  const result: DumpTruckModel = {
    ...model,
    pivots: { body, load },
    tailPoint,
    setTip(tip, amount) {
      body.rotation.z = Math.min(1, Math.max(0, tip)) * 0.88;
      const k = Math.max(0.001, amount);
      load.visible = amount > 0.02;
      load.scale.set(0.6 + 0.4 * k, k, 0.9 + 0.1 * k);
      load.position.x = bodyLength * (0.55 - 0.25 * (1 - k) * Math.min(1, tip * 2));
    },
  };
  result.setTip(0, 1);
  result.update();
  return result;
}

// ---------------------------------------------------------------------------
// Crawler dozer (бульдозер), D6-class with elevated sprockets
// ---------------------------------------------------------------------------

export interface BulldozerModel extends MachineModel {
  pivots: { blade: THREE.Object3D; ripper: THREE.Object3D };
  bladeEdge: THREE.Object3D;
  /** Blade height (m, + = raised) and ripper 0 = up, 1 = in the ground. */
  setBlade(lift: number): void;
  setRipper(t: number): void;
}

/** Belt around circles (x, y, r): convex hull of the outlines, resampled. */
function trackPath(circles: [number, number, number][]) {
  const points: [number, number][] = [];
  for (const [cx, cy, r] of circles) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  // Counter-clockwise loop.
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  const lengths = [0];
  for (let i = 1; i <= hull.length; i++) {
    const a = hull[i - 1]!;
    const b = hull[i % hull.length]!;
    lengths.push(lengths[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[lengths.length - 1]!;
  return {
    total,
    at(s: number) {
      const d = ((s % total) + total) % total;
      let i = 1;
      while (i < lengths.length - 1 && lengths[i]! < d) i++;
      const a = hull[i - 1]!;
      const b = hull[i % hull.length]!;
      const seg = lengths[i]! - lengths[i - 1]! || 1;
      const k = (d - lengths[i - 1]!) / seg;
      return {
        x: lerp(a[0], b[0], k),
        y: lerp(a[1], b[1], k),
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      };
    },
  };
}

export function buildBulldozer(kit: MachineMaterials = createMachineMaterials()): BulldozerModel {
  const root = new THREE.Group();
  const cache: GeometryCache = new Map();
  const updatables: Updatable[] = [];
  const headlights: THREE.Object3D[] = [];
  const beacons: THREE.Object3D[] = [];
  const rollers: Roller[] = [];
  const gauge = 1.0;
  const shoeWidth = 0.56;
  const idlerR = 0.36;
  const sprocketR = 0.42;
  const circles: [number, number, number][] = [
    [1.42, 0.4, idlerR],
    [-1.3, 0.4, idlerR],
    [-1.02, 1.22, sprocketR],
  ];
  const path = trackPath(circles);
  const pitch = 0.2;
  const count = Math.floor(path.total / pitch);
  const spacing = path.total / count;
  const shoeGeometry = merge([
    new THREE.BoxGeometry(spacing * 0.92, 0.035, shoeWidth),
    (() => {
      const g = new THREE.BoxGeometry(0.03, 0.05, shoeWidth);
      g.translate(0, 0.04, 0);
      return g;
    })(),
    (() => {
      const g = new THREE.BoxGeometry(spacing * 0.7, 0.05, 0.1);
      g.translate(0, -0.04, shoeWidth * 0.28);
      return g;
    })(),
    (() => {
      const g = new THREE.BoxGeometry(spacing * 0.7, 0.05, 0.1);
      g.translate(0, -0.04, -shoeWidth * 0.28);
      return g;
    })(),
  ]);
  cache.set('shoe', shoeGeometry);
  const shoes: { mesh: THREE.Mesh; index: number }[] = [];
  for (const s of [-1, 1]) {
    const side = new THREE.Group();
    side.position.z = s * gauge;
    root.add(side);
    for (let i = 0; i < count; i++) {
      const shoe = mesh(shoeGeometry, kit.dark);
      side.add(shoe);
      shoes.push({ mesh: shoe, index: i });
    }
    // Idlers, rollers, sprocket and the roller frame.
    for (const [x, y, r] of circles.slice(0, 2)) {
      const idler = new THREE.Group();
      idler.position.set(x, y, 0);
      idler.add(cylinder(r - 0.06, 0.34, kit.dark, 'z', 0, 0, 0, 28));
      idler.add(cylinder(r * 0.45, 0.4, kit.steel, 'z', 0, 0, 0, 16));
      side.add(idler);
      rollers.push({ object: idler, radius: r });
    }
    for (let i = 0; i < 6; i++) {
      const roller = cylinder(0.12, 0.34, kit.dark, 'z', -0.85 + i * 0.36, 0.2, 0, 16);
      const g = new THREE.Group();
      g.add(roller);
      side.add(g);
    }
    side.add(rbox(2.5, 0.34, 0.3, kit.dark, 0.08, 0.5, 0, 0.04));
    side.add(rbox(2.2, 0.04, 0.34, kit.dark, 0.1, 0.72, 0, 0.01));
    const sprocket = new THREE.Group();
    sprocket.position.set(circles[2]![0], circles[2]![1], 0);
    sprocket.add(cylinder(sprocketR - 0.05, 0.22, kit.dark, 'z', 0, 0, 0, 30));
    for (let i = 0; i < 12; i++) {
      const tooth = mesh(new THREE.BoxGeometry(0.08, 0.1, 0.2), kit.wear);
      const a = (i / 12) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * (sprocketR - 0.02), Math.sin(a) * (sprocketR - 0.02), 0);
      tooth.rotation.z = a;
      sprocket.add(tooth);
    }
    sprocket.add(cylinder(0.2, 0.3, kit.steel, 'z', 0, 0, s * 0.05, 18));
    side.add(sprocket);
    rollers.push({ object: sprocket, radius: sprocketR });
  }
  let travelled = 0;
  function placeShoes() {
    for (const { mesh: shoe, index } of shoes) {
      // Counter-clockwise path: shoes run clockwise as the machine drives forward.
      const p = path.at(index * spacing - travelled);
      shoe.position.set(p.x, p.y, 0);
      shoe.rotation.z = p.angle + Math.PI;
    }
  }
  placeShoes();

  // Main frame, fenders, hood, radiator guard.
  root.add(rbox(3.2, 0.7, 1.3, kit.dark, 0.1, 0.9, 0, 0.05));
  for (const s of [-1, 1]) {
    root.add(pane([-0.55, 1.58], [1.62, 0.96], 0.62, kit.paint, s * gauge, 0.05));
  }
  root.add(
    mesh(
      extrude(
        [
          [-0.1, 1.05],
          [1.86, 1.05],
          [1.92, 1.18],
          [1.92, 1.9],
          [1.8, 2.0, 0.1],
          [-0.1, 2.06],
        ],
        1.3,
        0.08,
        0.03,
      ),
      kit.paint,
    ),
  );
  root.add(rbox(0.06, 0.8, 1.1, kit.dark, 1.94, 1.5, 0, 0.02));
  for (let i = 0; i < 8; i++) root.add(rbox(0.02, 0.03, 1.06, kit.steel, 1.975, 1.16 + i * 0.1, 0));
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1])
      root.add(rbox(0.22, 0.025, 0.01, kit.dark, 0.3 + i * 0.25, 1.62, s * 0.652, 0.005));
  }
  root.add(cylinder(0.07, 0.75, kit.dark, 'y', 1.2, 2.4, 0.32, 12));
  root.add(cylinder(0.08, 0.1, kit.chrome, 'y', 1.2, 2.78, 0.32, 12));
  root.add(cylinder(0.09, 0.35, kit.dark, 'y', 0.9, 2.2, -0.3, 14));
  root.add(cylinder(0.13, 0.12, kit.dark, 'y', 0.9, 2.4, -0.3, 16));
  for (const s of [-1, 1]) headlights.push(headlight(kit, root, 1.92, 2.04, s * 0.42, 0.07));
  // Cab and rear fuel tank.
  root.add(rbox(1.5, 0.45, 1.36, kit.paint, -0.72, 1.62, 0, 0.05));
  root.add(
    ropsCab(kit, {
      rear: -1.45,
      front: -0.05,
      floor: 1.82,
      top: 3.18,
      halfWidth: 0.76,
      rake: 0.06,
    }),
  );
  for (const s of [-1, 1]) {
    headlights.push(workLight(kit, root, -0.08, 3.17, s * 0.6));
    workLight(kit, root, -1.48, 3.17, s * 0.6, Math.PI);
  }
  beacons.push(beacon(kit, root, -1.2, 3.23, 0.5));
  root.add(rbox(0.5, 0.75, 1.6, kit.paint, -1.72, 1.55, 0, 0.08));
  for (const s of [-1, 1]) root.add(rbox(0.04, 0.12, 0.16, kit.tail, -1.98, 1.75, s * 0.6));

  // Blade on push arms, lifted by two rams from the radiator guard.
  const bladeArm = new THREE.Group();
  bladeArm.position.set(0.25, 0.48, 0);
  root.add(bladeArm);
  for (const s of [-1, 1]) {
    bladeArm.add(
      mesh(
        extrude(
          beamOutline(
            [
              [0, 0],
              [1.4, 0.02],
              [2.18, 0.08],
            ],
            [0.09, 0.11, 0.12],
          ),
          0.14,
          0.05,
        ),
        kit.paint,
        0,
        0,
        s * 1.38,
      ),
    );
    bladeArm.add(cylinder(0.1, 0.2, kit.dark, 'z', 0, 0, s * 1.38, 14));
  }
  const blade = new THREE.Group();
  blade.position.set(2.25, -0.4, 0);
  bladeArm.add(blade);
  const bladeWidth = 3.3;
  blade.add(
    mesh(
      extrude(
        beamOutline(
          [
            [0.18, 0.02],
            [0.02, 0.3],
            [-0.04, 0.7],
            [0.02, 1.08],
            [0.2, 1.32],
          ],
          [0.04],
        ),
        bladeWidth,
        0.04,
        0.01,
      ),
      kit.paint,
    ),
  );
  for (let i = 0; i < 5; i++) {
    blade.add(
      mesh(
        extrude(
          [
            [-0.02, 0.1],
            [-0.3, 0.2],
            [-0.3, 1.1],
            [0.02, 1.2],
          ],
          0.05,
          0.03,
        ),
        kit.paint,
        0,
        0,
        (i - 2) * 0.72,
      ),
    );
  }
  blade.add(rbox(0.12, 0.2, bladeWidth - 0.2, kit.paint, -0.3, 0.6, 0, 0.03));
  for (const s of [-1, 1]) {
    blade.add(
      mesh(
        extrude(
          [
            [0.2, 0.0],
            [0.02, 0.3],
            [-0.04, 0.7],
            [0.02, 1.08],
            [0.2, 1.32],
            [0.42, 1.12],
            [0.44, 0.04],
          ],
          0.05,
          0.04,
        ),
        kit.paint,
        0,
        0,
        s * (bladeWidth / 2),
      ),
    );
  }
  blade.add(rbox(0.1, 0.12, bladeWidth, kit.wear, 0.2, 0.03, 0, 0.015));
  const bladeEdge = pin(blade, 0.3, 0.05);
  for (const s of [-1, 1]) {
    updatables.push(
      ram(kit, pin(root, 1.85, 1.85, s * 0.72), pin(blade, -0.28, 1.12, s * 0.72), 0.085, {
        barrel: 0.6,
      }),
    );
  }
  updatables.push(
    link(pin(bladeArm, 1.2, 0.05, 1.38), pin(blade, -0.3, 1.0, 0.9), 0.05, kit.paint),
  );

  // Ripper at the back.
  const ripper = new THREE.Group();
  ripper.position.set(-1.95, 0.85, 0);
  root.add(ripper);
  ripper.add(rbox(0.9, 0.2, 0.5, kit.dark, -0.45, 0, 0, 0.04));
  ripper.add(
    mesh(
      extrude(
        beamOutline(
          [
            [-0.85, 0.25],
            [-0.9, -0.3],
            [-0.82, -0.75],
            [-0.62, -0.98],
          ],
          [0.08, 0.08, 0.06, 0.03],
        ),
        0.1,
        0.03,
      ),
      kit.dark,
    ),
  );
  ripper.add(rbox(0.16, 0.08, 0.12, kit.wear, -0.6, -0.98, 0, 0.02));
  updatables.push(ram(kit, pin(root, -1.9, 1.45), pin(ripper, -0.7, 0.12), 0.07));

  const model = finishModel(root, kit, cache, {
    length: 6.3,
    height: 3.25,
    headlights,
    beacons,
    rollers,
    updatables,
    onRoll(distance) {
      travelled += distance;
      placeShoes();
    },
  });
  const result: BulldozerModel = {
    ...model,
    pivots: { blade: bladeArm, ripper },
    bladeEdge,
    setBlade(lift) {
      bladeArm.rotation.z = Math.asin(Math.max(-0.12, Math.min(0.5, lift / 2.25)));
      blade.rotation.z = -bladeArm.rotation.z;
    },
    setRipper(t) {
      ripper.rotation.z = 0.35 - Math.min(1, Math.max(0, t)) * 0.55;
    },
  };
  result.setBlade(0.25);
  result.setRipper(0);
  result.update();
  return result;
}
