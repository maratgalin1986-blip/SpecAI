import * as THREE from 'three';

// Animated 3D hero scene: a rotating cast of construction machines on a
// floating platform. The active machine drives towards the pointer, turns its
// cab/boom to "look" at it and lights it up with its headlights; left alone it
// wanders and does its job (digs, lifts, dumps, pushes). Imported dynamically
// from Hero3D so three.js stays out of the main bundle.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AMBER = 0xf59e0b;

function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function approachAngle(current: number, target: number, maxStep: number) {
  const diff = wrapAngle(target - current);
  return current + Math.max(-maxStep, Math.min(maxStep, diff));
}

function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Piecewise pose interpolation over a looping list of keyframes. */
function cycle<T extends Record<string, number>>(poses: T[], time: number, seconds: number): T {
  const t = (time / seconds) % poses.length;
  const index = Math.floor(t);
  const a = poses[index] ?? poses[0]!;
  const b = poses[(index + 1) % poses.length] ?? poses[0]!;
  const k = smooth(t - index);
  const out = {} as Record<string, number>;
  for (const key of Object.keys(a)) out[key] = lerp(a[key]!, b[key]!, k);
  return out as T;
}

function createMaterials() {
  return {
    paint: new THREE.MeshStandardMaterial({ color: AMBER, metalness: 0.3, roughness: 0.45 }),
    paintDark: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.4 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.25 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.05,
      transparent: true,
      opacity: 0.75,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.3,
    }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xfff7d6,
      emissive: 0xfff1b8,
      emissiveIntensity: 3,
    }),
    beacon: new THREE.MeshStandardMaterial({
      color: 0xff7a00,
      emissive: 0xff7a00,
      emissiveIntensity: 2,
    }),
  };
}
type Materials = ReturnType<typeof createMaterials>;

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A wheel that rolls about its local z axis; returns the spinning group. */
function wheel(m: Materials, radius: number, width: number, x: number, y: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20), m.rubber);
  tyre.rotation.x = Math.PI / 2;
  tyre.castShadow = true;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.02, 6),
    m.chrome,
  );
  hub.rotation.x = Math.PI / 2;
  group.add(tyre, hub);
  return group;
}

function headlights(m: Materials, parent: THREE.Object3D, x: number, y: number, zs: number[]) {
  for (const z of zs) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), m.lamp);
    lamp.position.set(x, y, z);
    parent.add(lamp);
  }
  const anchor = new THREE.Object3D();
  anchor.position.set(x + 0.05, y, 0);
  parent.add(anchor);
  return anchor;
}

function beacon(m: Materials, parent: THREE.Object3D, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), m.beacon);
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

function tracks(m: Materials, root: THREE.Group, length: number, zs: number[]) {
  const rollers: THREE.Object3D[] = [];
  for (const z of zs) {
    root.add(box(length, 0.55, 0.5, m.steel, 0, 0.28, z));
    const count = Math.round(length / 0.7);
    for (let i = 0; i < count; i++) {
      const roller = wheel(m, 0.2, 0.52, -length / 2 + 0.35 + i * 0.7, 0.28, z);
      rollers.push(roller);
      root.add(roller);
    }
  }
  return rollers;
}

// ---------------------------------------------------------------------------
// Machines
//
// Convention: every machine faces +x in its local space. The scene "driver"
// positions and rotates `root`; the machine animates its own parts in update().
// ---------------------------------------------------------------------------

interface MachineContext {
  time: number;
  dt: number;
  /** 0 while driving, easing to 1 once stopped — blends travel pose → work. */
  work: number;
  moving: boolean;
  /** Direction to the look target, relative to the machine's heading. */
  lookYaw: number;
  emit(origin: THREE.Vector3, count: number, spread: number): void;
}

interface Machine {
  name: string;
  root: THREE.Group;
  wheels: THREE.Object3D[];
  wheelRadius: number;
  lightAnchor: THREE.Object3D;
  /** Machines with a turret look at the target with it; others turn in place. */
  hasTurret: boolean;
  update(ctx: MachineContext): void;
}

