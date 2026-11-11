// The home-page 3D city of ИИСтройка24 (owner, 2026-10-28: «Верни 3D-мир,
// усовершенствуй и подстрой под мой проект»; 2026-11-10: «поправь графику тоже
// … кругом должно быть шоу и эффекты»). A stylised district at dusk with a
// construction site in the middle; machines «на линии» drive the ring road or
// work on the site. Decorative: no real positions, no personal data.
//
// Loaded only when the block scrolls into view (dynamic import), so three.js
// never weighs on the first paint. Machines and the Rig come from the
// 2026-10-06 /stroyka world (machines.ts, kit.ts, people.ts); the look and the
// show are in effects.ts; the guided walk path is in walk.ts.
import * as THREE from 'three';
import { SITE } from '@/lib/site';
import { createMaterials, Debris, node, Rig } from './kit';
import { makeAgp, makeBackhoe, makeCrane, makeDumpTruck } from './machines';
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
  glowTexture,
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
import { SLOW_FRAME_MS, worldPixelRatio, type WorldKind } from './kinds';
import {
  blendPose,
  flightProgress,
  stopFov,
  stopPose,
  stopView,
  WALK_FLIGHT_MS,
  WALK_STOPS,
  type CameraPose,
  type Vec3,
} from './walk';

export interface WorldOptions {
  canvas: HTMLCanvasElement;
  phone: boolean;
  /** One rendered frame, no motion (prefers-reduced-motion). */
  still: boolean;
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

/** The «на линии» tag over a machine: large and bold, crisp even at a distance. */
function labelTexture(text: string, sub: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(15,23,42,0.9)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 1008, 192, 96);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(251,191,36,0.9)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(15,23,42,0.9)';
  ctx.beginPath();
  ctx.moveTo(472, 198);
  ctx.lineTo(552, 198);
  ctx.lineTo(512, 248);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(112, 104, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 76px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 176, 80);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 52px Arial, sans-serif';
  ctx.fillText(sub, 176, 152);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The banner on the site fence: brand in bold, a gradient, a light edge. */
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
  ctx.fillRect(0, 0, 2048, 36);
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.fillRect(0, 476, 2048, 36);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 236px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SITE.platform, 1024, 210, 1940);
  ctx.font = 'bold 86px Arial, sans-serif';
  ctx.fillText('спецтехника по всей России', 1024, 385);
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

