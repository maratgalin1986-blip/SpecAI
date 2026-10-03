// Procedural low-poly machines and people. Each machine faces +X in its own
// frame; the world places and turns it. Builders add parts to a Rig, the
// caller bakes it, and update(time, dt) animates the hierarchy.
import * as THREE from 'three';
import { Debris, keyframes, node, Rig, smooth, type MatKey } from './kit';
import { HAT, lookFor, makePerson } from './people';

export interface Animated {
  root: THREE.Group;
  update(time: number, dt: number): void;
}

// ---------------------------------------------------------------- people

/** A seated operator merged into a cab node, facing +X. */
function operator(rig: Rig, cab: THREE.Object3D, pos: [number, number, number]) {
  const [x, y, z] = pos;
  rig.box(cab, [0.27, 0.55, 0.44], 'vest', [x, y + 0.28, z]);
  rig.box(cab, [0.22, 0.22, 0.2], 'skin', [x + 0.02, y + 0.68, z]);
  rig.box(cab, [0.26, 0.12, 0.26], 'white', [x + 0.02, y + 0.84, z]);
}

/** Cab: glass block, dark corner posts, a roof and an orange beacon. */
function cab(
  rig: Rig,
  parent: THREE.Object3D,
  pos: [number, number, number],
  size: [number, number, number],
  roof: MatKey = 'yellow',
) {
  const [x, y, z] = pos;
  const [w, h, d] = size;
  rig.box(parent, [w - 0.06, h, d - 0.06], 'glass', [x, y, z]);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      rig.box(parent, [0.09, h, 0.09], 'dark', [x + (sx * w) / 2, y, z + (sz * d) / 2]);
  rig.box(parent, [w + 0.14, 0.12, d + 0.14], roof, [x, y + h / 2 + 0.06, z]);
  rig.box(parent, [0.16, 0.12, 0.16], 'beacon', [x - w / 4, y + h / 2 + 0.18, z + d / 4]);
  operator(rig, parent, [x, y - h / 2 + 0.05, z]);
}

// ---------------------------------------------------------------- dump truck

export interface DumpTruck {
  root: THREE.Group;
  bed: THREE.Group;
  heap: THREE.Group;
  wheels: THREE.Group[];
}

/** KamAZ-like dump truck. The body hinges at the rear (local x = -2.9). */
export function makeDumpTruck(rig: Rig): DumpTruck {
  const root = node(null);
  rig.box(root, [6.3, 0.4, 1.1], 'dark', [0.1, 0.9, 0]);
  rig.box(root, [1.35, 1.55, 2.35], 'yellow', [2.75, 1.95, 0]);
  rig.box(root, [0.06, 0.7, 2.05], 'glass', [3.44, 2.3, 0]);
  rig.box(root, [1.0, 0.55, 0.05], 'glass', [2.8, 2.3, 1.18]);
  rig.box(root, [1.0, 0.55, 0.05], 'glass', [2.8, 2.3, -1.18]);
  rig.box(root, [0.25, 0.35, 2.45], 'dark', [3.45, 1.05, 0]);
  rig.box(root, [0.06, 0.16, 0.3], 'lamp', [3.58, 1.3, 0.85]);
  rig.box(root, [0.06, 0.16, 0.3], 'lamp', [3.58, 1.3, -0.85]);
  rig.box(root, [0.06, 0.14, 0.25], 'tail', [-3.08, 1.0, 0.95]);
  rig.box(root, [0.06, 0.14, 0.25], 'tail', [-3.08, 1.0, -0.95]);
  rig.box(root, [0.16, 0.12, 0.16], 'beacon', [2.6, 2.83, 0.6]);
  operator(rig, root, [2.7, 1.3, 0.45]);
  const wheels: THREE.Group[] = [];
  for (const x of [2.6, -1.3, -2.5]) {
    const axle = node(root, [x, 0.55, 0]);
    rig.wheel(axle, [0, 0, 1.0], 0.55, 0.45);
    rig.wheel(axle, [0, 0, -1.0], 0.55, 0.45);
    wheels.push(axle);
  }
  const bed = node(root, [-2.95, 1.15, 0]);
  rig.box(bed, [4.5, 0.15, 2.4], 'amber', [2.25, 0.1, 0]);
  rig.box(bed, [4.5, 0.95, 0.1], 'amber', [2.25, 0.62, 1.17]);
  rig.box(bed, [4.5, 0.95, 0.1], 'amber', [2.25, 0.62, -1.17]);
  rig.box(bed, [0.14, 1.3, 2.4], 'amber', [4.5, 0.8, 0]);
  rig.box(bed, [0.1, 0.9, 2.3], 'yellow', [0.05, 0.6, 0]);
  rig.box(bed, [0.6, 0.12, 2.42], 'dark', [4.0, 0.0, 0]);
  const heap = node(bed, [2.3, 0.18, 0]);
  rig.heap(heap, 1.9, 0.8, 'dirt', [0, 0, 0]);
  return { root, bed, heap, wheels };
}