function buildExcavator(m: Materials): Machine {
  const root = new THREE.Group();
  const wheels = tracks(m, root, 2.8, [-0.75, 0.75]);

  const turret = new THREE.Group();
  turret.position.y = 0.6;
  root.add(turret);
  turret.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.2, 24), m.steel));
  turret.add(box(2.2, 0.75, 1.6, m.paint, -0.3, 0.5, 0));
  turret.add(box(0.5, 0.6, 1.6, m.paintDark, -1.4, 0.45, 0));
  turret.add(box(0.9, 0.9, 0.8, m.paint, 0.35, 1.3, 0.35));
  turret.add(box(0.05, 0.6, 0.65, m.glass, 0.82, 1.35, 0.35));
  turret.add(box(0.6, 0.5, 0.05, m.glass, 0.35, 1.4, 0.77));
  beacon(m, turret, 0.35, 1.82, 0.35);
  const lightAnchor = headlights(m, turret, 0.83, 1.0, [0.12, 0.58]);

  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.7, 0.8, -0.3);
  turret.add(boomPivot);
  boomPivot.add(box(2.4, 0.32, 0.34, m.paint, 1.2, 0, 0));
  const armPivot = new THREE.Group();
  armPivot.position.x = 2.4;
  boomPivot.add(armPivot);
  armPivot.add(box(1.7, 0.24, 0.28, m.paintDark, 0.85, 0, 0));
  const bucketPivot = new THREE.Group();
  bucketPivot.position.x = 1.7;
  armPivot.add(bucketPivot);
  bucketPivot.add(box(0.5, 0.08, 0.6, m.steel, 0.25, 0, 0));
  bucketPivot.add(box(0.08, 0.45, 0.6, m.steel, 0.5, -0.2, 0));
  const tip = new THREE.Object3D();
  tip.position.set(0.4, -0.3, 0);
  bucketPivot.add(tip);

  const travel = { boom: 0.55, arm: -1.25, bucket: -1.0 };
  const poses = [
    { boom: 0.1, arm: -0.5, bucket: 0.3 },
    { boom: -0.28, arm: -1.35, bucket: -0.9 },
    { boom: 0.6, arm: -1.1, bucket: -1.15 },
    { boom: 0.45, arm: -0.55, bucket: 0.8 },
  ];
  let workTime = 0;
  const tipWorld = new THREE.Vector3();

  return {
    name: 'Экскаватор',
    root,
    wheels,
    wheelRadius: 0.2,
    lightAnchor,
    hasTurret: true,
    update(ctx) {
      turret.rotation.y = damp(turret.rotation.y, ctx.lookYaw, 4, ctx.dt);
      if (!ctx.moving) workTime += ctx.dt;
      const p = cycle(poses, workTime, 1.3);
      boomPivot.rotation.z = lerp(travel.boom, p.boom, ctx.work);
      armPivot.rotation.z = lerp(travel.arm, p.arm, ctx.work);
      bucketPivot.rotation.z = lerp(travel.bucket, p.bucket, ctx.work);
      const segment = Math.floor((workTime / 1.3) % poses.length);
      if (ctx.work > 0.8 && (segment === 1 || segment === 3) && Math.random() < 0.6) {
        ctx.emit(tip.getWorldPosition(tipWorld), 2, 0.4);
      }
    },
  };
}