export function createWorld(opts: WorldOptions): WorldHandle {
  const { canvas, phone, still } = opts;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(worldPixelRatio(window.devicePixelRatio, phone));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = !phone;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xe9b78c);

  const disposables: { dispose(): void }[] = [];
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe2b690, 55, 190);

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
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    disposables.push(env);
  }

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 420);
  scene.add(new THREE.HemisphereLight(0x9bb4dc, 0x6b4f34, 0.55));
  const sun = new THREE.DirectionalLight(0xffbe84, 2.5);
  sun.position.copy(sunDir).multiplyScalar(80);
  if (!phone) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = c.bottom = -40;
    c.right = c.top = 40;
    c.near = 10;
    c.far = 170;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
  }
  scene.add(sun);

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
    [-ROAD_W - 1.8, -ROAD_W, pavement, 0.07],
    [ROAD_W - 0.45, ROAD_W - 0.25, edgeLine, 0.045],
    [-ROAD_W + 0.25, -ROAD_W + 0.45, edgeLine, 0.045],
  ] as const) {
    const m = new THREE.Mesh(ringShape(a, b), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = mat === pavement;
    scene.add(m);
  }
  // Avenues out of the district.
  const avenueDash = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(2.2, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xf5f5f4 }),
    40,
  );
  {
    let i = 0;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const [w, d, x, z] of [
      [8, 140, 0, 92],
      [8, 140, 0, -92],
      [140, 8, 98, 0],
      [140, 8, -98, 0],
    ] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), asphalt);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, z);
      m.receiveShadow = true;
      scene.add(m);
      m.geometry.computeBoundingSphere();
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
    scene.add(avenueDash);
  }
  // Dashed centre line on the ring.
  {
    const dash = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.4, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xf5f5f4 }),
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
    // Roof plant on top of each block, and a soft shadow under it.
    const roofs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.6, 1),
      new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 0.9 }),
      spots.length,
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
        new THREE.Vector3(x, h + 0.3, z),
        new THREE.Quaternion(),
        new THREE.Vector3(w * 0.4, 1, d * 0.4),
      );
      roofs.setMatrixAt(i, m4);
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

  // ----- the construction site
  const site = new THREE.Group();
  scene.add(site);
  {
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x96693a, roughness: 1 });
    disposables.push(dirtMat);
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), dirtMat);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.03;
    dirt.receiveShadow = true;
    site.add(dirt);
    // Fence with the brand banner.
    const fenceMat = M.fence;
    const fence = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, d), fenceMat);
      m.position.set(x, 0.9, z);
      m.castShadow = !phone;
      site.add(m);
    };
    fence(40, 0.15, 0, 15);
    fence(40, 0.15, 0, -15);
    fence(0.15, 30, -20, 0);
    fence(0.15, 30, 20, 0);
    const brandMat = new THREE.MeshBasicMaterial({ map: brandTexture() });
    disposables.push(brandMat.map!, brandMat);
    for (const [x, z, ry] of [
      [0, 15.1, 0],
      [0, -15.1, Math.PI],
    ] as const) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), brandMat);
      b.position.set(x, 3.2, z);
      b.rotation.y = ry;
      site.add(b);
      for (const sx of [-5.5, 5.5]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), M.dark);
        post.position.set(x + sx, 1.5, z);
        site.add(post);
      }
    }
    // The building going up: columns and slabs, three floors.
    const frame = node(site, [-4, 0, -7]);
    for (let f = 0; f < 3; f++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 8), M.concrete);
      slab.position.set(0, 2.9 + f * 2.9, 0);
      slab.castShadow = slab.receiveShadow = !phone;
      frame.add(slab);
      for (const cx of [-6.6, -2.2, 2.2, 6.6])
        for (const cz of [-3.6, 3.6]) {
          const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.9, 0.4), M.concreteDark);
          col.position.set(cx, 1.45 + f * 2.9, cz);
          col.castShadow = !phone;
          frame.add(col);
        }
    }
    const walls = new THREE.Mesh(new THREE.BoxGeometry(14, 2.9, 0.25), M.block);
    walls.position.set(0, 1.45, 3.9);
    frame.add(walls);
    const frameShadow = blobShadow(19, 13, blobOpacity);
    frameShadow.position.set(0, 0.07, 0);
    frame.add(frameShadow);
    // A slab stack for the crane.
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 1.6), M.concrete);
      s.position.set(12, 0.15 + i * 0.27, -9);
      s.castShadow = !phone;
      site.add(s);
    }
    const stackShadow = blobShadow(9, 5, blobOpacity);
    stackShadow.position.set(12, 0.07, -9);
    site.add(stackShadow);
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
      phase: Math.random() * 6,
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
  for (const [x, z, color, speed, phase] of [
    [-19, 14, 0xfff0cc, 0.42, 0],
    [19, -14, 0xc8e4ff, -0.36, 2.4],
  ] as const) {
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
    const beam = makeBeam(color, phone ? 40 : 48, 2.2);
    beam.rotation.x = 0.82;
    pivot.add(beam);
    scene.add(tower, pivot);
    beams.push({ pivot, speed, phase });
    disposables.push(
      beam.geometry,
      beam.material as THREE.Material,
      (beam.material as THREE.MeshBasicMaterial).map!,
      tower.geometry,
    );
    addGlow(scene, [x, 8.1, z], 3.2, [1, 0.92, 0.7]);
  }

  // ----- machines
  const rig = new Rig(M);
  const dirtParticles = new Debris(phone ? 40 : 90, 0x7a5434, 0.16, 0.1);
  scene.add(dirtParticles.points);
  const updaters: ((t: number, dt: number) => void)[] = [];
  const pickables: THREE.Object3D[] = [];
  const anchors = new Map<WorldKind, THREE.Object3D>();
  const labelMats: THREE.SpriteMaterial[] = [];
  const labels: THREE.Sprite[] = [];
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

  function tag(root: THREE.Object3D, kind: WorldKind, labelY: number, sub: string) {
    root.traverse((o) => (o.userData.kind = kind));
    pickables.push(root);
    const mat = new THREE.SpriteMaterial({
      map: labelTexture(LABELS[kind], sub),
      depthTest: false,
    });
    labelMats.push(mat);
    const label = new THREE.Sprite(mat);
    label.scale.set(phone ? 10 : 7.2, phone ? 2.5 : 1.8, 1);
    label.position.set(0, labelY, 0);
    label.renderOrder = 10;
    label.userData.kind = kind;
    root.add(label);
    labels.push(label);
    pickables.push(label);
    if (!anchors.has(kind)) anchors.set(kind, root);
  }

  const smokeEvery = phone ? 0.3 : 0.18;

  // Excavator loading a dump truck on the site.
  const truck1 = makeDumpTruck(rig);
  truck1.root.position.set(6.35, 0, 10.05);
  truck1.root.rotation.y = 0;
  const backhoe = makeBackhoe(rig, dirtParticles, truck1);
  backhoe.root.position.set(9, 0, 6);
  scene.add(truck1.root, backhoe.root);
  updaters.push(backhoe.update);
  tag(backhoe.root, 'excavator', 6.2, 'на линии · работает');
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
  for (const r of [backhoe.root, truck1.root]) {
    const b = blobShadow(r === backhoe.root ? 9 : 8.5, 4.6, blobOpacity);
    r.add(b);
  }

  // Crane lifting slabs from the stack onto the frame.
  {
    const crane = makeCrane(rig, 1.1, 8.9);
    crane.root.position.set(4, 0, -1);
    crane.root.rotation.y = Math.PI * 0.08;
    scene.add(crane.root);
    updaters.push((t, dt) => crane.update(t, dt));
    tag(crane.root, 'crane', 7.5, 'на линии · монтаж');
    ringRoots.push({ root: crane.root, size: 14 });
    crane.root.add(blobShadow(13, 6, blobOpacity));
    emitters.push({
      root: crane.root,
      local: new THREE.Vector3(3.2, 2.2, -1.3),
      every: smokeEvery * 1.6,
      left: 0,
    });
    addGlow(crane.root, [4.4, 3.45, 0.1], 1.5, [1, 0.6, 0.15], false, 3.8);
    addGlow(crane.root, [5.4, 1.2, 0.9], 1.7, [1, 0.95, 0.8]);
    addGlow(crane.root, [5.4, 1.2, -0.9], 1.7, [1, 0.95, 0.8]);
  }

  // Aerial platform at the frame's west face.
  {
    const agp = makeAgp(rig);
    agp.root.position.set(-14, 0, -12.5);
    scene.add(agp.root);
    updaters.push((t, dt) => agp.update(t, dt));
    tag(agp.root, 'agp', 5.5, 'на линии · фасад');
    ringRoots.push({ root: agp.root, size: 10 });
    agp.root.add(blobShadow(9, 5.2, blobOpacity));
    addGlow(agp.root, [2.7, 3.0, 0.6], 1.5, [1, 0.6, 0.15], false, 4.8);
    addGlow(agp.root, [3.7, 1.3, 0.8], 1.7, [1, 0.95, 0.8]);
    addGlow(agp.root, [3.7, 1.3, -0.8], 1.7, [1, 0.95, 0.8]);
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
    tag(t.root, 'dump', 5.8, sub);
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
    walk?: { from: number; to: number; z: number; speed: number; phase: number; dir: number };
    talk?: boolean;
    welder?: boolean;
  }[] = [];
  {
    const place = (
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
      const entry = { person, ...extra };
      crew.push(entry);
      return entry;
    };
    place('walker', -14, 0.03, 12.6, Math.PI / 2, {
      walk: { from: -15, to: -2, z: 12.6, speed: 1.35, phase: 0, dir: 1 },
    });
    place('foreman', 10.2, 0.03, -6.4, Math.PI / 2, { talk: true });
    place('rigger', 11.6, 0.03, -6.4, -Math.PI / 2, { talk: true });
    place('welder', -9.5, 3.05, -3.4, 0, { welder: true });
  }
  let welderGlow = -1;
  const WELD = new THREE.Vector3(-9.0, 3.5, -2.9);
  if (crew.length) {
    welderGlow = glowSlot++;
  }

  // ----- camera: slow cinematic orbit with a gentle dolly; a guided walk takes over on demand
  const target = new THREE.Vector3(0, 2.5, 0);
  const focusTarget = new THREE.Vector3(0, 2.5, 0);
  let azimuth = 0.7;
  let autoSpin = !still;
  const radius = phone ? 50 : 56;
  const height = phone ? 25 : 22;
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
  const tmpAnchor = new THREE.Vector3();

  function anchorOf(kind: WorldKind): Vec3 {
    const a = anchors.get(kind);
    if (!a) return [0, 0, 0];
    a.getWorldPosition(tmpAnchor);
    return [tmpAnchor.x, tmpAnchor.y, tmpAnchor.z];
  }

  function placeCamera(time: number) {
    if (walking) {
      const stop = WALK_STOPS[walking.index]!;
      walking.yaw += (walking.yawTarget - walking.yaw) * 0.12;
      let pose = stopPose(stop, anchorOf(stop.kind), walking.yaw, stopView(camera.aspect));
      if (!walking.arrived) {
        const k = flightProgress(walking.start * 1000, time * 1000, WALK_FLIGHT_MS);
        pose = blendPose(walking.from, pose, k);
        if (k >= 1) {
          walking.arrived = true;
          opts.onArrive?.(walking.index);
        }
      }
      // A slow breath of the camera while it rests: never a dead frame.
      const bob = still ? 0 : 1;
      camera.position.set(
        pose.pos[0] + Math.sin(time * 0.5) * 0.12 * bob,
        pose.pos[1] + Math.sin(time * 0.7) * 0.1 * bob,
        pose.pos[2] + Math.cos(time * 0.45) * 0.12 * bob,
      );
      lookNow.set(...pose.look);
      const fov = stopFov(stop, camera.aspect);
      fovNow += (fov - fovNow) * 0.06;
      if (Math.abs(camera.fov - fovNow) > 0.01) {
        camera.fov = fovNow;
        camera.updateProjectionMatrix();
        updateSpriteScale();
      }
      camera.lookAt(lookNow);
      return;
    }
    target.lerp(focusTarget, 0.08);
    const dolly = still ? 0 : Math.sin(time * 0.11) * 3.5;
    const r = radius + dolly;
    camera.position.set(
      target.x + Math.sin(azimuth) * r,
      height + (still ? 0 : Math.sin(time * 0.09) * 1.6),
      target.z + Math.cos(azimuth) * r,
    );
    lookNow.copy(target);
    camera.lookAt(target);
  }

  function updateSpriteScale() {
    const h = renderer.domElement.height || 1;
    const px = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    glows.setScale(px);
    smoke.sprites.setScale(px);
    sparks.sprites.setScale(px);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseFov = w / h < 1.2 ? 48 : 38;
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
        walking.yawTarget = Math.max(-1.35, Math.min(1.35, down.yaw - dx * 0.006));
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
    const hit = ray.intersectObjects(pickables, true).find((h) => h.object.userData.kind);
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
    for (const l of labels) l.visible = false;
    walking = { index, from, start: time, arrived: false, yaw: 0, yawTarget: 0 };
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
    walking.start = time;
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
    for (const l of labels) l.visible = true;
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
  let time = 3; // start mid-cycle: the crane already holds a slab
  let last = 0;
  let sampled = 0;
  let sampleMs = 0;
  let slowReported = false;
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
      e.left = e.every * (0.7 + Math.random() * 0.6);
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
    if (welderGlow >= 0) {
      const flick = weldIn > 0.2 ? 0.5 + Math.random() * 0.5 : 0.15;
      glows.set(welderGlow, WELD.x, WELD.y, WELD.z, 1.4 * flick + 0.4, 0.7, 0.85, 1, flick);
    }
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
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    if (running && last) {
      // Watchdog over the first frames: a phone that cannot keep up falls back.
      if (sampled < 90) {
        sampled++;
        sampleMs += now - last;
        if (sampled === 90 && sampleMs / 90 > SLOW_FRAME_MS && !slowReported) {
          slowReported = true;
          opts.onSlow();
        }
      }
    }
    last = now;
    time += dt;
    if (autoSpin) azimuth += dt * 0.05;
    for (const u of updaters) u(time, dt);
    dirtParticles.update(dt);
    crewUpdate(dt);
    showUpdate(dt);
    placeCamera(time);
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
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
      });
      for (const m of Object.values(M)) m.dispose();
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