// ---------------------------------------------------------------- backhoe

/** JCB-like backhoe loader digging at a pit behind it and loading a dump truck at its side. */
export function makeBackhoe(rig: Rig, dirt: Debris, truck: DumpTruck): Animated {
  const root = node(null);
  rig.box(root, [4.4, 0.7, 1.9], 'dark', [0, 0.95, 0]);
  rig.box(root, [1.7, 0.8, 1.5], 'yellow', [1.25, 1.65, 0]);
  rig.box(root, [0.1, 0.5, 1.1], 'dark', [2.12, 1.55, 0]);
  rig.box(root, [1.5, 0.25, 2.25], 'yellow', [-0.6, 1.32, 0]);
  rig.box(root, [1.8, 0.16, 0.6], 'yellow', [-1.2, 1.72, 1.0]);
  rig.box(root, [1.8, 0.16, 0.6], 'yellow', [-1.2, 1.72, -1.0]);
  rig.box(root, [0.06, 0.14, 0.3], 'lamp', [2.12, 1.95, 0.5]);
  rig.box(root, [0.06, 0.14, 0.3], 'lamp', [2.12, 1.95, -0.5]);
  cab(rig, root, [-0.55, 2.2, 0], [1.5, 1.5, 1.5]);
  rig.wheel(root, [-1.2, 0.78, 1.05], 0.78, 0.5);
  rig.wheel(root, [-1.2, 0.78, -1.05], 0.78, 0.5);
  rig.wheel(root, [1.45, 0.52, 0.95], 0.52, 0.36);
  rig.wheel(root, [1.45, 0.52, -0.95], 0.52, 0.36);
  for (const z of [1.15, -1.15]) {
    rig.box(root, [0.2, 1.2, 0.2], 'dark', [-2.3, 0.62, z], [z > 0 ? -0.25 : 0.25, 0, 0]);
    rig.box(root, [0.55, 0.08, 0.55], 'dark', [-2.3, 0.04, z * 1.25]);
  }
  // Front loader bucket.
  const loader = node(root, [0.3, 1.5, 0]);
  for (const z of [1.0, -1.0])
    rig.box(loader, [2.6, 0.2, 0.16], 'yellow', [1.2, -0.4, z], [0, 0, -0.35]);
  rig.box(loader, [0.7, 0.7, 2.3], 'yellow', [2.65, -0.95, 0]);
  rig.box(loader, [0.1, 0.08, 2.3], 'steel', [3.0, -1.3, 0]);
  // Backhoe arm: swing post → boom → stick → bucket.
  const swing = node(root, [-2.45, 1.25, 0]);
  rig.box(swing, [0.45, 0.65, 0.55], 'dark', [0, 0, 0]);
  const boom = node(swing, [-0.1, 0.1, 0]);
  rig.box(boom, [1.5, 0.34, 0.28], 'yellow', [-0.7, 0.12, 0], [0, 0, 0.15]);
  rig.box(boom, [1.4, 0.3, 0.28], 'yellow', [-2.0, 0.12, 0], [0, 0, -0.1]);
  rig.box(boom, [1.6, 0.1, 0.1], 'steel', [-1.0, 0.36, 0], [0, 0, 0.05]);
  const stick = node(boom, [-2.7, 0, 0]);
  rig.box(stick, [2.3, 0.26, 0.24], 'yellow', [-1.15, 0, 0]);
  rig.box(stick, [1.5, 0.09, 0.09], 'steel', [-0.9, 0.2, 0]);
  const bucket = node(stick, [-2.3, 0, 0]);
  rig.box(bucket, [0.65, 0.55, 0.75], 'dark', [-0.25, -0.25, 0]);
  rig.box(bucket, [0.12, 0.12, 0.78], 'steel', [-0.55, -0.55, 0]);
  const pose = [0, 0, 0, 0];
  // [time, swing, boom, stick, bucket]
  const keys = [
    [0, 0, 0.15, 1.2, -0.4],
    [1.8, 0, 0.35, 1.3, 1.1],
    [3.0, 0, -0.8, 2.4, 1.6],
    [4.8, 1.35, -0.8, 1.0, 1.5],
    [5.6, 1.35, -0.8, 1.0, -0.7],
    [6.6, 1.35, -0.8, 1.0, -0.7],
    [8.2, 0, -0.3, 1.5, -0.3],
    [9.2, 0, 0.15, 1.2, -0.4],
  ];
  const tip = new THREE.Vector3();
  let fill = 0.2;
  return {
    root,
    update(time, dt) {
      keyframes(keys, time, pose);
      swing.rotation.y = pose[0]!;
      boom.rotation.z = pose[1]!;
      stick.rotation.z = pose[2]!;
      bucket.rotation.z = pose[3]!;
      loader.rotation.z = Math.sin(time * 0.3) * 0.03;
      const t = time % 9.2;
      if (t > 5.2 && t < 6.4) {
        bucket.localToWorld(tip.set(-0.3, -0.3, 0));
        dirt.emit(tip, 0.5, 2);
        fill = Math.min(1, fill + dt * 0.08);
      }
      if (t > 1.0 && t < 1.8 && Math.random() < 0.3) {
        bucket.localToWorld(tip.set(-0.3, -0.4, 0));
        dirt.emit(tip, 0.6, 1);
      }
      // The truck fills up, then is "swapped" for an empty one between loads.
      if (fill >= 1) fill = 0.2;
      truck.heap.scale.set(1, 0.3 + fill, 1);
    },
  };
}

