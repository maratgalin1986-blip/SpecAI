// The home-page 3D city of ИИСтройка24 (owner, 2026-10-28: «Верни 3D-мир,
// усовершенствуй и подстрой под мой проект»; 2026-11-10: «поправь графику тоже
// … кругом должно быть шоу и эффекты»). A stylised district at dusk with a
// construction site in the middle; machines «на линии» drive the ring road or
// work on the site. Decorative: no real positions, no personal data.
//
// Loaded only when the block scrolls into view (dynamic import), so three.js
// never weighs on the first paint. Machines and the Rig come from the
// 2026-10-06 /stroyka world (machines.ts, kit.ts, people.ts); the look and the
// show are in effects.ts; where everything stands is in layout.ts (checked by
// layout.test.ts); the guided walk and its four shots are in walk.ts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SITE } from '@/lib/site';
import { createMaterials, Debris, node, Rig } from './kit';
import { makeAgp, makeBackhoe, makeCrane, makeDumpTruck, palletBuilder } from './machines';
import {
  animatePerson,
  lookFor,
  makePerson,
  peopleMaterials,
  resetPeopleMaterials,
  setDetail,
  type Person,
} from './people';
import {
  asphaltTextures,
  blobShadow,
  blobTexture,
  dirtTexture,
  fenceTexture,
  glowTexture,
  installFilmGrade,
  lightWindows,
  makeBeam,
  makeGrassMaterial,
  makeLightPool,
  PulseRings,
  resetBlobTexture,
  skyMaterial,
  Smoke,
  Sparks,
  Sprites,
} from './effects';
import {
  LITE_FRAME_MS,
  SLOW_FRAME_MS,
  WATCH_WINDOW_MS,
  worldPixelRatio,
  type WorldKind,
} from './kinds';
import {
  AGP_AT,
  AGP_TURRET_YAW,
  BACKHOE_AT,
  BACKHOE_SWING,
  CABIN,
  CRANE_AT,
  CRANE_SLEW,
  craneYaw,
  CREW,
  FRAME,
  FRAME_TOP,
  LOAD_TRUCK_AT,
  PALLETS,
  PIT,
  SITE as YARD,
  SLAB,
  SLAB_DROP,
  SLAB_STACK,
  TOWERS,
  declutter,
} from './layout';
import {
  blendPose,
  flightProgress,
  stopFov,
  stopKey,
  stopLift,
  stopPose,
  WALK_FLIGHT_MS,
  WALK_MAX_YAW,
  WALK_STOPS,
  type CameraPose,
  type Vec3,
} from './walk';

export interface WorldOptions {
  canvas: HTMLCanvasElement;
  phone: boolean;
  /** One rendered frame, no motion (prefers-reduced-motion). */
  still: boolean;
  /** The «на линии» tags over the machines (default: shown). The stop pictures are rendered without. */
  labels?: boolean;
  /** A fixed pixel ratio (for rendering the pictures at full size); else from the device. */
  pixelRatio?: number;
  /** The moment of the working cycles the scene starts at, seconds (for rendering the pictures). */
  clock?: number;
  onPick(kind: WorldKind): void;
  /** The camera of the walk reached the stop `index`. */
  onArrive?(index: number): void;
  /** The device cannot keep up: the caller shows the poster instead. */
  onSlow(): void;
}

export interface WorldHandle {
  setActive(active: boolean): void;
  focus(kind: WorldKind): void;
  /** Starts the guided walk at a stop: the camera flies there from where it is. */
  walkStart(index: number): void;
  /** The walk goes on to another stop. */
  walkTo(index: number): void;
  walkEnd(): void;
  dispose(): void;
}

// Ring road: a rounded rectangle around the site.
const RING = { hx: 26, hz: 21, r: 6 };
const ROAD_W = 3.6;

/** A point and heading on the ring road at distance s (metres along it). */
export function ringPoint(s: number) {
  const { hx, hz, r } = RING;
  const sx = 2 * (hx - r);
  const sz = 2 * (hz - r);
  const arc = (Math.PI / 2) * r;
  const total = 2 * sx + 2 * sz + 4 * arc;
  let d = ((s % total) + total) % total;
  // Segments counter-clockwise from the bottom-left corner end.
  const segs: [number, (t: number) => [number, number, number]][] = [
    [sx, (t) => [-hx + r + t, hz, 0]],
    [arc, (t) => corner(hx - r, hz - r, Math.PI / 2 - t / r)],
    [sz, (t) => [hx, hz - r - t, -Math.PI / 2]],
    [arc, (t) => corner(hx - r, -hz + r, -t / r)],
    [sx, (t) => [hx - r - t, -hz, Math.PI]],
    [arc, (t) => corner(-hx + r, -hz + r, -Math.PI / 2 - t / r)],
    [sz, (t) => [-hx, -hz + r + t, Math.PI / 2]],
    [arc, (t) => corner(-hx + r, hz - r, Math.PI - t / r)],
  ];
  function corner(cx: number, cz: number, a: number): [number, number, number] {
    // a: angle of the radius in XZ (z down = +); heading is the tangent.
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r, a - Math.PI / 2];
  }
  for (const [len, at] of segs) {
    if (d <= len) {
      const [x, z, dir] = at(d);
      return { x, z, yaw: -dir, total };
    }
    d -= len;
  }
  return { x: -hx + r, z: hz, yaw: 0, total };
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** The banner of the site: the platform in bold, whose it is, a gradient, a dark edge. */
function brandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 2048, 512);
  g.addColorStop(0, '#fbbf24');
  g.addColorStop(0.55, '#f59e0b');
  g.addColorStop(1, '#ea580c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2048, 512);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, 2048, 30);
  ctx.fillStyle = 'rgba(15,23,42,0.9)';
  ctx.fillRect(0, 470, 2048, 42);
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 250px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SITE.platform, 1024, 196, 1940);
  ctx.font = 'bold 92px Arial, sans-serif';
  ctx.fillText(`от ${SITE.name} · спецтехника по всей России`, 1024, 388, 1900);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const LABELS: Record<WorldKind, string> = {
  excavator: 'Экскаватор',
  crane: 'Автокран',
  agp: 'Автовышка',
  dump: 'Самосвал',
};

/** A rounded-rectangle ring (outer minus inner) lying flat, for kerbs and road markings. */
function ringShape(outer: number, inner: number) {
  const { hx, hz, r } = RING;
  const trace = (s: THREE.Path, ex: number, ez: number, rad: number) => {
    s.moveTo(-ex + rad, -ez);
    s.lineTo(ex - rad, -ez);
    s.absarc(ex - rad, -ez + rad, rad, -Math.PI / 2, 0, false);
    s.lineTo(ex, ez - rad);
    s.absarc(ex - rad, ez - rad, rad, 0, Math.PI / 2, false);
    s.lineTo(-ex + rad, ez);
    s.absarc(-ex + rad, ez - rad, rad, Math.PI / 2, Math.PI, false);
    s.lineTo(-ex, -ez + rad);
    s.absarc(-ex + rad, -ez + rad, rad, Math.PI, Math.PI * 1.5, false);
  };
  const shape = new THREE.Shape();
  trace(shape, hx + outer, hz + outer, r + outer);
  const hole = new THREE.Path();
  trace(hole, hx + inner, hz + inner, Math.max(0.5, r + inner));
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape, 24);
}