function buildCrane(m: Materials): Machine {
  const root = new THREE.Group();
  root.add(box(3.6, 0.5, 1.3, m.steel, 0, 0.75, 0));
  root.add(box(0.7, 0.8, 1.2, m.paint, 1.45, 1.35, 0));
  root.add(box(0.05, 0.5, 1.0, m.glass, 1.81, 1.45, 0));
  const lightAnchor = headlights(m, root, 1.82, 1.05, [-0.4, 0.4]);
  beacon(m, root, 1.45, 1.8, 0);

  const wheels: THREE.Object3D[] = [];
  for (const x of [1.2, -0.4, -1.2]) {
    for (const z of [-0.62, 0.62]) {
      const w = wheel(m, 0.38, 0.3, x, 0.38, z);
      wheels.push(w);
      root.add(w);
    }
  }

  const outriggers: { beam: THREE.Mesh; side: number }[] = [];
  for (const x of [1.0, -1.5]) {
    for (const side of [-1, 1]) {
      const beam = box(0.18, 0.18, 0.9, m.paintDark, x, 0.6, side * 0.5);
      beam.add(box(0.3, 0.5, 0.3, m.steel, 0, -0.25, side * 0.45));
      outriggers.push({ beam, side });
      root.add(beam);
    }
  }

  const turret = new THREE.Group();
  turret.position.set(-0.5, 1.0, 0);
  root.add(turret);
  turret.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 24), m.steel));
  turret.add(box(1.6, 0.5, 1.1, m.paint, -0.3, 0.3, 0));
  turret.add(box(0.6, 0.6, 0.45, m.paint, 0.25, 0.7, 0.55));
  turret.add(box(0.05, 0.4, 0.35, m.glass, 0.56, 0.75, 0.55));
  turret.add(box(0.5, 0.6, 1.1, m.paintDark, -1.2, 0.4, 0));

  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.4, 0.55, -0.1);
  turret.add(boomPivot);
  boomPivot.add(box(2.6, 0.36, 0.36, m.paint, 1.3, 0, 0));
  const inner = box(2.4, 0.26, 0.26, m.paintDark, 1.2, 0, 0);
  boomPivot.add(inner);
  const hanger = new THREE.Group();
  hanger.position.x = 1.2;
  inner.add(hanger);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), m.chrome);
  hanger.add(rope);
  const hook = new THREE.Group();
  hook.add(box(0.25, 0.3, 0.25, m.paint));
  const hookCurve = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.03, 8, 16, Math.PI * 1.4),
    m.steel,
  );
  hookCurve.position.y = -0.25;
  hook.add(hookCurve);
  hanger.add(hook);

  let workTime = 0;
  return {
    name: 'Автокран',
    root,
    wheels,
    wheelRadius: 0.38,
    lightAnchor,
    hasTurret: true,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      // The boom rests forward while driving and tracks the target once parked.
      turret.rotation.y = damp(turret.rotation.y, ctx.work > 0.5 ? ctx.lookYaw : 0, 2.5, ctx.dt);
      const elevation = lerp(0.05, 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(workTime * 0.7)), ctx.work);
      boomPivot.rotation.z = elevation;
      inner.position.x = 1.2 + 1.3 * ctx.work * (0.5 + 0.5 * Math.sin(workTime * 0.5));
      const ropeLength = 0.35 + ctx.work * (0.4 + 0.9 * (0.5 + 0.5 * Math.sin(workTime * 0.9 + 1)));
      hanger.rotation.z = -elevation + Math.sin(ctx.time * 1.8) * (0.05 + 0.1 * ctx.work);
      rope.scale.y = ropeLength;
      rope.position.y = -ropeLength / 2;
      hook.position.y = -ropeLength - 0.15;
      for (const { beam, side } of outriggers) beam.position.z = side * (0.5 + 0.55 * ctx.work);
    },
  };
}

function buildLoader(m: Materials): Machine {
  const root = new THREE.Group();
  root.add(box(1.5, 0.9, 1.3, m.paint, -0.65, 1.0, 0));
  root.add(box(0.6, 0.6, 1.1, m.paintDark, -1.3, 0.95, 0));
  root.add(box(0.9, 0.9, 1.1, m.paint, 0.05, 1.8, 0));
  root.add(box(0.05, 0.65, 0.95, m.glass, 0.51, 1.85, 0));
  root.add(box(0.9, 0.55, 0.05, m.glass, 0.05, 1.85, 0.56));
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 10), m.chrome);
  exhaust.position.set(-1.1, 1.75, 0.35);
  root.add(exhaust);
  root.add(box(0.9, 0.5, 0.9, m.steel, 0.85, 0.85, 0));
  beacon(m, root, 0.05, 2.3, 0);
  const lightAnchor = headlights(m, root, 0.52, 2.1, [-0.35, 0.35]);

  const wheels: THREE.Object3D[] = [];
  for (const x of [-0.95, 0.9]) {
    for (const z of [-0.75, 0.75]) {
      const w = wheel(m, 0.5, 0.4, x, 0.5, z);
      wheels.push(w);
      root.add(w);
    }
  }

  const arms = new THREE.Group();
  arms.position.set(0.9, 1.2, 0);
  root.add(arms);
  for (const z of [-0.45, 0.45]) arms.add(box(1.5, 0.18, 0.14, m.paintDark, 0.75, 0, z));
  const bucket = new THREE.Group();
  bucket.position.x = 1.5;
  arms.add(bucket);
  bucket.add(box(0.08, 0.6, 1.5, m.steel, 0.1, -0.1, 0));
  bucket.add(box(0.55, 0.08, 1.5, m.steel, 0.35, -0.4, 0));
  for (const z of [-0.75, 0.75]) bucket.add(box(0.55, 0.5, 0.05, m.steel, 0.35, -0.15, z));
  const tip = new THREE.Object3D();
  tip.position.set(0.6, -0.3, 0);
  bucket.add(tip);

  const travel = { arms: -0.3, bucket: 0.4 };
  const poses = [
    { arms: -0.55, bucket: 0 },
    { arms: -0.5, bucket: 0.5 },
    { arms: 0.55, bucket: 0.45 },
    { arms: 0.55, bucket: -0.9 },
  ];
  let workTime = 0;
  const tipWorld = new THREE.Vector3();

  return {
    name: 'Фронтальный погрузчик',
    root,
    wheels,
    wheelRadius: 0.5,
    lightAnchor,
    hasTurret: false,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      const p = cycle(poses, workTime, 1.2);
      arms.rotation.z = lerp(travel.arms, p.arms, ctx.work);
      bucket.rotation.z = lerp(travel.bucket, p.bucket, ctx.work);
      const segment = Math.floor((workTime / 1.2) % poses.length);
      if (ctx.work > 0.8 && segment === 3 && Math.random() < 0.8) {
        ctx.emit(tip.getWorldPosition(tipWorld), 3, 0.8);
      }
    },
  };
}