// ---------------------------------------------------------------- truck crane

export const CRANE = {
  elevation: 0.9,
  boomLength: 16,
  turretX: -2.0,
  turretY: 1.75,
  pivot: [-0.9, 1.3] as const,
  yawA: 0.55,
  yawB: -1.2,
};
/** Horizontal reach and height of the boom tip above the turret base. */
export function craneTip() {
  return {
    reach: CRANE.pivot[0] + CRANE.boomLength * Math.cos(CRANE.elevation),
    height: CRANE.turretY + CRANE.pivot[1] + CRANE.boomLength * Math.sin(CRANE.elevation),
  };
}

export function makeCrane(
  rig: Rig,
  groundA: number,
  groundB: number,
): Animated & { boom: THREE.Group } {
  const root = node(null);
  rig.box(root, [10.5, 0.9, 2.5], 'yellow', [0, 1.25, 0]);
  rig.box(root, [10.6, 0.25, 2.2], 'dark', [0, 0.75, 0]);
  rig.box(root, [1.7, 1.5, 2.5], 'yellow', [4.5, 2.45, 0]);
  rig.box(root, [0.06, 0.75, 2.2], 'glass', [5.36, 2.65, 0]);
  rig.box(root, [0.06, 0.16, 0.35], 'lamp', [5.3, 1.2, 0.9]);
  rig.box(root, [0.06, 0.16, 0.35], 'lamp', [5.3, 1.2, -0.9]);
  for (const x of [3.6, 2.2, -2.4, -3.8]) {
    rig.wheel(root, [x, 0.6, 1.05], 0.6, 0.45);
    rig.wheel(root, [x, 0.6, -1.05], 0.6, 0.45);
  }
  for (const x of [3.0, -4.6])
    for (const s of [1, -1]) {
      rig.box(root, [0.3, 0.3, 2.4], 'yellow', [x, 1.0, s * 2.3]);
      rig.box(root, [0.28, 0.95, 0.28], 'dark', [x, 0.55, s * 3.45]);
      rig.box(root, [0.8, 0.1, 0.8], 'dark', [x, 0.05, s * 3.45]);
    }
  const turret = node(root, [CRANE.turretX, CRANE.turretY, 0]);
  rig.box(turret, [3.4, 1.1, 2.3], 'yellow', [-0.3, 0.55, 0]);
  rig.box(turret, [1.0, 1.1, 2.4], 'dark', [-2.3, 0.65, 0]);
  rig.box(turret, [1.3, 1.4, 0.9], 'glass', [0.9, 1.0, -1.25]);
  rig.box(turret, [1.4, 0.12, 1.0], 'yellow', [0.9, 1.76, -1.25]);
  rig.box(turret, [0.16, 0.12, 0.16], 'beacon', [-1.2, 1.2, 0.8]);
  operator(rig, turret, [0.9, 0.3, -1.25]);
  const [px, py] = CRANE.pivot;
  const e = CRANE.elevation;
  // Luffing cylinder from the turret to 4 m along the boom.
  const ax = 0.7;
  const ay = 0.7;
  const bx = px + 4 * Math.cos(e);
  const by = py + 4 * Math.sin(e);
  rig.box(
    turret,
    [Math.hypot(bx - ax, by - ay), 0.22, 0.22],
    'steel',
    [(ax + bx) / 2, (ay + by) / 2, 0],
    [0, 0, Math.atan2(by - ay, bx - ax)],
  );
  const boom = node(turret, [px, py, 0]);
  boom.rotation.z = e;
  rig.box(boom, [7.2, 0.78, 0.66], 'yellow', [3.4, 0, 0]);
  rig.box(boom, [6.0, 0.6, 0.52], 'yellow', [9.0, 0, 0]);
  rig.box(boom, [4.4, 0.46, 0.4], 'amber', [13.8, 0, 0]);
  rig.cyl(boom, 0.32, 0.3, 'dark', [16, 0, 0], [Math.PI / 2, 0, 0]);
  const tip = craneTip();
  const pend = node(turret, [tip.reach, tip.height - CRANE.turretY, 0]);
  const cable = node(pend);
  rig.cyl(cable, 0.035, 1, 'black', [0, -0.5, 0], [0, 0, 0]);
  const hook = node(pend);
  rig.box(hook, [0.45, 0.65, 0.35], 'yellow', [0, -0.33, 0]);
  rig.cyl(hook, 0.08, 0.35, 'steel', [0, -0.8, 0], [0, 0, 0]);
  const slabY = -2.3;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const end = new THREE.Vector3(sx * 2.6, slabY + 0.15, sz * 0.65);
      const start = new THREE.Vector3(0, -0.95, 0);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const dir = end.clone().sub(start);
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      );
      const rot = new THREE.Euler().setFromQuaternion(quat);
      rig.cyl(hook, 0.02, dir.length(), 'black', [mid.x, mid.y, mid.z], [rot.x, rot.y, rot.z]);
    }
  rig.box(hook, [6, 0.25, 1.6], 'concrete', [0, slabY, 0]);
  // Hook heights (cable length) at the stack, up high, at the frame.
  const hookToSlabBottom = -slabY + 0.125;
  const lowA = tip.height - (groundA + hookToSlabBottom);
  const lowB = tip.height - (groundB + hookToSlabBottom);
  const high = 5;
  // [time, yaw, cable]
  const keys = [
    [0, CRANE.yawA, high],
    [3, CRANE.yawA, lowA],
    [4.5, CRANE.yawA, lowA],
    [8, CRANE.yawA, high],
    [13, CRANE.yawB, high],
    [16, CRANE.yawB, lowB],
    [17.5, CRANE.yawB, lowB],
    [19, CRANE.yawB, high],
    [24, CRANE.yawA, high],
  ];
  const pose = [0, 0];
  let lastYaw = CRANE.yawA;
  let sway = 0;
  return {
    root,
    boom,
    update(time, dt) {
      keyframes(keys, time, pose);
      const yaw = pose[0]!;
      const len = pose[1]!;
      turret.rotation.y = yaw;
      const speed = dt > 0 ? (yaw - lastYaw) / dt : 0;
      lastYaw = yaw;
      sway += (speed * 0.35 - sway) * Math.min(1, dt * 1.5);
      pend.rotation.x = sway + Math.sin(time * 1.3) * 0.012;
      pend.rotation.z = Math.sin(time * 0.9 + 1) * 0.01;
      cable.scale.y = len;
      hook.position.y = -len;
      hook.rotation.y = Math.sin(time * 0.4) * 0.05;
    },
  };
}