/**
 * Everything on the site that never moves, merged into one mesh per material:
 * the frame with its columns, walls and rails, the fence, the slab stack. Plain
 * boxes (12 triangles each): the detail comes from how many there are.
 */
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, geo: THREE.BufferGeometry) {
    const list = this.parts.get(mat);
    if (list) list.push(geo);
    else this.parts.set(mat, [geo]);
  }
  /** A box of size w×h×d centred at x, y, z, turned by `ry`; `tile` repeats its texture along the long side. */
  box(mat: THREE.Material, size: Vec3, pos: Vec3, ry = 0, tile = 0) {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    if (tile > 0) {
      const uv = geo.attributes.uv!;
      const k = Math.max(size[0], size[2]) / tile;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * k);
    }
    if (ry) geo.rotateY(ry);
    geo.translate(pos[0], pos[1], pos[2]);
    this.add(mat, geo);
  }
  build(parent: THREE.Object3D, cast: boolean, receive: (mat: THREE.Material) => boolean) {
    for (const [mat, list] of this.parts) {
      const merged = list.length === 1 ? list[0]! : mergeGeometries(list, false);
      if (!merged) continue;
      list.forEach((g) => g !== merged && g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive(mat);
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    this.parts.clear();
  }
}

/**
 * The «на линии» tag over a machine. It keeps its size on the screen whatever
 * the distance, so it reads on a phone: there the tag is the name alone, on a
 * wide screen the name and what the machine is doing.
 */
function labelTexture(text: string, sub: string | null) {
  const canvas = document.createElement('canvas');
  canvas.width = sub ? 1024 : 800;
  canvas.height = 256;
  const w = canvas.width;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(15,23,42,0.94)';
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, 192, 96);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(251,191,36,0.95)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(15,23,42,0.94)';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 40, 198);
  ctx.lineTo(w / 2 + 40, 198);
  ctx.lineTo(w / 2, 248);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(108, 104, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.textBaseline = 'middle';
  if (sub) {
    ctx.font = 'bold 78px Arial, sans-serif';
    ctx.fillText(text, 172, 78, w - 230);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 54px Arial, sans-serif';
    ctx.fillText(sub, 172, 152, w - 230);
  } else {
    ctx.font = 'bold 100px Arial, sans-serif';
    ctx.fillText(text, 168, 110, w - 220);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createWorld(opts: WorldOptions): WorldHandle {
  const { canvas, phone, still } = opts;
  const withLabels = opts.labels !== false;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(opts.pixelRatio ?? worldPixelRatio(window.devicePixelRatio, phone));
  installFilmGrade(renderer);
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = !phone;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xe9b78c);

  const disposables: { dispose(): void }[] = [];
  const scene = new THREE.Scene();
  // Evening haze: the far city melts into the sky. A walk shot stands close to
  // its machine, so the haze is pulled in and everything behind falls back.
  const FOG = { near: 55, far: 190, walkNear: 20, walkFar: 125 };
  const fog = new THREE.Fog(0xe2b690, FOG.near, FOG.far);
  scene.fog = fog;

  // ----- evening sky: a dome around the camera, and the same sky as the light
  // that falls on every surface (no environment file, no RoomEnvironment).
  const sunDir = new THREE.Vector3(-0.62, 0.5, 0.45).normalize();
  const skyMat = skyMaterial(sunDir);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);
  disposables.push(dome.geometry, skyMat);
  {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat);
    envScene.add(envSky);
    const env = pmrem.fromScene(envScene, 0.02).texture;
    envSky.geometry.dispose();
    scene.environment = env;
    pmrem.dispose();
    disposables.push(env);
  }

  // The light of the whole city, and what is left of it while a walk shot is
  // on: the stop's machine gets its own key light, the rest steps back.
  const LIGHT = { sun: 2.5, hemi: 0.55, env: 0.55, walkSun: 2.1, walkHemi: 0.36, walkEnv: 0.4 };
  const KEY_POWER = 1.7;
  scene.environmentIntensity = LIGHT.env;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 420);
  const hemi = new THREE.HemisphereLight(0x9bb4dc, 0x6b4f34, LIGHT.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffbe84, LIGHT.sun);
  sun.position.copy(sunDir).multiplyScalar(80);
  if (!phone) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = c.bottom = -36;
    c.right = c.top = 36;
    c.near = 10;
    c.far = 170;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
  }
  scene.add(sun);
  // The key light of a walk stop. Always in the scene (dark outside the walk),
  // so the shaders are compiled once; it casts no shadow of its own.
  const key = new THREE.SpotLight(0xffe6c4, 0, 0, 0.5, 0.75, 0);
  key.position.set(0, 12, 0);
  scene.add(key, key.target);

  const M = createMaterials();
  // Contact shadows: soft blobs under everything, on phones (no shadow map) and desktops alike.
  const blobOpacity = phone ? 0.5 : 0.32;

  // ----- ground, roads
  const grassMat = makeGrassMaterial();
  disposables.push(grassMat, grassMat.map!);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  // Wet asphalt: dark, low roughness in patches, so it picks up the evening sky.
  const asp = asphaltTextures();
  asp.map.repeat.set(10, 10);
  asp.rough.repeat.set(10, 10);
  const asphalt = new THREE.MeshStandardMaterial({
    map: asp.map,
    roughnessMap: asp.rough,
    roughness: 0.9,
    metalness: 0.12,
    envMapIntensity: 1.4,
  });
  disposables.push(asphalt, asp.map, asp.rough);
  const road = new THREE.Mesh(ringShape(ROAD_W, -ROAD_W), asphalt);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  road.receiveShadow = true;
  scene.add(road);
  // Kerbs and pavements on both sides, white edge lines on the road.
  const pavement = new THREE.MeshStandardMaterial({ color: 0x9d9a93, roughness: 0.85 });
  const edgeLine = new THREE.MeshBasicMaterial({ color: 0xeceae3 });
  disposables.push(pavement, edgeLine);
  for (const [a, b, mat, y] of [
    [ROAD_W, ROAD_W + 1.8, pavement, 0.07],
    // (outer edge first: the other way round the ring fills the whole site)
    [-ROAD_W, -ROAD_W - 1.8, pavement, 0.07],
    [ROAD_W - 0.25, ROAD_W - 0.45, edgeLine, 0.045],
    [-ROAD_W + 0.45, -ROAD_W + 0.25, edgeLine, 0.045],
  ] as const) {
    const m = new THREE.Mesh(ringShape(a, b), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = mat === pavement;
    scene.add(m);
  }
  // Avenues out of the district: four strips of asphalt in one mesh.
  const avenueDash = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(2.2, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xf5f5f4 }),
    40,
  );
  {
    let i = 0;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const strips: THREE.BufferGeometry[] = [];
    for (const [w, d, x, z] of [
      [8, 140, 0, 92],
      [8, 140, 0, -92],
      [140, 8, 98, 0],
      [140, 8, -98, 0],
    ] as const) {
      strips.push(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, 0.02, z));
      const alongZ = d > w;
      for (let k = 0; k < 10; k++) {
        const along = (k - 4.5) * 12 + (alongZ ? z : x);
        q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, alongZ ? Math.PI / 2 : 0));
        m4.compose(
          new THREE.Vector3(alongZ ? x : along, 0.04, alongZ ? along : z),
          q,
          new THREE.Vector3(1, 1, 1),
        );
        avenueDash.setMatrixAt(i++, m4);
      }
    }
    const avenues = new THREE.Mesh(mergeGeometries(strips, false)!, asphalt);
    strips.forEach((g) => g.dispose());
    avenues.receiveShadow = true;
    scene.add(avenues, avenueDash);
    disposables.push(avenueDash.material as THREE.Material);
  }
  // Dashed centre line on the ring.
  {
    const dash = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.4, 0.18),
      avenueDash.material,
      90,
    );
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const total = ringPoint(0).total;
    for (let i = 0; i < 90; i++) {
      const p = ringPoint((i / 90) * total);
      q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, p.yaw, 'YXZ'));
      m4.compose(new THREE.Vector3(p.x, 0.04, p.z), q, new THREE.Vector3(1, 1, 1));
      dash.setMatrixAt(i, m4);
    }
    scene.add(dash);
  }

  // ----- the district: instanced blocks of flats and offices with lit windows, trees
  const rand = seeded(24);
  const m4 = new THREE.Matrix4();
  {
    const spots: [number, number, number, number, number][] = [];
    for (let gx = -5; gx <= 5; gx++)
      for (let gz = -5; gz <= 5; gz++) {
        const x = gx * 14 + (rand() - 0.5) * 3;
        const z = gz * 14 + (rand() - 0.5) * 3;
        if (Math.abs(x) < 36 && Math.abs(z) < 31) continue;
        if (Math.abs(x) < 9 || Math.abs(z) < 9) continue; // avenues
        const far = Math.hypot(x, z);
        // Low-rise round the camera's orbit, towers as a skyline further out.
        const h = far < 64 ? 5 + rand() * 6 : 10 + rand() * 30;
        spots.push([x, z, 7 + rand() * 3, h, 6 + rand() * 4]);
      }
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = lightWindows(
      new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 }),
      0.42,
    );
    const blocks = new THREE.InstancedMesh(geo, mat, spots.length);
    const palette = [0xe7e2d8, 0xd9dee5, 0xf1d9b5, 0xc9d6df, 0xe8c4a8, 0xdfe6d8];
    spots.forEach(([x, z, w, h, d], i) => {
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
      blocks.setMatrixAt(i, m4);
      blocks.setColorAt(i, new THREE.Color(palette[i % palette.length]!));
    });
    blocks.castShadow = blocks.receiveShadow = !phone;
    scene.add(blocks);
    // A parapet and roof plant on top of each block, and a soft shadow under it.
    const roofs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.6, 1),
      new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 0.9 }),
      spots.length * 2,
    );
    const feet = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: blobTexture(),
        transparent: true,
        opacity: blobOpacity,
        depthWrite: false,
        color: 0x120c08,
      }),
      spots.length,
    );
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    spots.forEach(([x, z, w, h, d], i) => {
      m4.compose(
        new THREE.Vector3(x + w * 0.12, h + 0.6, z - d * 0.1),
        new THREE.Quaternion(),
        new THREE.Vector3(w * 0.36, 1.6, d * 0.36),
      );
      roofs.setMatrixAt(i * 2, m4);
      m4.compose(
        new THREE.Vector3(x, h + 0.12, z),
        new THREE.Quaternion(),
        new THREE.Vector3(w + 0.3, 0.6, d + 0.3),
      );
      roofs.setMatrixAt(i * 2 + 1, m4);
      m4.compose(new THREE.Vector3(x, 0.05, z), flat, new THREE.Vector3(w * 1.9, d * 1.9, 1));
      feet.setMatrixAt(i, m4);
    });
    feet.renderOrder = 1;
    scene.add(roofs, feet);
    disposables.push(mat, roofs.material as THREE.Material, feet.material as THREE.Material);

    const crowns = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.4, 4, 7).translate(0, 3.4, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
      70,
    );
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.16, 0.22, 1.6, 6).translate(0, 0.8, 0),
      new THREE.MeshStandardMaterial({ color: 0x5b4331, roughness: 1 }),
      70,
    );
    const treeFeet = new THREE.InstancedMesh(feet.geometry, feet.material, 70);
    const greens = [0x4d7c3a, 0x5b8a3e, 0x3f6b35, 0x6b8f3c];
    let n = 0;
    while (n < 70) {
      const x = (rand() - 0.5) * 150;
      const z = (rand() - 0.5) * 150;
      const nearRing = Math.abs(x) < RING.hx + 8 && Math.abs(z) < RING.hz + 8;
      const outerOk = Math.abs(x) > 9 && Math.abs(z) > 9;
      const besideRing = nearRing && (Math.abs(x) > RING.hx + 6.5 || Math.abs(z) > RING.hz + 6.5);
      if (!(besideRing && outerOk)) continue;
      const s = 0.7 + rand() * 0.6;
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      crowns.setMatrixAt(n, m4);
      trunks.setMatrixAt(n, m4);
      crowns.setColorAt(n, new THREE.Color(greens[n % greens.length]!));
      m4.compose(new THREE.Vector3(x, 0.05, z), flat, new THREE.Vector3(4.6 * s, 4.6 * s, 1));
      treeFeet.setMatrixAt(n, m4);
      n++;
    }
    crowns.castShadow = trunks.castShadow = !phone;
    treeFeet.renderOrder = 1;
    scene.add(crowns, trunks, treeFeet);
    disposables.push(crowns.material as THREE.Material, trunks.material as THREE.Material);
  }

  // ----- the construction site (where everything stands: layout.ts)
  const site = new THREE.Group();
  scene.add(site);
  const brandMat = new THREE.MeshBasicMaterial({ map: brandTexture() });
  disposables.push(brandMat.map!, brandMat);
  {
    const dirtMap = dirtTexture();
    dirtMap.repeat.set(4, 3);
    const dirtMat = new THREE.MeshStandardMaterial({ map: dirtMap, roughness: 1 });
    const fenceMap = fenceTexture();
    const fenceMat = new THREE.MeshStandardMaterial({
      map: fenceMap,
      roughness: 0.55,
      metalness: 0.35,
    });
    disposables.push(dirtMat, dirtMap, fenceMat, fenceMap);
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(YARD.hx * 2, YARD.hz * 2), dirtMat);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.03;
    dirt.receiveShadow = true;
    site.add(dirt);

    const batch = new Batch();
    // Fence of profiled sheet on posts, all round the site.
    for (const [w, d, x, z] of [
      [YARD.hx * 2, 0.1, 0, YARD.hz],
      [YARD.hx * 2, 0.1, 0, -YARD.hz],
      [0.1, YARD.hz * 2, -YARD.hx, 0],
      [0.1, YARD.hz * 2, YARD.hx, 0],
    ] as const) {
      batch.box(fenceMat, [w, 2, d], [x, 1, z], 0, 2);
      const along = Math.max(w, d);
      for (let k = 0; k <= along / 4; k++) {
        const t = -along / 2 + k * 4;
        batch.box(M.dark, [0.14, 2.2, 0.14], [w > d ? t : x, 1.1, w > d ? z : t]);
      }
    }
    // The building going up: a concrete frame on a footing, columns and slabs.
    const fx = FRAME.x;
    const fz = FRAME.z;
    const hw = FRAME.w / 2;
    const hd = FRAME.d / 2;
    const H = FRAME.floorH;
    batch.box(M.concreteDark, [FRAME.w + 0.8, 0.24, FRAME.d + 0.8], [fx, 0.12, fz]);
    const colX = [-hw + 0.4, -hw / 3 + 0.13, hw / 3 - 0.13, hw - 0.4];
    for (let f = 0; f < FRAME.floors; f++) {
      batch.box(M.concrete, [FRAME.w, 0.3, FRAME.d], [fx, (f + 1) * H, fz]);
      for (const cx of colX)
        for (const cz of [-hd + 0.4, 0, hd - 0.4])
          batch.box(M.concreteDark, [0.42, H - 0.3, 0.42], [fx + cx, f * H + H / 2, fz + cz]);
    }
    // Stair and lift core, a floor higher than the frame.
    batch.box(
      M.concreteDark,
      [2.6, FRAME_TOP + 1.5, 2.4],
      [fx - 4.3, (FRAME_TOP + 1.5) / 2, fz - 1.9],
    );
    // Block walls: the ground floor all round, with window openings on the
    // south face (where the lift works); the second floor is half laid.
    const wall = (x0: number, x1: number, y0: number, y1: number, z: number) =>
      batch.box(M.block, [x1 - x0, y1 - y0, 0.25], [fx + (x0 + x1) / 2, (y0 + y1) / 2, fz + z]);
    for (let b = 0; b < 3; b++) {
      const x0 = colX[b]! + 0.21;
      const x1 = colX[b + 1]! - 0.21;
      wall(x0, x1, 0.24, 1.0, hd - 0.2);
      wall(x0, x1, 2.25, H - 0.15, hd - 0.2);
      wall(x0, x0 + 0.9, 1.0, 2.25, hd - 0.2);
      wall(x1 - 0.9, x1, 1.0, 2.25, hd - 0.2);
      wall(x0, x1, 0.24, H - 0.15, -hd + 0.2);
      if (b > 0) wall(x0, x1, H + 0.15, H + 0.15 + (b === 1 ? 1.1 : 0.55), -hd + 0.2);
    }
    for (const sx of [-1, 1])
      batch.box(
        M.block,
        [0.25, H - 0.39, FRAME.d - 1.2],
        [fx + sx * (hw - 0.2), 0.24 + (H - 0.39) / 2, fz],
      );
    // Guard rail round the top slab: posts and two orange rails.
    for (const [w, d, x, z] of [
      [FRAME.w, 0.05, 0, hd - 0.08],
      [FRAME.w, 0.05, 0, -hd + 0.08],
      [0.05, FRAME.d, -hw + 0.08, 0],
      [0.05, FRAME.d, hw - 0.08, 0],
    ] as const) {
      for (const y of [0.55, 1.05])
        batch.box(M.vest, [w, 0.07, d], [fx + x, FRAME_TOP + y, fz + z]);
      const along = Math.max(w, d);
      const n = Math.round(along / 2.3);
      for (let k = 0; k <= n; k++) {
        const t = -along / 2 + (k * along) / n;
        batch.box(
          M.dark,
          [0.06, 1.1, 0.06],
          [fx + (w > d ? t : x), FRAME_TOP + 0.55, fz + (w > d ? z : t)],
        );
      }
    }
    // The stack of slabs the crane takes from, on timber spacers.
    for (let i = 0; i < 4; i++) {
      batch.box(
        M.concrete,
        [SLAB.length, 0.25, SLAB.width],
        [SLAB_STACK.x, 0.2 + i * 0.27, SLAB_STACK.z],
        SLAB_STACK.yaw,
      );
    }
    // Posts of the banners and of the searchlights.
    for (const z of [YARD.hz + 0.1, -YARD.hz - 0.1])
      for (const sx of [-5.5, 5.5]) batch.box(M.dark, [0.2, 3, 0.2], [sx, 1.5, z]);
    batch.build(site, !phone, (mat) => mat === M.concrete || mat === M.block);

    // The platform's banners: on the fence towards both streets, and across
    // the top floor of the frame, where the shots of the walk see it.
    const banners: THREE.BufferGeometry[] = [
      new THREE.PlaneGeometry(12, 3).translate(0, 3.2, YARD.hz + 0.2),
      new THREE.PlaneGeometry(12, 3).rotateY(Math.PI).translate(0, 3.2, -YARD.hz - 0.2),
      new THREE.PlaneGeometry(8.6, 2.15).translate(fx + 2.35, 2 * H + 0.15 + 1.32, fz + hd + 0.06),
    ];
    const bannerMesh = new THREE.Mesh(mergeGeometries(banners, false)!, brandMat);
    banners.forEach((g) => g.dispose());
    site.add(bannerMesh);

    const frameShadow = blobShadow(FRAME.w + 5, FRAME.d + 5, blobOpacity);
    frameShadow.position.set(fx, 0.07, fz);
    const stackShadow = blobShadow(9, 5, blobOpacity);
    stackShadow.position.set(SLAB_STACK.x, 0.07, SLAB_STACK.z);
    stackShadow.rotation.z = SLAB_STACK.yaw;
    // The trench the excavator digs: a dark cut in the ground.
    const pit = blobShadow(5.4, 3.6, 0.95);
    (pit.material as THREE.MeshBasicMaterial).color.set(0x1a0f08);
    pit.position.set(PIT.x, 0.08, PIT.z);
    site.add(frameShadow, stackShadow, pit);
  }

  // ----- show: lamp posts, searchlights, smoke, sparks, pulsing rings
  const glowMap = glowTexture();
  disposables.push(glowMap);
  const glows = new Sprites(52, true);
  const smoke = new Smoke(phone ? 36 : 64);
  const sparks = new Sparks(phone ? 14 : 24);
  scene.add(glows.points, smoke.sprites.points, sparks.sprites.points);
  disposables.push(glows, smoke.sprites, sparks.sprites);
  let glowSlot = 0;
  const flashers: {
    slot: number;
    root: THREE.Object3D;
    local: THREE.Vector3;
    size: number;
    color: [number, number, number];
    rate: number;
    phase: number;
    steady: boolean;
  }[] = [];
  const addGlow = (
    root: THREE.Object3D,
    local: Vec3,
    size: number,
    color: [number, number, number],
    steady = true,
    rate = 5,
  ) => {
    flashers.push({
      slot: glowSlot++,
      root,
      local: new THREE.Vector3(...local),
      size,
      color,
      rate,
      phase: flashers.length * 1.7,
      steady,
    });
  };

  // Lamp posts along the outer pavement: a warm head, a glow and a pool of light on the road.
  {
    const total = ringPoint(0).total;
    const N = 16;
    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.07, 0.11, 7, 8).translate(0, 3.5, 0),
      M.dark,
      N,
    );
    const heads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.5, 0.14, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe3a6 }),
      N,
    );
    const pools = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowMap,
        color: 0xffb35c,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
      N,
    );
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const holder = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const p = ringPoint(((i + 0.5) / N) * total);
      const nx = Math.sin(p.yaw);
      const nz = Math.cos(p.yaw);
      const px = p.x + nx * (ROAD_W + 1.3);
      const pz = p.z + nz * (ROAD_W + 1.3);
      m4.compose(
        new THREE.Vector3(px, 0.07, pz),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1),
      );
      poles.setMatrixAt(i, m4);
      // The head reaches over the road.
      const hx = px - nx * 1.4;
      const hz = pz - nz * 1.4;
      holder.position.set(hx, 7.05, hz);
      holder.rotation.set(0, p.yaw + Math.PI / 2, 0);
      holder.updateMatrix();
      heads.setMatrixAt(i, holder.matrix);
      m4.compose(
        new THREE.Vector3(hx - nx * 0.6, 0.09, hz - nz * 0.6),
        flat,
        new THREE.Vector3(13, 13, 1),
      );
      pools.setMatrixAt(i, m4);
      addGlow(scene, [hx, 6.95, hz], 4.2, [1, 0.72, 0.38]);
    }
    poles.castShadow = !phone;
    pools.renderOrder = 3;
    scene.add(poles, heads, pools);
    disposables.push(
      poles.geometry,
      heads.geometry,
      heads.material as THREE.Material,
      pools.material as THREE.Material,
    );
  }

  // Searchlight towers at two corners of the site sweep the evening sky.
  const beams: { pivot: THREE.Group; speed: number; phase: number }[] = [];
  TOWERS.forEach(([x, z], i) => {
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.2, 8, 8).translate(0, 4, 0),
      M.dark,
    );
    tower.position.set(x, 0, z);
    tower.castShadow = !phone;
    const pivot = new THREE.Group();
    pivot.position.set(x, 8.1, z);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), M.lamp);
    pivot.add(lamp);
    const beam = makeBeam(i ? 0xc8e4ff : 0xfff0cc, phone ? 40 : 48, 2.2);
    beam.rotation.x = 0.82;
    pivot.add(beam);
    scene.add(tower, pivot);
    beams.push({ pivot, speed: i ? -0.36 : 0.42, phase: i * 2.4 });
    disposables.push(
      beam.geometry,
      beam.material as THREE.Material,
      (beam.material as THREE.MeshBasicMaterial).map!,
      tower.geometry,
    );
    addGlow(scene, [x, 8.1, z], 3.2, [1, 0.92, 0.7]);
  });

  // ----- machines
  const rig = new Rig(M);
  const dirtParticles = new Debris(phone ? 40 : 90, 0x7a5434, 0.16, 0.1);
  scene.add(dirtParticles.points);
  const updaters: ((t: number, dt: number) => void)[] = [];
  const pickables: THREE.Object3D[] = [];
  const anchors = new Map<WorldKind, THREE.Object3D>();
  const labelMats: THREE.SpriteMaterial[] = [];
  const labels: { sprite: THREE.Sprite; aspect: number }[] = [];
  const rings = new PulseRings(7);
  scene.add(rings.mesh);
  const ringRoots: { root: THREE.Object3D; size: number }[] = [];
  const emitters: {
    root: THREE.Object3D;
    local: THREE.Vector3;
    every: number;
    left: number;
    moving?: boolean;
  }[] = [];

  const place = (root: THREE.Object3D, at: { x: number; z: number; yaw: number }) => {
    root.position.set(at.x, 0, at.z);
    root.rotation.y = at.yaw;
    scene.add(root);
  };

  function tag(
    root: THREE.Object3D,
    kind: WorldKind,
    labelY: number,
    sub: string,
    labelled = true,
    /** Along the machine: a tag moved off what stands right behind it (the banner). */
    labelX = 0,
  ) {
    root.traverse((o) => (o.userData.kind = kind));
    pickables.push(root);
    if (!anchors.has(kind)) anchors.set(kind, root);
    if (!withLabels || !labelled) return;
    const map = labelTexture(LABELS[kind], phone ? null : sub);
    const mat = new THREE.SpriteMaterial({ map, depthTest: false, sizeAttenuation: false });
    labelMats.push(mat);
    const sprite = new THREE.Sprite(mat);
    // The tag stands on its pointer, above the machine.
    sprite.center.set(0.5, 0);
    sprite.position.set(labelX, labelY, 0);
    sprite.renderOrder = 10;
    sprite.userData.kind = kind;
    root.add(sprite);
    labels.push({ sprite, aspect: (map.image as HTMLCanvasElement).width / 256 });
    pickables.push(sprite);
  }

  const smokeEvery = phone ? 0.3 : 0.18;

  // Excavator-loader digging a trench and loading the dump truck beside it.
  const truck1 = makeDumpTruck(rig);
  place(truck1.root, LOAD_TRUCK_AT);
  const backhoe = makeBackhoe(rig, dirtParticles, truck1, BACKHOE_SWING);
  place(backhoe.root, BACKHOE_AT);
  updaters.push(backhoe.update);
  tag(backhoe.root, 'excavator', 5.6, 'на линии · работает');
  ringRoots.push({ root: backhoe.root, size: 11 });
  emitters.push({
    root: backhoe.root,
    local: new THREE.Vector3(1.7, 2.9, -0.45),
    every: smokeEvery,
    left: 0,
  });
  addGlow(backhoe.root, [-0.93, 3.2, 0.38], 1.5, [1, 0.6, 0.15], false, 4.4);
  addGlow(backhoe.root, [2.15, 1.95, 0.5], 1.7, [1, 0.95, 0.8]);
  addGlow(backhoe.root, [2.15, 1.95, -0.5], 1.7, [1, 0.95, 0.8]);
  backhoe.root.add(blobShadow(8.4, 4.4, blobOpacity));
  truck1.root.add(blobShadow(8.5, 4.4, blobOpacity));

  // Crane carrying slabs from the stack onto the frame.
  {
    const crane = makeCrane(rig, {
      yawA: craneYaw(CRANE_SLEW.stack),
      yawB: craneYaw(CRANE_SLEW.frame),
      groundA: 1.14,
      groundB: FRAME_TOP,
    });
    place(crane.root, CRANE_AT);
    crane.placed.position.set(SLAB_DROP.x, FRAME_TOP, SLAB_DROP.z);
    crane.placed.rotation.y = SLAB_DROP.yaw;
    scene.add(crane.placed);
    updaters.push((t, dt) => crane.update(t, dt));
    tag(crane.root, 'crane', 8.4, 'на линии · монтаж');
    ringRoots.push({ root: crane.root, size: 14 });
    crane.root.add(blobShadow(13, 7.5, blobOpacity));
    emitters.push({
      root: crane.root,
      local: new THREE.Vector3(3.75, 3.1, -1.0),
      every: smokeEvery * 1.6,
      left: 0,
    });
    addGlow(crane.root, [4.4, 2.98, 0.6], 1.5, [1, 0.6, 0.15], false, 3.8);
    addGlow(crane.root, [5.32, 1.32, 0.82], 1.7, [1, 0.95, 0.8]);
    addGlow(crane.root, [5.32, 1.32, -0.82], 1.7, [1, 0.95, 0.8]);
  }

  // Aerial platform at the south face of the frame.
  {
    const agp = makeAgp(rig, AGP_TURRET_YAW);
    place(agp.root, AGP_AT);
    updaters.push((t, dt) => agp.update(t, dt));
    tag(agp.root, 'agp', 6.0, 'на линии · фасад', true, -2.2);
    ringRoots.push({ root: agp.root, size: 10 });
    agp.root.add(blobShadow(9, 5.6, blobOpacity));
    addGlow(agp.root, [2.7, 2.98, 0.6], 1.5, [1, 0.6, 0.15], false, 4.8);
    addGlow(agp.root, [3.62, 1.32, 0.82], 1.7, [1, 0.95, 0.8]);
    addGlow(agp.root, [3.62, 1.32, -0.82], 1.7, [1, 0.95, 0.8]);
  }

  // Small things of the site: the office cabin with the platform's board,
  // pallets of blocks, spoil heaps by the trench.
  {
    const props = node(scene);
    const cabin = node(props, [CABIN.x, 0, CABIN.z]);
    cabin.rotation.y = CABIN.yaw;
    rig.box(cabin, [CABIN.w, 2.5, CABIN.d], 'cabin', [0, 1.45, 0]);
    rig.box(cabin, [CABIN.w + 0.2, 0.1, CABIN.d + 0.2], 'white', [0, 2.75, 0]);
    for (const x of [-CABIN.w / 2 + 0.4, CABIN.w / 2 - 0.4])
      rig.box(cabin, [0.5, 0.2, CABIN.d], 'dark', [x, 0.1, 0]);
    for (const s of [1, -1]) {
      rig.box(cabin, [0.9, 1.9, 0.05], 'dark', [-2.2, 1.2, s * (CABIN.d / 2 + 0.01)]);
      rig.box(cabin, [1.1, 0.8, 0.05], 'glass', [2.1, 1.75, s * (CABIN.d / 2 + 0.01)]);
      rig.decal(
        cabin,
        'platformBoard',
        2.9,
        [0, 1.9, s * (CABIN.d / 2 + 0.03)],
        [0, s > 0 ? 0 : Math.PI, 0],
      );
    }
    cabin.add(blobShadow(CABIN.w + 3, CABIN.d + 3, blobOpacity));
    const pallet = palletBuilder(rig);
    for (const [x, z] of PALLETS) pallet(node(props, [x, 0, z]));
    rig.heap(props, 1.5, 1.1, 'dirt', [PIT.x - 0.4, 0.03, PIT.z + 2.5]);
    rig.heap(props, 1.2, 0.8, 'dirt', [PIT.x - 2.9, 0.03, PIT.z + 0.5]);
    rig.heap(props, 0.9, 0.55, 'dirt', [PIT.x + 1.6, 0.03, PIT.z + 2.2]);
  }

  // Machines driving the ring road «на линии»: lights on, dust behind, a lean in the corners.
  const drivers: {
    root: THREE.Object3D;
    wheels: THREE.Object3D[];
    s: number;
    speed: number;
    pace: number;
    lean: number;
    pitch: number;
    pool: THREE.Mesh;
  }[] = [];
  const drive = (offset: number, speed: number, sub: string) => {
    const t = makeDumpTruck(rig);
    t.root.scale.setScalar(0.85);
    t.root.rotation.order = 'YXZ';
    scene.add(t.root);
    // On a phone one truck carries the tag: three more would cover the picture.
    tag(t.root, 'dump', 4.5, sub, !phone || drivers.length === 0);
    // Headlights: bright points and a pool of light on the road ahead.
    addGlow(t.root, [3.5, 1.32, 0.82], 1.9, [1, 0.95, 0.78]);
    addGlow(t.root, [3.5, 1.32, -0.82], 1.9, [1, 0.95, 0.78]);
    addGlow(t.root, [-3.12, 1.0, 0.95], 1.0, [1, 0.1, 0.06]);
    addGlow(t.root, [-3.12, 1.0, -0.95], 1.0, [1, 0.1, 0.06]);
    addGlow(t.root, [2.6, 2.95, 0.6], 1.5, [1, 0.6, 0.15], false, 5.4);
    const pool = makeLightPool(0xfff1c8, 12, 6, 0.55);
    pool.position.set(8.2, 0.12, 0);
    t.root.add(pool);
    t.root.add(blobShadow(8.5, 4.2, blobOpacity * 1.1));
    ringRoots.push({ root: t.root, size: 9 });
    emitters.push({
      root: t.root,
      local: new THREE.Vector3(2.0, 3.05, -1.0),
      every: smokeEvery,
      left: 0,
      moving: true,
    });
    drivers.push({
      root: t.root,
      wheels: t.wheels,
      s: offset,
      speed,
      pace: 1,
      lean: 0,
      pitch: 0,
      pool,
    });
  };
  drive(0, 5.5, 'на линии · свободен');
  drive(55, 4.5, 'на линии · едет к заказу');
  drive(110, 5, 'на линии · свободен');
  let driversPlaced = false;
  const prevYaw = [0, 0, 0];
  updaters.push((t, dt) => {
    if (!driversPlaced) {
      // The first frame: start a few seconds into the loop, as before.
      for (const d of drivers) d.s += t * d.speed;
      driversPlaced = true;
    }
    drivers.forEach((d, i) => {
      // Slow down for the corners, speed up on the straights, smoothly.
      const ahead = ringPoint(d.s + 4).yaw;
      const behind = ringPoint(d.s - 1).yaw;
      let dyaw = ahead - behind;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const corner = Math.min(1, Math.abs(dyaw) / 0.7);
      d.pace += (1 - corner * 0.38 - d.pace) * Math.min(1, dt * 1.6);
      d.s += d.speed * d.pace * dt;
      const p = ringPoint(d.s);
      // Right-hand traffic: keep to the outer lane.
      const nx = Math.sin(p.yaw);
      const nz = Math.cos(p.yaw);
      d.root.position.set(p.x + nx * 1.2, 0.02, p.z + nz * 1.2);
      // Body roll in the corners (outwards), a little nod with the speed change.
      const turn = Math.atan2(Math.sin(p.yaw - prevYaw[i]!), Math.cos(p.yaw - prevYaw[i]!));
      prevYaw[i] = p.yaw;
      const roll = dt > 0 ? Math.max(-0.05, Math.min(0.05, (turn / dt) * 0.07)) : 0;
      d.lean += (roll - d.lean) * Math.min(1, dt * 4);
      d.pitch += (Math.sin(d.s * 0.7 + i) * 0.006 - d.pitch) * Math.min(1, dt * 3);
      d.root.rotation.set(d.lean, p.yaw, d.pitch);
      for (const w of d.wheels) w.rotation.z = -d.s / 0.55;
    });
  });
  rig.bake({ cast: !phone, receive: false });

  // ----- people: workers on the site (the vest carries the brand)
  const crew: {
    person: Person;
    walk?: { from: number; to: number; speed: number; phase: number; dir: number };
    talk?: boolean;
  }[] = [];
  {
    const stand = (
      id: string,
      x: number,
      y: number,
      z: number,
      yaw: number,
      extra: object = {},
    ) => {
      const person = makePerson(lookFor(id), id);
      person.root.position.set(x, y, z);
      person.root.rotation.y = yaw;
      scene.add(person.root);
      crew.push({ person, ...extra });
    };
    const w = CREW.walker;
    stand('walker', w.from + 1, 0.03, w.z, Math.PI / 2, {
      walk: { from: w.from, to: w.to, speed: 1.35, phase: 0, dir: 1 },
    });
    stand('foreman', CREW.foreman.x, 0.03, CREW.foreman.z, Math.PI / 2, { talk: true });
    stand('rigger', CREW.rigger.x, 0.03, CREW.rigger.z, -Math.PI / 2, { talk: true });
    stand('welder', FRAME.x + CREW.welder.x, FRAME.floorH + 0.15, FRAME.z + CREW.welder.z, 0);
  }
  const WELD = new THREE.Vector3(
    FRAME.x + CREW.welder.x + 0.5,
    FRAME.floorH + 0.6,
    FRAME.z + CREW.welder.z + 0.4,
  );
  const welderGlow = glowSlot++;

  // ----- camera: slow cinematic orbit with a gentle dolly; a guided walk takes over on demand
  const target = new THREE.Vector3(0, 2.5, 0);
  const focusTarget = new THREE.Vector3(0, 2.5, 0);
  let azimuth = 0.62;
  let autoSpin = !still;
  const radius = phone ? 47 : 50;
  const height = phone ? 19 : 15.5;
  const lookNow = new THREE.Vector3(0, 2.5, 0);
  let baseFov = 38;
  let fovNow = 38;

  interface Walk {
    index: number;
    from: CameraPose;
    start: number;
    arrived: boolean;
    yaw: number;
    yawTarget: number;
  }
  let walking: Walk | null = null;
  /** 0 in the block view, 1 in a walk shot: the light, the haze and the lift of the picture follow it. */
  let walkMix = 0;
  const tmpAnchor = new THREE.Vector3();
  const keyAt = new THREE.Vector3(0, 12, 0);
  const keyTo = new THREE.Vector3();

  function anchorOf(kind: WorldKind): Vec3 {
    const a = anchors.get(kind);
    if (!a) return [0, 0, 0];
    a.getWorldPosition(tmpAnchor);
    return [tmpAnchor.x, tmpAnchor.y, tmpAnchor.z];
  }
  const headingOf = (kind: WorldKind) => anchors.get(kind)?.rotation.y ?? 0;

  function placeCamera(time: number, dt: number) {
    const instant = still || dt === 0;
    walkMix += ((walking ? 1 : 0) - walkMix) * (instant ? 1 : Math.min(1, dt * 1.7));
    if (walkMix < 0.002) walkMix = 0;
    const k = walkMix;
    sun.intensity = LIGHT.sun + (LIGHT.walkSun - LIGHT.sun) * k;
    hemi.intensity = LIGHT.hemi + (LIGHT.walkHemi - LIGHT.hemi) * k;
    scene.environmentIntensity = LIGHT.env + (LIGHT.walkEnv - LIGHT.env) * k;
    fog.near = FOG.near + (FOG.walkNear - FOG.near) * k;
    fog.far = FOG.far + (FOG.walkFar - FOG.far) * k;
    key.intensity = KEY_POWER * k;
    // The picture is lifted, so the machine stands above the card of the stop.
    const lift = stopLift(camera.aspect) * k;
    if (lift > 0) {
      const w = renderer.domElement.width || 1;
      const h = renderer.domElement.height || 1;
      camera.setViewOffset(w, h, 0, Math.round(lift * h), w, h);
    } else if (camera.view?.enabled) {
      camera.clearViewOffset();
    }

    if (walking) {
      const stop = WALK_STOPS[walking.index]!;
      const anchor = anchorOf(stop.kind);
      const heading = headingOf(stop.kind);
      walking.yaw += (walking.yawTarget - walking.yaw) * (instant ? 1 : 0.12);
      let pose = stopPose(stop, anchor, walking.yaw, camera.aspect, heading);
      if (!walking.arrived) {
        const p = flightProgress(walking.start * 1000, wall * 1000, WALK_FLIGHT_MS);
        pose = blendPose(walking.from, pose, p);
        if (p >= 1) {
          walking.arrived = true;
          opts.onArrive?.(walking.index);
        }
      }
      // A slow breath of the camera while it rests: never a dead frame.
      const bob = still ? 0 : 1;
      camera.position.set(
        pose.pos[0] + Math.sin(time * 0.5) * 0.1 * bob,
        Math.max(0.8, pose.pos[1] + Math.sin(time * 0.7) * 0.06 * bob),
        pose.pos[2] + Math.cos(time * 0.45) * 0.1 * bob,
      );
      lookNow.set(...pose.look);
      const fov = stopFov(stop, camera.aspect);
      fovNow += (fov - fovNow) * (instant ? 1 : 0.06);
      if (Math.abs(camera.fov - fovNow) > 0.01) {
        camera.fov = fovNow;
        camera.updateProjectionMatrix();
        updateSpriteScale();
      }
      camera.lookAt(lookNow);
      // The key light travels to the machine of the stop.
      const light = stopKey(stop, anchor, heading);
      keyTo.set(...light.pos);
      keyAt.lerp(keyTo, instant ? 1 : Math.min(1, dt * 2.2));
      key.position.copy(keyAt);
      key.target.position.set(...light.target);
      key.angle += (light.angle - key.angle) * (instant ? 1 : Math.min(1, dt * 2.2));
      return;
    }
    target.lerp(focusTarget, 0.08);
    const dolly = still ? 0 : Math.sin(time * 0.11) * 3;
    const r = radius + dolly;
    camera.position.set(
      target.x + Math.sin(azimuth) * r,
      height + (still ? 0 : Math.sin(time * 0.09) * 1.4),
      target.z + Math.cos(azimuth) * r,
    );
    lookNow.copy(target);
    camera.lookAt(target);
  }

  // Tags never lie on top of one another: the machines of the site come first,
  // a truck driving behind them loses its tag while it passes.
  let tick = 0;
  let labelWidth = 150;
  const labelAt = new THREE.Vector3();
  function declutterLabels() {
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    camera.updateMatrixWorld();
    const boxes = labels.map((l) => {
      l.sprite.getWorldPosition(labelAt).project(camera);
      if (labelAt.z > 1 || labelAt.z < -1) return null;
      const h = labelWidth / l.aspect;
      // Tags keep a clear gap between them; a tag that is shown keeps its place a
      // little longer than a hidden one takes to return.
      const pad = (l.sprite.visible ? 6 : 12) * (phone ? 0.5 : 1);
      return {
        x: ((labelAt.x + 1) / 2) * cssW - labelWidth / 2 - pad,
        y: ((1 - labelAt.y) / 2) * cssH - h - pad,
        w: labelWidth + pad * 2,
        h: h + pad * 2,
      };
    });
    declutter(boxes).forEach((shown, i) => (labels[i]!.sprite.visible = shown));
  }

  function updateSpriteScale() {
    const h = renderer.domElement.height || 1;
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const px = h / (2 * tan);
    glows.setScale(px);
    smoke.sprites.setScale(px);
    sparks.sprites.setScale(px);
    // Tags: a fixed width on the screen. On a phone the name alone, its letters
    // 16–18 px high; on a wide screen smaller, so the machines stay in sight.
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const width = phone
      ? Math.min(150, Math.max(120, cssW * 0.34))
      : Math.min(200, Math.max(150, cssW * 0.16));
    labelWidth = width;
    for (const l of labels) {
      const sy = (width / l.aspect / cssH) * 2 * tan;
      l.sprite.scale.set(sy * l.aspect, sy, 1);
    }
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseFov = w / h < 1.2 ? 46 : 38;
    if (!walking) {
      camera.fov = fovNow = baseFov;
    }
    camera.updateProjectionMatrix();
    updateSpriteScale();
  }
  const ro = new ResizeObserver(() => {
    resize();
    if (!running) frame(0);
  });
  ro.observe(canvas);
  resize();

  // ----- picking and drag
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: { x: number; y: number; az: number; yaw: number } | null = null;
  let dragged = false;
  function onDown(e: PointerEvent) {
    down = { x: e.clientX, y: e.clientY, az: azimuth, yaw: walking?.yawTarget ?? 0 };
    dragged = false;
  }
  function onMove(e: PointerEvent) {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 6) {
      dragged = true;
      if (walking) {
        walking.yawTarget = Math.max(-WALK_MAX_YAW, Math.min(WALK_MAX_YAW, down.yaw - dx * 0.006));
      } else {
        autoSpin = false;
        azimuth = down.az - dx * 0.006;
      }
      if (!running) frame(0);
    }
  }
  function onUp(e: PointerEvent) {
    const wasDrag = dragged;
    down = null;
    if (wasDrag) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    const hit = ray
      .intersectObjects(pickables, true)
      .find((h) => h.object.userData.kind && h.object.visible);
    if (hit) {
      const kind = hit.object.userData.kind as WorldKind;
      if (!walking) focus(kind);
      opts.onPick(kind);
    }
  }
  function onCancel() {
    down = null;
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  function focus(kind: WorldKind) {
    const a = anchors.get(kind);
    if (!a) return;
    a.getWorldPosition(focusTarget);
    focusTarget.y = 2.5;
    // Pull the focus halfway, so the district stays in the frame.
    focusTarget.multiplyScalar(0.6);
    autoSpin = false;
    if (!running) {
      target.copy(focusTarget);
      frame(0);
    }
  }

  // ----- walk
  function walkStart(index: number) {
    const from: CameraPose = {
      pos: [camera.position.x, camera.position.y, camera.position.z],
      look: [lookNow.x, lookNow.y, lookNow.z],
    };
    autoSpin = false;
    for (const l of labels) l.sprite.visible = false;
    walking = { index, from, start: wall, arrived: false, yaw: 0, yawTarget: 0 };
    if (still) instantArrive();
    else if (!running) frame(0);
  }
  function walkTo(index: number) {
    if (!walking) return walkStart(index);
    walking.from = {
      pos: [camera.position.x, camera.position.y, camera.position.z],
      look: [lookNow.x, lookNow.y, lookNow.z],
    };
    walking.index = index;
    walking.start = wall;
    walking.arrived = false;
    walking.yawTarget = 0;
    if (still) instantArrive();
    else if (!running) frame(0);
  }
  /** Reduced motion: no flight, the camera is simply at the stop. */
  function instantArrive() {
    if (!walking) return;
    walking.start = -1e6;
    walking.yaw = walking.yawTarget = 0;
    frame(0);
  }
  function walkEnd() {
    walking = null;
    tick = 0;
    camera.fov = fovNow = baseFov;
    camera.updateProjectionMatrix();
    updateSpriteScale();
    target.set(0, 2.5, 0);
    focusTarget.set(0, 2.5, 0);
    if (!running) frame(0);
  }

  // ----- loop
  let running = false;
  let raf = 0;
  let time = opts.clock ?? 3; // start mid-cycle: the machines are already at work
  let last = 0;
  let sampled = 0;
  let sampleMs = 0;
  let warm = 0;
  let measuring = !still;
  let slowReported = false;
  /** Once only: the caller swaps the live scene for the pictures. */
  function reportSlow() {
    if (slowReported) return;
    slowReported = true;
    opts.onSlow();
  }
  // A lost GPU context (the phone reclaimed it) is the same as a device that
  // cannot keep up: the pictures take over instead of a black canvas.
  const onContextLost = (event: Event) => {
    event.preventDefault();
    reportSlow();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  let wall = 0;
  /** The plainer picture of a device that renders under ~30 frames a second. */
  let lite = false;
  function goLite() {
    lite = true;
    renderer.setPixelRatio(1);
    sun.castShadow = false;
    for (const b of beams) b.pivot.visible = false;
    resize();
  }
  let weldIn = 0.6;
  const wp = new THREE.Vector3();

  function showUpdate(dt: number) {
    // Pulsing «на линии» rings under every machine.
    ringRoots.forEach((r, i) => {
      r.root.getWorldPosition(wp);
      rings.setRing(i, wp.x, wp.z, r.size, (time * 0.42 + i * 0.29) % 1);
    });
    rings.commit();
    // Searchlights.
    for (const b of beams) b.pivot.rotation.y = time * b.speed + b.phase;
    // Smoke and dust.
    for (const e of emitters) {
      e.left -= dt;
      if (e.left > 0) continue;
      e.left = e.every * (lite ? 3 : 1) * (0.7 + Math.random() * 0.6);
      e.root.updateWorldMatrix(true, false);
      wp.copy(e.local).applyMatrix4(e.root.matrixWorld);
      smoke.emit(wp.x, wp.y, wp.z, {
        rise: 1.1,
        drift: [0.5, -0.25],
        size: 0.55,
        life: 2.4,
        color: [0.62, 0.62, 0.64],
        alpha: 0.36,
      });
      if (e.moving) {
        wp.set(-3.0, 0.25, 0).applyMatrix4(e.root.matrixWorld);
        smoke.emit(wp.x, wp.y, wp.z, {
          rise: 0.35,
          drift: [0.2, 0.1],
          size: 0.9,
          life: 1.5,
          color: [0.55, 0.45, 0.34],
          alpha: 0.2,
        });
      }
    }
    smoke.update(dt);
    // Welding sparks.
    weldIn -= dt;
    if (weldIn <= 0) {
      weldIn = 0.4 + Math.random() * 1.1;
      sparks.burst(WELD.x, WELD.y, WELD.z, phone ? 4 : 8);
    }
    sparks.update(dt);
    // Glows: lamps and lights steady, beacons flashing.
    for (const f of flashers) {
      f.root.updateWorldMatrix(true, false);
      wp.copy(f.local).applyMatrix4(f.root.matrixWorld);
      const k = f.steady ? 1 : Math.max(0, Math.sin(time * f.rate + f.phase)) ** 3;
      glows.set(
        f.slot,
        wp.x,
        wp.y,
        wp.z,
        f.size * (f.steady ? 1 : 0.7 + k * 0.5),
        f.color[0],
        f.color[1],
        f.color[2],
        f.steady ? 0.85 : k,
      );
    }
    const flick = weldIn > 0.2 ? 0.5 + Math.random() * 0.5 : 0.15;
    glows.set(welderGlow, WELD.x, WELD.y, WELD.z, 1.4 * flick + 0.4, 0.7, 0.85, 1, flick);
    glows.commit();
  }

  function crewUpdate(dt: number) {
    const camPos = camera.position;
    for (const c of crew) {
      const p = c.person;
      if (c.walk) {
        const w = c.walk;
        p.root.position.x += w.speed * w.dir * dt;
        w.phase += w.speed * dt * 3.4;
        if (p.root.position.x > w.to) {
          w.dir = -1;
          p.root.rotation.y = -Math.PI / 2;
        } else if (p.root.position.x < w.from) {
          w.dir = 1;
          p.root.rotation.y = Math.PI / 2;
        }
        animatePerson(p, {
          time,
          walk: 1,
          phase: w.phase,
          sit: false,
          talking: false,
          mood: 'neutral',
          look: 0,
        });
      } else {
        animatePerson(p, {
          time,
          walk: 0,
          phase: 0,
          sit: false,
          talking: Boolean(c.talk),
          mood: c.talk ? 'happy' : 'neutral',
          look: 0,
        });
      }
      // Full detail only close to the camera.
      setDetail(p, p.root.position.distanceTo(camPos) < 38);
    }
  }

  function frame(now: number) {
    const prev = last;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    if (running && last && measuring) {
      // Watchdog over a window of wall time, not a count of frames: a device that
      // draws two frames a second is found out in about two seconds, not in 45.
      // The very first frame (shaders compiling) is not counted.
      if (warm++ > 0) {
        sampled++;
        sampleMs += now - last;
        if (sampleMs >= WATCH_WINDOW_MS) {
          const average = sampleMs / sampled;
          sampled = 0;
          sampleMs = 0;
          if (average > SLOW_FRAME_MS) {
            measuring = false;
            reportSlow();
          } else if (average > LITE_FRAME_MS && !lite) {
            // Not smooth, not hopeless: a plainer picture, then the frames are measured again.
            goLite();
          } else {
            measuring = false;
          }
        }
      }
    }
    last = now;
    time += dt;
    // The flight of the walk runs by the clock on the wall: on a slow device it
    // skips frames instead of lasting several times longer.
    wall += last && prev ? Math.min(0.5, (now - prev) / 1000) : 0;
    if (autoSpin) azimuth += dt * 0.05;
    for (const u of updaters) u(time, dt);
    dirtParticles.update(dt);
    crewUpdate(dt);
    showUpdate(dt);
    placeCamera(time, dt);
    if (!walking && labels.length && tick++ % 6 === 0) declutterLabels();
    dome.position.copy(camera.position);
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }
  // First frame: settle machine poses.
  for (const u of updaters) u(time, 0);
  target.copy(focusTarget);
  frame(0);

  function setActive(active: boolean) {
    if (still) return;
    if (active && !running) {
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!active && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }

  return {
    setActive,
    focus,
    walkStart,
    walkTo,
    walkEnd,
    dispose() {
      setActive(false);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
      });
      for (const m of Object.values(M)) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
      for (const m of labelMats) {
        m.map?.dispose();
        m.dispose();
      }
      rings.dispose();
      for (const d of disposables) d.dispose();
      const people = peopleMaterials();
      people.body.map?.dispose();
      people.body.dispose();
      people.face.map?.dispose();
      people.face.dispose();
      resetPeopleMaterials();
      resetBlobTexture();
      renderer.dispose();
    },
  };
}