function buildDumpTruck(m: Materials): Machine {
  const root = new THREE.Group();
  root.add(box(3.8, 0.35, 1.1, m.steel, 0, 0.75, 0));
  root.add(box(1.0, 1.1, 1.4, m.paint, 1.4, 1.45, 0));
  root.add(box(0.05, 0.55, 1.2, m.glass, 1.91, 1.65, 0));
  root.add(box(0.2, 0.3, 1.5, m.chrome, 1.95, 0.85, 0));
  beacon(m, root, 1.4, 2.08, 0);
  const lightAnchor = headlights(m, root, 1.92, 1.1, [-0.5, 0.5]);

  const wheels: THREE.Object3D[] = [];
  for (const x of [1.3, -0.9, -1.6]) {
    for (const z of [-0.65, 0.65]) {
      const w = wheel(m, 0.45, 0.35, x, 0.45, z);
      wheels.push(w);
      root.add(w);
    }
  }

  const bed = new THREE.Group();
  bed.position.set(-1.9, 1.0, 0);
  root.add(bed);
  bed.add(box(2.8, 0.1, 1.5, m.paintDark, 1.4, 0, 0));
  for (const z of [-0.72, 0.72]) bed.add(box(2.8, 0.7, 0.06, m.paint, 1.4, 0.35, z));
  bed.add(box(0.1, 0.9, 1.5, m.paint, 2.8, 0.45, 0));
  const load = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.7, 20), m.soil);
  load.scale.set(1.6, 1, 0.9);
  load.position.set(1.4, 0.4, 0);
  load.castShadow = true;
  bed.add(load);
  const spout = new THREE.Object3D();
  spout.position.set(-0.1, 0, 0);
  bed.add(spout);

  let workTime = 0;
  const spoutWorld = new THREE.Vector3();
  return {
    name: 'Самосвал',
    root,
    wheels,
    wheelRadius: 0.45,
    lightAnchor,
    hasTurret: false,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      // hold → raise → hold → lower, 6 seconds per dump.
      const t = workTime % 6;
      const raise =
        t < 1.2 ? 0 : t < 2.8 ? smooth((t - 1.2) / 1.6) : t < 4.2 ? 1 : 1 - smooth((t - 4.2) / 1.6);
      const tilt = 0.85 * raise * ctx.work;
      bed.rotation.z = tilt;
      const emptied = t < 1.2 ? 0 : t < 4.2 ? smooth((t - 1.6) / 2.2) : 1 - smooth((t - 4.4) / 1.4);
      const remaining = Math.max(0.05, 1 - emptied * ctx.work);
      load.scale.set(1.6 * remaining, remaining, 0.9 * remaining);
      load.position.x = 1.4 - 0.8 * emptied * ctx.work;
      if (tilt > 0.45 && t < 4.2 && Math.random() < 0.9) {
        ctx.emit(spout.getWorldPosition(spoutWorld), 3, 0.9);
      }
    },
  };
}