// ---------------------------------------------------------------- aerial platform

/** Truck-mounted aerial platform: telescopic boom, a basket kept level, a worker in it. */
export function makeAgp(rig: Rig): Animated {
  const root = node(null);
  rig.box(root, [6.6, 0.4, 1.1], 'dark', [0, 0.9, 0]);
  rig.box(root, [1.35, 1.55, 2.35], 'white', [2.85, 1.95, 0]);
  rig.box(root, [0.06, 0.7, 2.05], 'glass', [3.54, 2.3, 0]);
  rig.box(root, [4.6, 0.5, 2.4], 'yellow', [-0.9, 1.35, 0]);
  rig.box(root, [0.16, 0.12, 0.16], 'beacon', [2.7, 2.83, 0.6]);
  for (const x of [2.7, -1.6]) {
    rig.wheel(root, [x, 0.55, 1.0], 0.55, 0.45);
    rig.wheel(root, [x, 0.55, -1.0], 0.55, 0.45);
  }
  for (const x of [1.6, -3.0])
    for (const s of [1, -1]) {
      rig.box(root, [0.25, 0.25, 1.2], 'yellow', [x, 1.0, s * 1.6]);
      rig.box(root, [0.22, 0.9, 0.22], 'dark', [x, 0.5, s * 2.15]);
      rig.box(root, [0.6, 0.08, 0.6], 'dark', [x, 0.04, s * 2.15]);
    }
  const turret = node(root, [-1.5, 1.9, 0]);
  turret.rotation.y = -Math.PI / 2;
  rig.cyl(turret, 0.6, 0.5, 'dark', [0, 0.25, 0], [0, 0, 0]);
  rig.box(turret, [0.9, 0.6, 0.8], 'yellow', [0, 0.6, 0]);
  const boom = node(turret, [0, 0.6, 0]);
  rig.box(boom, [4.3, 0.42, 0.42], 'yellow', [2.0, 0, 0]);
  const ext = node(boom, [1, 0, 0]);
  rig.box(ext, [4.0, 0.3, 0.3], 'white', [2.0, 0, 0]);
  const basket = node(ext, [4.0, 0, 0]);
  rig.box(basket, [0.3, 0.6, 0.3], 'dark', [0, -0.35, 0]);
  rig.box(basket, [1.0, 0.1, 1.7], 'dark', [0.55, -0.9, 0]);
  for (const sx of [0.05, 1.05])
    for (const sz of [-0.85, 0.85]) rig.box(basket, [0.06, 1.05, 0.06], 'yellow', [sx, -0.4, sz]);
  rig.box(basket, [1.05, 0.07, 0.07], 'yellow', [0.55, 0.1, 0.85]);
  rig.box(basket, [1.05, 0.07, 0.07], 'yellow', [0.55, 0.1, -0.85]);
  rig.box(basket, [0.07, 0.07, 1.75], 'yellow', [1.05, 0.1, 0]);
  rig.box(basket, [0.07, 0.07, 1.75], 'yellow', [0.05, 0.1, 0]);
  rig.box(basket, [1.0, 0.35, 0.04], 'amber', [0.55, -0.68, 0.86]);
  rig.box(basket, [1.0, 0.35, 0.04], 'amber', [0.55, -0.68, -0.86]);
  const worker = makePerson(lookFor('agp-worker', { hat: HAT.yellow }), 'agp-worker');
  worker.root.position.set(0.5, -0.86, 0.2);
  worker.root.rotation.y = Math.PI / 2;
  basket.add(worker.root);
  // Reach and tip heights for the facade: [time, elevation, length]
  const level = (tipY: number) => {
    const reachZ = 5.05;
    const rise = tipY - 2.5;
    return [Math.atan2(rise, reachZ), Math.hypot(rise, reachZ)];
  };
  // Basket at the ground-floor window, then the 2nd and 3rd floor slabs.
  const [e1, l1] = level(1.6);
  const [e2, l2] = level(5.0);
  const [e3, l3] = level(7.6);
  const keys = [
    [0, e1!, l1!],
    [8, e1!, l1!],
    [11, e2!, l2!],
    [16, e2!, l2!],
    [18.5, e3!, l3!],
    [21.5, e3!, l3!],
    [26, e1!, l1!],
  ];
  const pose = [0, 0];
  return {
    root,
    update(time) {
      keyframes(keys, time, pose);
      boom.rotation.z = pose[0]!;
      ext.position.x = pose[1]! - 4;
      basket.rotation.z = -pose[0]! + Math.sin(time * 1.7) * 0.015;
      // Working at the window: one arm wipes/fixes the frame.
      worker.armR.rotation.x = -1.6 + Math.sin(time * 3) * 0.35;
      worker.armL.rotation.x = -0.4;
    },
  };
}

