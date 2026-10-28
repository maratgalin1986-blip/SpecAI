// The home-page 3D city of ИИСтройка24 (owner, 2026-10-28: «Верни 3D-мир,
// усовершенствуй и подстрой под мой проект»). A stylised district with a
// construction site in the middle; machines «на линии» drive the ring road or
// work on the site. Decorative: no real positions, no personal data.
//
// Loaded only when the block scrolls into view (dynamic import), so three.js
// never weighs on the first paint. Machines and the Rig come from the
// 2026-10-06 /stroyka world (machines.ts, kit.ts, people.ts).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SITE } from '@/lib/site';
import { createMaterials, Debris, node, Rig } from './kit';
import { makeAgp, makeBackhoe, makeCrane, makeDumpTruck } from './machines';
import { SLOW_FRAME_MS, worldPixelRatio, type WorldKind } from './kinds';

export interface WorldOptions {
  canvas: HTMLCanvasElement;
  phone: boolean;
  /** One rendered frame, no motion (prefers-reduced-motion). */
  still: boolean;
  onPick(kind: WorldKind): void;
  /** The device cannot keep up: the caller shows the poster instead. */
  onSlow(): void;
}

export interface WorldHandle {
  setActive(active: boolean): void;
  focus(kind: WorldKind): void;
  dispose(): void;
}

// Ring road: a rounded rectangle around the site.
const RING = { hx: 26, hz: 21, r: 6 };

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