function buildBulldozer(m: Materials): Machine {
  const root = new THREE.Group();
  const wheels = tracks(m, root, 2.4, [-0.7, 0.7]);
  root.add(box(1.8, 0.8, 1.2, m.paint, -0.1, 0.95, 0));
  root.add(box(0.8, 0.5, 1.0, m.paintDark, 0.7, 0.85, 0));
  root.add(box(0.9, 0.8, 1.0, m.paint, -0.45, 1.75, 0));
  root.add(box(0.05, 0.55, 0.85, m.glass, 0.01, 1.8, 0));
  root.add(box(0.8, 0.5, 0.05, m.glass, -0.45, 1.8, 0.51));
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 10), m.chrome);
  exhaust.position.set(0.5, 1.4, 0.3);
  root.add(exhaust);
  beacon(m, root, -0.45, 2.22, 0);
  const lightAnchor = headlights(m, root, 0.02, 2.05, [-0.35, 0.35]);

  const bladeArm = new THREE.Group();
  bladeArm.position.set(0.3, 0.65, 0);
  root.add(bladeArm);
  for (const z of [-0.62, 0.62]) bladeArm.add(box(1.1, 0.14, 0.14, m.steel, 0.55, 0, z));
  const blade = box(0.16, 0.85, 2.0, m.paintDark, 1.2, 0.05, 0);
  blade.add(box(0.1, 0.08, 2.0, m.chrome, 0.06, -0.42, 0));
  bladeArm.add(blade);
  const edge = new THREE.Object3D();
  edge.position.set(1.4, -0.35, 0);
  bladeArm.add(edge);

  const ripper = new THREE.Group();
  ripper.position.set(-1.1, 0.8, 0);
  root.add(ripper);
  ripper.add(box(0.5, 0.12, 0.8, m.steel, -0.25, 0, 0));
  ripper.add(box(0.1, 0.6, 0.1, m.steel, -0.45, -0.3, 0));

  let workTime = 0;
  const edgeWorld = new THREE.Vector3();
  return {
    name: 'Бульдозер',
    root,
    wheels,
    wheelRadius: 0.2,
    lightAnchor,
    hasTurret: false,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      // Blade down to push while driving; raise/lower and rip once parked.
      const parked = 0.1 + 0.12 * Math.sin(workTime * 2.2);
      bladeArm.rotation.z = lerp(-0.12, parked, ctx.work);
      ripper.rotation.z = ctx.work * 0.35 * (0.5 + 0.5 * Math.sin(workTime * 1.5));
      if (ctx.moving && Math.random() < 0.9) ctx.emit(edge.getWorldPosition(edgeWorld), 2, 1.6);
    },
  };
}

const BUILDERS = [buildExcavator, buildCrane, buildLoader, buildDumpTruck, buildBulldozer];

const LAST_SHOWN_KEY = 'specplast16:last-machine';

/** Random order that never starts with the machine shown on the last visit. */
function shuffledOrder(count: number) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  let last: number | null = null;
  try {
    const stored = window.localStorage.getItem(LAST_SHOWN_KEY);
    last = stored === null ? null : Number(stored);
  } catch {
    // Storage unavailable (private mode etc.) — plain random order is fine.
  }
  if (count > 1 && order[0] === last) order.push(order.shift()!);
  return order;
}