// ---------------------------------------------------------------- roller

export function makeRoller(rig: Rig): Animated & { drive(x: number): void } {
  const root = node(null);
  const drum = node(root, [1.6, 0.78, 0]);
  rig.cyl(drum, 0.78, 2.1, 'steel', [0, 0, 0], [Math.PI / 2, 0, 0]);
  rig.box(drum, [0.12, 1.2, 0.05], 'dark', [0, 0, 1.06]);
  for (const z of [1.15, -1.15]) rig.box(root, [1.7, 1.0, 0.14], 'yellow', [1.4, 1.15, z]);
  rig.box(root, [0.5, 0.4, 2.4], 'yellow', [2.1, 1.65, 0]);
  rig.box(root, [2.4, 1.15, 1.9], 'yellow', [-0.9, 1.3, 0]);
  rig.box(root, [0.08, 0.5, 1.4], 'dark', [-2.12, 1.4, 0]);
  rig.wheel(root, [-1.1, 0.72, 0.95], 0.72, 0.6);
  rig.wheel(root, [-1.1, 0.72, -0.95], 0.72, 0.6);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      rig.box(root, [0.08, 1.3, 0.08], 'dark', [-0.4 + sx * 0.6, 2.5, sz * 0.75]);
  rig.box(root, [1.5, 0.1, 1.7], 'yellow', [-0.4, 3.2, 0]);
  rig.box(root, [0.16, 0.12, 0.16], 'beacon', [-0.8, 3.32, 0.5]);
  operator(rig, root, [-0.45, 1.9, 0]);
  let lastX = 0;
  let driven = 0;
  return {
    root,
    drive(x: number) {
      driven = x - lastX;
      lastX = x;
    },
    update(time) {
      root.position.y = Math.abs(driven) > 0.001 ? Math.sin(time * 70) * 0.012 : 0;
    },
  };
}