function labelTexture(text: string, sub: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(15,23,42,0.88)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 96, 48);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(236, 100);
  ctx.lineTo(276, 100);
  ctx.lineTo(256, 124);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(56, 52, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 38px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 88, 40);
  ctx.fillStyle = '#fbbf24';
  ctx.font = '26px Arial, sans-serif';
  ctx.fillText(sub, 88, 76);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function brandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 1024, 0);
  g.addColorStop(0, '#f59e0b');
  g.addColorStop(1, '#ea580c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 120px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SITE.platform, 512, 110);
  ctx.font = '44px Arial, sans-serif';
  ctx.fillText('спецтехника по всей России', 512, 205);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const LABELS: Record<WorldKind, string> = {
  excavator: 'Экскаватор',
  crane: 'Автокран',
  agp: 'Автовышка',
  dump: 'Самосвал',
};

export function createWorld(opts: WorldOptions): WorldHandle {
  const { canvas, phone, still } = opts;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(worldPixelRatio(window.devicePixelRatio, phone));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !phone;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfdcf2);
  scene.fog = new THREE.Fog(0xbfdcf2, 70, 150);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
  scene.add(new THREE.HemisphereLight(0xdbeafe, 0x5b4a36, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(30, 45, 20);
  if (!phone) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = c.bottom = -40;
    c.right = c.top = 40;
    c.far = 120;
    sun.shadow.bias = -0.0005;
  }
  scene.add(sun);

  const M = createMaterials();
  const disposables: { dispose(): void }[] = [env];

  // ----- ground, roads
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshStandardMaterial({ color: 0x8fae6b, roughness: 1 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3f444c, roughness: 0.95 });
  const ringShape = new THREE.Shape();
  {
    const { hx, hz, r } = RING;
    const w = 3.6;
    const rr = (s: THREE.Path, ex: number, ez: number, rad: number) => {
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
    rr(ringShape, hx + w, hz + w, r + w);
    const hole = new THREE.Path();
    rr(hole, hx - w, hz - w, Math.max(0.5, r - w));
    ringShape.holes.push(hole);
  }
  const road = new THREE.Mesh(new THREE.ShapeGeometry(ringShape, 24), asphalt);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  road.receiveShadow = true;
  scene.add(road);
  // Avenues out of the district.
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

  // ----- the district: instanced blocks of flats and offices, trees
  const rand = seeded(24);
  {
    const spots: [number, number, number, number, number][] = [];
    for (let gx = -5; gx <= 5; gx++)
      for (let gz = -5; gz <= 5; gz++) {
        const x = gx * 14 + (rand() - 0.5) * 3;
        const z = gz * 14 + (rand() - 0.5) * 3;
        if (Math.abs(x) < 36 && Math.abs(z) < 31) continue;
        if (Math.abs(x) < 9 || Math.abs(z) < 9) continue; // avenues
        const far = Math.hypot(x, z);
        const h = 6 + rand() * (far > 70 ? 34 : 18);
        spots.push([x, z, 7 + rand() * 3, h, 6 + rand() * 4]);
      }
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
    const blocks = new THREE.InstancedMesh(geo, mat, spots.length);
    const palette = [0xe7e2d8, 0xd9dee5, 0xf1d9b5, 0xc9d6df, 0xe8c4a8, 0xdfe6d8];
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z, w, h, d], i) => {
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
      blocks.setMatrixAt(i, m4);
      blocks.setColorAt(i, new THREE.Color(palette[i % palette.length]!));
    });
    blocks.castShadow = blocks.receiveShadow = !phone;
    scene.add(blocks);
    // Windows: a darker band texture on the walls is costly; rooftops instead.
    const roofs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.6, 1),
      new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 0.9 }),
      spots.length,
    );
    spots.forEach(([x, z, w, h, d], i) => {
      m4.compose(
        new THREE.Vector3(x, h + 0.3, z),
        new THREE.Quaternion(),
        new THREE.Vector3(w * 0.4, 1, d * 0.4),
      );
      roofs.setMatrixAt(i, m4);
    });
    scene.add(roofs);

    const trees = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.4, 4, 7).translate(0, 3, 0),
      new THREE.MeshStandardMaterial({ color: 0x4d7c3a, roughness: 0.9 }),
      70,
    );
    let n = 0;
    while (n < 70) {
      const x = (rand() - 0.5) * 150;
      const z = (rand() - 0.5) * 150;
      const nearRing = Math.abs(x) < RING.hx + 8 && Math.abs(z) < RING.hz + 8;
      const outerOk = Math.abs(x) > 9 && Math.abs(z) > 9;
      const besideRing = nearRing && (Math.abs(x) > RING.hx + 4.5 || Math.abs(z) > RING.hz + 4.5);
      if (!(besideRing && outerOk)) continue;
      const s = 0.7 + rand() * 0.6;
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      trees.setMatrixAt(n++, m4);
    }
    trees.castShadow = !phone;
    scene.add(trees);
  }

  // ----- the construction site
  const site = new THREE.Group();
  scene.add(site);
  {
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), M.dirt);
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
    // A slab stack for the crane.
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 1.6), M.concrete);
      s.position.set(12, 0.15 + i * 0.27, -9);
      s.castShadow = !phone;
      site.add(s);
    }
  }

  // ----- machines
  const rig = new Rig(M);
  const dirtParticles = new Debris(phone ? 40 : 90, 0x7a5434, 0.16, 0.1);
  scene.add(dirtParticles.points);
  const updaters: ((t: number, dt: number) => void)[] = [];
  const pickables: THREE.Object3D[] = [];
  const anchors = new Map<WorldKind, THREE.Object3D>();
  const labelMats: THREE.SpriteMaterial[] = [];

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
    pickables.push(label);
    if (!anchors.has(kind)) anchors.set(kind, root);
  }

  // Excavator loading a dump truck on the site.
  const truck1 = makeDumpTruck(rig);
  truck1.root.position.set(6.35, 0, 10.05);
  truck1.root.rotation.y = 0;
  const backhoe = makeBackhoe(rig, dirtParticles, truck1);
  backhoe.root.position.set(9, 0, 6);
  scene.add(truck1.root, backhoe.root);
  updaters.push(backhoe.update);
  tag(backhoe.root, 'excavator', 6.2, 'на линии · работает');

  // Crane lifting slabs from the stack onto the frame.
  {
    const crane = makeCrane(rig, 1.1, 8.9);
    crane.root.position.set(4, 0, -1);
    crane.root.rotation.y = Math.PI * 0.08;
    scene.add(crane.root);
    updaters.push((t, dt) => crane.update(t, dt));
    tag(crane.root, 'crane', 7.5, 'на линии · монтаж');
  }

  // Aerial platform at the frame's west face.
  {
    const agp = makeAgp(rig);
    agp.root.position.set(-14, 0, -12.5);
    scene.add(agp.root);
    updaters.push((t, dt) => agp.update(t, dt));
    tag(agp.root, 'agp', 5.5, 'на линии · фасад');
  }

  // Machines driving the ring road «на линии».
  const drivers: {
    root: THREE.Object3D;
    wheels: THREE.Object3D[];
    offset: number;
    speed: number;
  }[] = [];
  const drive = (offset: number, speed: number, sub: string) => {
    const t = makeDumpTruck(rig);
    t.root.scale.setScalar(0.85);
    scene.add(t.root);
    tag(t.root, 'dump', 5.8, sub);
    drivers.push({ root: t.root, wheels: t.wheels, offset, speed });
  };
  drive(0, 5.5, 'на линии · свободен');
  drive(55, 4.5, 'на линии · едет к заказу');
  drive(110, 5, 'на линии · свободен');
  updaters.push((t) => {
    for (const d of drivers) {
      const s = d.offset + t * d.speed;
      const p = ringPoint(s);
      // Right-hand traffic: keep to the outer lane.
      const nx = Math.sin(p.yaw);
      const nz = Math.cos(p.yaw);
      d.root.position.set(p.x + nx * 1.2, 0.02, p.z + nz * 1.2);
      d.root.rotation.y = p.yaw;
      for (const w of d.wheels) w.rotation.z = -s / 0.55;
    }
  });
  rig.bake({ cast: !phone, receive: false });

  // ----- camera: slow orbit, horizontal drag
  const target = new THREE.Vector3(0, 2, 0);
  const focusTarget = new THREE.Vector3(0, 2, 0);
  let azimuth = 0.7;
  let autoSpin = !still;
  const radius = phone ? 46 : 58;
  const height = 30;
  function placeCamera() {
    target.lerp(focusTarget, 0.08);
    camera.position.set(
      target.x + Math.sin(azimuth) * radius,
      height,
      target.z + Math.cos(azimuth) * radius,
    );
    camera.lookAt(target);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.2 ? 50 : 40;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(() => {
    resize();
    if (!running) frame(0);
  });
  ro.observe(canvas);
  resize();

  // ----- picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: { x: number; y: number; az: number } | null = null;
  let dragged = false;
  function onDown(e: PointerEvent) {
    down = { x: e.clientX, y: e.clientY, az: azimuth };
    dragged = false;
  }
  function onMove(e: PointerEvent) {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 6) {
      dragged = true;
      autoSpin = false;
      azimuth = down.az - dx * 0.006;
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
      focus(kind);
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
    focusTarget.y = 2;
    // Pull the focus halfway, so the district stays in the frame.
    focusTarget.multiplyScalar(0.6);
    autoSpin = false;
    if (!running) {
      target.copy(focusTarget);
      frame(0);
    }
  }

  // ----- loop
  let running = false;
  let raf = 0;
  let time = 3; // start mid-cycle: the crane already holds a slab
  let last = 0;
  let sampled = 0;
  let sampleMs = 0;
  let slowReported = false;
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
    placeCamera();
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
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