function rememberShown(index: number) {
  try {
    window.localStorage.setItem(LAST_SHOWN_KEY, String(index));
  } catch {
    // Ignore — only used to vary the first machine between visits.
  }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export interface MachinesScene {
  machines: string[];
  current: number;
  show(index: number): void;
  setPointer(clientX: number, clientY: number): void;
  setRunning(running: boolean): void;
  dispose(): void;
}

const PLATFORM_RADIUS = 4.6;
const DRIVE_RADIUS = 2.4;
const SWITCH_SECONDS = 13;

export function createMachinesScene(
  container: HTMLElement,
  options: { reducedMotion: boolean; onChange?: (index: number) => void },
): MachinesScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0f172a, 16, 32);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const cameraBase = new THREE.Vector3(9.5, 6.2, 10.5);
  const lookAt = new THREE.Vector3(0.3, 0.9, 0);

  scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(6, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
  scene.add(sun);
  const rim = new THREE.PointLight(AMBER, 30, 20);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  // Headlight beam that follows whatever the machine is looking at.
  const beam = new THREE.SpotLight(0xfff1c1, 60, 14, 0.38, 0.6, 1.4);
  const beamTarget = new THREE.Object3D();
  beam.target = beamTarget;
  scene.add(beam, beamTarget);

  // Platform.
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS + 0.4, 0.6, 64),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }),
  );
  platform.position.y = -0.3;
  platform.receiveShadow = true;
  scene.add(platform);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(PLATFORM_RADIUS + 0.05, 0.04, 8, 128),
    new THREE.MeshBasicMaterial({ color: AMBER }),
  );
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);
  const grid = new THREE.GridHelper(9, 18, AMBER, 0x475569);
  grid.position.y = 0.01;
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.25;
  scene.add(grid);

  // Traffic cones around the edge.
  const coneMaterial = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.3;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 12), coneMaterial);
    cone.position.set(Math.cos(angle) * 4.2, 0.2, Math.sin(angle) * 4.2);
    cone.castShadow = true;
    scene.add(cone);
  }

  // Target reticle under the pointer.
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.42, 40),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0, depthWrite: false }),
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.position.y = 0.03;
  scene.add(reticle);
  const reticleMaterial = reticle.material as THREE.MeshBasicMaterial;

  // Floating wireframe shapes.
  const shapes: THREE.Mesh[] = [];
  const shapeGeometries = [
    new THREE.OctahedronGeometry(0.45),
    new THREE.IcosahedronGeometry(0.4),
    new THREE.TetrahedronGeometry(0.5),
  ];
  for (let i = 0; i < 7; i++) {
    const mesh = new THREE.Mesh(
      shapeGeometries[i % shapeGeometries.length],
      new THREE.MeshBasicMaterial({
        color: i % 2 ? AMBER : 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
      }),
    );
    // Spread around the platform, but never between the camera and the machine.
    const cameraAngle = Math.atan2(cameraBase.z, cameraBase.x);
    const angle = cameraAngle + 0.9 + (i / 6) * (Math.PI * 2 - 1.8);
    mesh.position.set(Math.cos(angle) * 7.5, 3 + (i % 3) * 1.1, Math.sin(angle) * 7.5);
    mesh.userData.phase = i * 0.9;
    shapes.push(mesh);
    scene.add(mesh);
  }

  // Dust particles.
  const PARTICLES = 240;
  const positions = new Float32Array(PARTICLES * 3);
  const particles = Array.from({ length: PARTICLES }, () => ({
    position: new THREE.Vector3(0, -100, 0),
    velocity: new THREE.Vector3(),
    life: 0,
  }));
  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new THREE.BufferAttribute(positions, 3);
  dustGeometry.setAttribute('position', dustPositions);
  scene.add(
    new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        color: 0xd6a36a,
        size: 0.09,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    ),
  );
  let nextParticle = 0;
  function emit(origin: THREE.Vector3, count: number, spread: number) {
    for (let n = 0; n < count; n++) {
      const particle = particles[nextParticle];
      nextParticle = (nextParticle + 1) % PARTICLES;
      if (!particle) continue;
      particle.position.set(
        origin.x + (Math.random() - 0.5) * spread,
        Math.max(0.05, origin.y),
        origin.z + (Math.random() - 0.5) * spread,
      );
      particle.velocity.set(
        (Math.random() - 0.5) * 0.9,
        Math.random() * 1.3 - 0.3,
        (Math.random() - 0.5) * 0.9,
      );
      particle.life = 1;
    }
  }

  // Machines.
  const materials = createMaterials();
  const machines = BUILDERS.map((build) => build(materials));
  const order = shuffledOrder(machines.length);
  let current = order[0] ?? 0;
  rememberShown(current);
  let activeMachine = machines[current]!;
  scene.add(activeMachine.root);

  const drive = {
    position: new THREE.Vector3(0, 0, 0),
    yaw: Math.random() * Math.PI * 2,
    speed: 0,
    work: 1,
    wanderTarget: new THREE.Vector3(),
    wanderUntil: 0,
  };

  let transition: { phase: 'out' | 'in'; t: number; next: number } | null = null;
  // Switching runs on wall-clock time so slow devices don't switch late.
  let wallTime = 0;
  let autoSwitchAt = SWITCH_SECONDS;

  // Pointer → point on the ground plane.
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointerNdc = new THREE.Vector2();
  const pointerGround = new THREE.Vector3();
  let hasPointer = false;
  let pointerActiveUntil = -1;

  function updatePointerGround() {
    raycaster.setFromCamera(pointerNdc, camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, pointerGround);
    if (!hit || hit.length() > 30) {
      // Pointer above the horizon: look in its direction instead.
      const dir = raycaster.ray.direction;
      pointerGround.set(dir.x, 0, dir.z).normalize().multiplyScalar(12);
    }
  }

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const clock = new THREE.Clock();
  let elapsed = 0;
  let running = true;
  let frame = 0;
  const smoothPointer = { x: 0, y: 0 };
  const followTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const anchorWorld = new THREE.Vector3();

  function startTransition(next: number) {
    if (next === current || transition?.next === next) return;
    autoSwitchAt = wallTime + SWITCH_SECONDS;
    if (options.reducedMotion) {
      swapTo(next);
      activeMachine.root.scale.setScalar(1);
      render();
      return;
    }
    transition = { phase: 'out', t: 0, next };
  }

  function swapTo(next: number) {
    scene.remove(activeMachine.root);
    current = next;
    activeMachine = machines[current]!;
    scene.add(activeMachine.root);
    drive.work = 1;
    drive.speed = 0;
    emit(drive.position.clone().setY(0.2), 40, 2.5);
    rememberShown(current);
    options.onChange?.(current);
  }

  function render() {
    const rawDelta = clock.getDelta();
    const dt = Math.min(rawDelta, 0.05);
    wallTime += Math.min(rawDelta, 1);
    const animate = !options.reducedMotion;
    if (animate) elapsed += dt;

    camera.position.set(
      cameraBase.x + smoothPointer.x * 1.6,
      cameraBase.y + smoothPointer.y * 0.8,
      cameraBase.z - smoothPointer.x * 1.0,
    );
    if (camera.aspect < 1) camera.position.multiplyScalar(1.3);
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();

    // --- Choose where to go and what to look at. -------------------------
    const pointerActive = animate && hasPointer && elapsed < pointerActiveUntil;
    if (pointerActive) {
      updatePointerGround();
      lookTarget.copy(pointerGround);
      // Approach the pointer but stop short of it, inside the drive area.
      followTarget.copy(pointerGround);
      if (followTarget.length() > DRIVE_RADIUS) followTarget.setLength(DRIVE_RADIUS);
    } else {
      if (elapsed > drive.wanderUntil) {
        const angle = Math.random() * Math.PI * 2;
        drive.wanderTarget
          .set(Math.cos(angle), 0, Math.sin(angle))
          .multiplyScalar(Math.random() * 1.8);
        drive.wanderUntil = elapsed + 5 + Math.random() * 4;
      }
      followTarget.copy(drive.wanderTarget);
      lookTarget.set(
        drive.position.x + Math.cos(elapsed * 0.3) * 5,
        0,
        drive.position.z - Math.sin(elapsed * 0.3) * 5,
      );
    }

    // --- Drive. ------------------------------------------------------------
    const dx = followTarget.x - drive.position.x;
    const dz = followTarget.z - drive.position.z;
    const distance = Math.hypot(dx, dz);
    const stopDistance = pointerActive ? 1.9 : 0.3;
    const toPointer = Math.hypot(lookTarget.x - drive.position.x, lookTarget.z - drive.position.z);
    const wantsToMove =
      animate && !transition && distance > stopDistance && (!pointerActive || toPointer > 2.3);
    let moving = false;
    if (wantsToMove) {
      const heading = Math.atan2(-dz, dx);
      drive.yaw = approachAngle(drive.yaw, heading, dt * 2.4);
      const aligned = Math.abs(wrapAngle(heading - drive.yaw)) < 0.6;
      drive.speed = damp(drive.speed, aligned ? Math.min(1.8, distance * 1.2) : 0.3, 3, dt);
      moving = true;
    } else {
      drive.speed = damp(drive.speed, 0, 5, dt);
    }
    drive.position.x += Math.cos(drive.yaw) * drive.speed * dt;
    drive.position.z -= Math.sin(drive.yaw) * drive.speed * dt;
    drive.work = damp(drive.work, moving ? 0 : 1, moving ? 6 : 1.5, dt);

    const lookHeading = Math.atan2(
      -(lookTarget.z - drive.position.z),
      lookTarget.x - drive.position.x,
    );
    let lookYaw = wrapAngle(lookHeading - drive.yaw);
    if (!moving && !activeMachine.hasTurret && animate && Math.abs(lookYaw) > 0.2) {
      // No turret: turn the whole machine in place to face the target.
      drive.yaw = approachAngle(drive.yaw, lookHeading, dt * 1.6);
      lookYaw = wrapAngle(lookHeading - drive.yaw);
    }

    const machine = activeMachine;
    for (const w of machine.wheels) w.rotation.z -= (drive.speed * dt) / machine.wheelRadius;
    machine.root.position.set(
      drive.position.x,
      moving ? Math.abs(Math.sin(elapsed * 18)) * 0.015 : 0,
      drive.position.z,
    );

    // --- Switching machines. ----------------------------------------------
    let spin = 0;
    if (transition) {
      transition.t += dt / (transition.phase === 'out' ? 0.45 : 0.75);
      if (transition.phase === 'out') {
        machine.root.scale.setScalar(Math.max(0.001, 1 - smooth(transition.t)));
        spin = smooth(transition.t) * Math.PI;
        if (transition.t >= 1) {
          swapTo(transition.next);
          transition = { phase: 'in', t: 0, next: transition.next };
          activeMachine.root.scale.setScalar(0.001);
        }
      } else {
        activeMachine.root.scale.setScalar(Math.max(0.001, easeOutBack(Math.min(1, transition.t))));
        if (transition.t >= 1) transition = null;
      }
    } else if (animate && wallTime > autoSwitchAt) {
      const position = order.indexOf(current);
      startTransition(order[(position + 1) % order.length] ?? 0);
    }
    activeMachine.root.rotation.y = drive.yaw + spin;

    activeMachine.update({
      time: elapsed,
      dt: animate ? dt : 0,
      work: drive.work,
      moving,
      lookYaw,
      emit,
    });
    activeMachine.root.updateMatrixWorld(true);

    // Headlight beam and reticle.
    activeMachine.lightAnchor.getWorldPosition(anchorWorld);
    beam.position.copy(anchorWorld);
    beamTarget.position.copy(lookTarget);
    beam.intensity = damp(beam.intensity, pointerActive ? 80 : 25, 3, dt || 1);
    const reticleOn = pointerActive && pointerGround.length() < PLATFORM_RADIUS;
    reticle.position.set(pointerGround.x, 0.03, pointerGround.z);
    reticleMaterial.opacity = damp(reticleMaterial.opacity, reticleOn ? 0.9 : 0, 8, dt || 1);
    reticle.scale.setScalar(1 + Math.sin(elapsed * 6) * 0.12);

    if (animate) {
      particles.forEach((particle, i) => {
        if (particle.life > 0) {
          particle.life -= dt * 0.7;
          particle.velocity.y -= dt * 1.5;
          particle.position.addScaledVector(particle.velocity, dt);
          particle.position.y = Math.max(0.03, particle.position.y);
          if (particle.life <= 0) particle.position.y = -100;
        }
        dustPositions.setXYZ(i, particle.position.x, particle.position.y, particle.position.z);
      });
      dustPositions.needsUpdate = true;

      for (const shape of shapes) {
        shape.rotation.x += dt * 0.4;
        shape.rotation.y += dt * 0.6;
        shape.position.y += Math.sin(elapsed * 1.2 + (shape.userData.phase as number)) * dt * 0.3;
      }
      ring.rotation.z += dt * 0.2;
      materials.beacon.emissiveIntensity = 1 + Math.max(0, Math.sin(elapsed * 8)) * 3;
    }

    renderer.render(scene, camera);
    if (running && animate) frame = requestAnimationFrame(render);
  }
  render();

  return {
    machines: machines.map((machine) => machine.name),
    get current() {
      return current;
    },
    show(index) {
      if (index >= 0 && index < machines.length) startTransition(index);
    },
    setPointer(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;
      pointerNdc.set(x, y);
      smoothPointer.x = damp(smoothPointer.x, Math.max(-1.5, Math.min(1.5, x)), 1, 0.3);
      smoothPointer.y = damp(smoothPointer.y, Math.max(-1.5, Math.min(1.5, -y)), 1, 0.3);
      hasPointer = true;
      pointerActiveUntil = elapsed + 4;
    },
    setRunning(next) {
      if (next === running) return;
      running = next;
      cancelAnimationFrame(frame);
      if (running) {
        clock.getDelta();
        render();
      }
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      const disposed = new Set<THREE.Material | THREE.BufferGeometry>();
      const disposeObject = (object: THREE.Object3D) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          const materialList = Array.isArray(object.material) ? object.material : [object.material];
          for (const item of [object.geometry, ...materialList] as (
            THREE.Material | THREE.BufferGeometry
          )[]) {
            if (!disposed.has(item)) {
              disposed.add(item);
              item.dispose();
            }
          }
        }
      };
      scene.traverse(disposeObject);
      for (const machine of machines) machine.root.traverse(disposeObject);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