// ---------------------------------------------------------------- front loader

export function makeLoader(rig: Rig): Animated & { lift(v: number): void } {
  const root = node(null);
  rig.box(root, [2.5, 1.2, 2.0], 'yellow', [-1.3, 1.35, 0]);
  rig.box(root, [0.1, 0.6, 1.6], 'dark', [-2.56, 1.5, 0]);
  rig.box(root, [1.7, 0.8, 1.5], 'yellow', [0.9, 1.15, 0]);
  rig.box(root, [0.6, 0.6, 0.8], 'dark', [-0.1, 1.0, 0]);
  cab(rig, root, [-0.65, 2.75, 0], [1.3, 1.6, 1.4]);
  for (const x of [1.05, -1.7]) {
    rig.wheel(root, [x, 0.82, 1.05], 0.82, 0.55);
    rig.wheel(root, [x, 0.82, -1.05], 0.82, 0.55);
  }
  const arms = node(root, [0.9, 1.75, 0]);
  for (const z of [0.75, -0.75])
    rig.box(arms, [2.6, 0.26, 0.22], 'yellow', [1.25, -0.4, z], [0, 0, -0.3]);
  const bucket = node(arms, [2.5, -0.8, 0]);
  rig.box(bucket, [0.9, 0.95, 2.5], 'amber', [0.3, -0.1, 0]);
  rig.box(bucket, [0.12, 0.08, 2.5], 'steel', [0.78, -0.55, 0]);
  let lift = 0;
  return {
    root,
    lift(v: number) {
      lift = v;
    },
    update() {
      arms.rotation.z = -0.15 + lift * 0.85;
      bucket.rotation.z = lift * 0.5;
    },
  };
}

// ---------------------------------------------------------------- KMU truck

/** Truck with a knuckle-boom crane behind the cab, unloading block pallets. */
export function makeKmu(rig: Rig, pallet: (n: THREE.Object3D) => void): Animated {
  const root = node(null);
  rig.box(root, [8.2, 0.4, 1.1], 'dark', [0.2, 0.9, 0]);
  rig.box(root, [1.35, 1.6, 2.35], 'white', [3.65, 1.95, 0]);
  rig.box(root, [0.06, 0.7, 2.05], 'glass', [4.34, 2.3, 0]);
  rig.box(root, [5.4, 0.18, 2.4], 'wood', [-1.0, 1.35, 0]);
  rig.box(root, [5.4, 0.3, 0.08], 'yellow', [-1.0, 1.55, 1.2]);
  rig.box(root, [5.4, 0.3, 0.08], 'yellow', [-1.0, 1.55, -1.2]);
  rig.box(root, [0.16, 0.12, 0.16], 'beacon', [3.5, 2.83, 0.6]);
  operator(rig, root, [3.6, 1.3, 0.45]);
  for (const x of [3.4, -1.6, -2.8]) {
    rig.wheel(root, [x, 0.55, 1.0], 0.55, 0.45);
    rig.wheel(root, [x, 0.55, -1.0], 0.55, 0.45);
  }
  for (const s of [1, -1]) {
    rig.box(root, [0.3, 0.3, 1.4], 'yellow', [2.2, 1.0, s * 1.7]);
    rig.box(root, [0.25, 0.9, 0.25], 'dark', [2.2, 0.5, s * 2.35]);
  }
  for (const x of [-2.9, -1.4]) {
    const p = node(root, [x, 1.44, 0]);
    pallet(p);
  }
  const column = node(root, [2.2, 1.4, 0]);
  rig.box(column, [0.5, 1.6, 0.5], 'yellow', [0, 0.8, 0]);
  const boom1 = node(column, [0, 1.6, 0]);
  rig.box(boom1, [3.3, 0.36, 0.32], 'yellow', [1.6, 0, 0]);
  const boom2 = node(boom1, [3.2, 0, 0]);
  rig.box(boom2, [3.1, 0.3, 0.26], 'yellow', [1.5, 0, 0]);
  rig.box(boom2, [0.2, 0.3, 0.2], 'dark', [3.0, -0.15, 0]);
  const cable = node(root);
  rig.cyl(cable, 0.025, 1, 'black', [0, -0.5, 0], [0, 0, 0]);
  const hook = node(root);
  rig.box(hook, [0.25, 0.35, 0.2], 'yellow', [0, -0.18, 0]);
  const load = node(hook, [0, -1.25, 0]);
  pallet(load);
  // [time, yaw, boom1, boom2, cable, carrying]
  const keys = [
    [0, Math.PI, 0.9, -1.6, 0.6, 0],
    [2, Math.PI, 0.9, -1.6, 0.25, 0],
    [2.6, Math.PI, 0.9, -1.6, 0.25, 1],
    [4, Math.PI, 1.05, -1.6, 0.6, 1],
    [8, 1.806, 0.6, -1.17, 0.9, 1],
    [10, 1.806, 0.6, -1.17, 1.65, 1],
    [10.6, 1.806, 0.6, -1.17, 1.65, 0],
    [12, 1.806, 0.7, -1.3, 0.8, 0],
    [16, Math.PI, 0.9, -1.6, 0.6, 0],
  ];
  const pose = [0, 0, 0, 0, 0];
  const tip = new THREE.Vector3();
  const dropped = new THREE.Vector3();
  const loadBase = load.position.clone();
  return {
    root,
    update(time) {
      keyframes(keys, time, pose);
      column.rotation.y = pose[0]!;
      boom1.rotation.z = pose[1]!;
      boom2.rotation.z = pose[2]!;
      root.updateMatrixWorld();
      boom2.localToWorld(tip.set(3.0, -0.3, 0));
      root.worldToLocal(tip);
      const len = pose[3]!;
      cable.position.copy(tip);
      cable.scale.y = len;
      hook.position.set(tip.x, tip.y - len, tip.z);
      const t = time % 16;
      if (t >= 2.3 && t < 10.3) {
        if (load.parent !== hook) {
          hook.add(load);
          load.position.copy(loadBase);
        }
      } else if (load.parent === hook) {
        // Leave the pallet on the ground where the hook put it.
        load.getWorldPosition(dropped);
        root.worldToLocal(dropped);
        root.add(load);
        load.position.copy(dropped);
        load.position.y = 0.1;
      }
    },
  };
}

// ---------------------------------------------------------------- bulldozer

export function makeDozer(rig: Rig): Animated & { pile: THREE.Group } {
  const root = node(null);
  for (const z of [1.1, -1.1]) {
    rig.box(root, [3.4, 0.75, 0.6], 'black', [0, 0.45, z]);
    rig.cyl(root, 0.38, 0.62, 'dark', [1.55, 0.45, z], [Math.PI / 2, 0, 0]);
    rig.cyl(root, 0.38, 0.62, 'dark', [-1.55, 0.45, z], [Math.PI / 2, 0, 0]);
  }
  rig.box(root, [3.0, 1.0, 1.7], 'yellow', [0, 1.3, 0]);
  rig.box(root, [1.5, 0.5, 1.5], 'yellow', [0.8, 2.05, 0]);
  rig.box(root, [0.15, 0.6, 0.15], 'dark', [1.0, 2.55, 0.4]);
  cab(rig, root, [-0.75, 2.55, 0], [1.3, 1.4, 1.5]);
  rig.box(root, [0.35, 1.25, 3.1], 'yellow', [2.35, 0.7, 0]);
  rig.box(root, [0.1, 0.1, 3.1], 'steel', [2.5, 0.1, 0]);
  for (const z of [0.9, -0.9]) rig.box(root, [1.3, 0.2, 0.2], 'dark', [1.7, 0.9, z], [0, 0, -0.3]);
  rig.box(root, [0.2, 0.9, 0.2], 'dark', [-1.9, 0.6, 0], [0, 0, 0.3]);
  const pile = node(null);
  rig.heap(pile, 1.5, 1.0, 'dirt', [0, 0, 0]);
  return { root, pile, update() {} };
}

// ---------------------------------------------------------------- tractor

export function makeTractor(rig: Rig): Animated & { wheels: THREE.Group[] } {
  const root = node(null);
  rig.box(root, [2.2, 0.8, 1.0], 'yellow', [0.6, 1.25, 0]);
  rig.box(root, [0.08, 0.4, 0.8], 'dark', [1.72, 1.2, 0]);
  rig.box(root, [1.3, 0.7, 1.4], 'dark', [-0.8, 1.15, 0]);
  cab(rig, root, [-0.8, 2.25, 0], [1.2, 1.5, 1.3]);
  rig.box(root, [0.1, 0.8, 0.1], 'dark', [1.2, 1.95, 0.3]);
  const front = node(root, [1.3, 0.5, 0]);
  rig.wheel(front, [0, 0, 0.75], 0.5, 0.3);
  rig.wheel(front, [0, 0, -0.75], 0.5, 0.3);
  const rear = node(root, [-0.9, 0.9, 0]);
  rig.wheel(rear, [0, 0, 0.95], 0.9, 0.5);
  rig.wheel(rear, [0, 0, -0.95], 0.9, 0.5);
  rig.box(root, [1.0, 0.15, 0.55], 'yellow', [-0.9, 1.85, 0.95]);
  rig.box(root, [1.0, 0.15, 0.55], 'yellow', [-0.9, 1.85, -0.95]);
  return { root, wheels: [front, rear], update() {} };
}

// ---------------------------------------------------------------- crowd helpers

/** A pallet of aerated blocks, sitting on y = 0 of the node. */
export function palletBuilder(rig: Rig) {
  return (n: THREE.Object3D) => {
    rig.box(n, [1.2, 0.14, 1.0], 'wood', [0, 0.07, 0]);
    rig.box(n, [1.16, 0.84, 0.96], 'block', [0, 0.57, 0]);
    rig.box(n, [1.18, 0.04, 0.98], 'dark', [0, 0.7, 0]);
  };
}

export { smooth };
