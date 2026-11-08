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
  rig.box(cab, [0.42, 0.12, 0.46], 'dark', [x - 0.05, y + 0.02, z]); // seat
  rig.box(cab, [0.12, 0.62, 0.46], 'dark', [x - 0.25, y + 0.35, z]); // backrest
  rig.box(cab, [0.27, 0.5, 0.42], 'vest', [x, y + 0.32, z]);
  rig.cyl(cab, 0.1, 0.2, 'skin', [x + 0.02, y + 0.7, z]);
  rig.add(cab, HELMET, 'white', [x + 0.02, y + 0.8, z], [0, 0, 0], [0.15, 0.13, 0.15]);
  rig.cyl(cab, 0.12, 0.04, 'dark', [x + 0.32, y + 0.42, z], [0, 0, 0.6]); // steering wheel
}

const HELMET = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);

/**
 * Cab: a frame of round pillars with glass on every side, a peaked roof,
 * mirrors on arms, work lights and a rotating-beacon dome.
 */
function cab(
  rig: Rig,
  parent: THREE.Object3D,
  pos: [number, number, number],
  size: [number, number, number],
  roof: MatKey = 'yellow',
) {
  const [x, y, z] = pos;
  const [w, h, d] = size;
  // Glass panes, slightly inset from the frame.
  rig.box(parent, [0.03, h * 0.92, d - 0.1], 'glass', [x + w / 2 - 0.03, y + 0.02, z]);
  rig.box(parent, [0.03, h * 0.92, d - 0.1], 'glass', [x - w / 2 + 0.03, y + 0.02, z]);
  for (const sz of [-1, 1])
    rig.box(parent, [w - 0.1, h * 0.92, 0.03], 'glass', [x, y + 0.02, z + (sz * (d - 0.06)) / 2]);
  // Pillars and a sill.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      rig.cyl(parent, 0.05, h + 0.04, 'dark', [x + (sx * w) / 2, y, z + (sz * d) / 2]);
  rig.box(parent, [w + 0.04, 0.12, d + 0.04], roof, [x, y - h / 2 + 0.02, z]);
  // Peaked roof with an overhang over the windscreen.
  rig.box(parent, [w + 0.22, 0.1, d + 0.16], roof, [x + 0.05, y + h / 2 + 0.06, z]);
  rig.box(parent, [w * 0.7, 0.06, d * 0.8], roof, [x, y + h / 2 + 0.14, z]);
  // Work lights on the roof edge and the beacon dome.
  for (const sz of [-1, 1]) {
    rig.box(parent, [0.08, 0.1, 0.16], 'dark', [
      x + w / 2 + 0.06,
      y + h / 2 + 0.02,
      z + sz * d * 0.35,
    ]);
    rig.box(parent, [0.02, 0.07, 0.12], 'lamp', [
      x + w / 2 + 0.11,
      y + h / 2 + 0.02,
      z + sz * d * 0.35,
    ]);
  }
  rig.cyl(parent, 0.07, 0.04, 'dark', [x - w / 4, y + h / 2 + 0.19, z + d / 4]);
  rig.add(
    parent,
    HELMET,
    'beacon',
    [x - w / 4, y + h / 2 + 0.21, z + d / 4],
    [0, 0, 0],
    [0.07, 0.1, 0.07],
  );
  // Mirrors on arms.
  for (const sz of [-1, 1]) {
    rig.cyl(
      parent,
      0.015,
      0.3,
      'dark',
      [x + w / 2, y + h * 0.2, z + sz * (d / 2 + 0.12)],
      [Math.PI / 2, 0, 0],
    );
    rig.box(parent, [0.04, 0.22, 0.14], 'dark', [
      x + w / 2 + 0.02,
      y + h * 0.2,
      z + sz * (d / 2 + 0.28),
    ]);
  }
  operator(rig, parent, [x, y - h / 2 + 0.05, z]);
}

/** A hydraulic ram from a to b in the node's frame: painted barrel, chrome rod. */
function ram(
  rig: Rig,
  parent: THREE.Object3D,
  a: [number, number, number],
  b: [number, number, number],
  r = 0.07,
) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const rot: [number, number, number] = [e.x, e.y, e.z];
  const barrel = va.clone().lerp(vb, 0.3);
  const rod = va.clone().lerp(vb, 0.75);
  rig.cyl(parent, r, len * 0.6, 'yellow', [barrel.x, barrel.y, barrel.z], rot);
  rig.cyl(parent, r * 0.55, len * 0.5, 'steel', [rod.x, rod.y, rod.z], rot);
}

/** A vertical exhaust stack with a rain cap. */
function exhaust(rig: Rig, parent: THREE.Object3D, pos: [number, number, number], h = 0.9) {
  rig.cyl(parent, 0.06, h, 'steel', [pos[0], pos[1] + h / 2, pos[2]]);
  rig.cyl(parent, 0.08, 0.04, 'dark', [pos[0], pos[1] + h + 0.02, pos[2]]);
}

/**
 * A KamAZ-style truck cab centred at local x = `x` (front at x + 0.68): a body
 * with a raked windscreen and a rounded roof, sun visor, grille, headlights,
 * a steel bumper, side steps and mirrors on arms.
 */
function truckCab(rig: Rig, parent: THREE.Object3D, x: number, paint: MatKey) {
  rig.profile(
    parent,
    [
      [x - 0.68, 1.17],
      [x + 0.68, 1.17],
      [x + 0.7, 2.02],
      [x + 0.55, 2.66],
      [x + 0.4, 2.72],
      [x - 0.62, 2.72],
      [x - 0.68, 2.62],
    ],
    2.35,
    paint,
    [0, 0, 0],
    [0, 0, 0],
    0.07,
  );
  // Raked windscreen and side windows.
  rig.box(parent, [0.04, 0.58, 2.05], 'glass', [x + 0.64, 2.34, 0], [0, 0, 0.23]);
  for (const sz of [-1, 1])
    rig.box(parent, [0.95, 0.52, 0.04], 'glass', [x + 0.02, 2.32, sz * 1.18]);
  rig.box(parent, [0.22, 0.05, 2.2], 'dark', [x + 0.66, 2.7, 0]); // sun visor
  // Grille, headlights, bumper and the steps up to the doors.
  for (let i = 0; i < 5; i++)
    rig.box(parent, [0.04, 0.05, 1.3], 'dark', [x + 0.71, 1.42 + i * 0.1, 0]);
  for (const sz of [-1, 1]) {
    rig.box(parent, [0.06, 0.16, 0.32], 'lamp', [x + 0.73, 1.32, sz * 0.82]);
    rig.box(parent, [0.08, 0.2, 0.36], 'dark', [x + 0.7, 1.32, sz * 0.82]);
    rig.box(parent, [0.5, 0.05, 0.22], 'steel', [x - 0.1, 0.95, sz * 1.2]);
    rig.box(parent, [0.5, 0.05, 0.22], 'steel', [x - 0.1, 0.65, sz * 1.2]);
    rig.cyl(parent, 0.015, 0.35, 'dark', [x + 0.6, 2.5, sz * 1.3], [Math.PI / 2, 0, 0]);
    rig.box(parent, [0.05, 0.4, 0.18], 'dark', [x + 0.63, 2.45, sz * 1.48]);
  }
  rig.box(parent, [0.3, 0.3, 2.45], 'dark', [x + 0.72, 1.02, 0]);
  rig.box(parent, [0.32, 0.1, 2.5], 'steel', [x + 0.78, 0.84, 0]);
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
  truckCab(rig, root, 2.75, 'yellow');
  rig.box(root, [0.12, 0.22, 2.3], 'hazard', [-3.02, 0.72, 0]); // rear underrun bar
  rig.box(root, [0.06, 0.14, 0.25], 'tail', [-3.08, 1.0, 0.95]);
  rig.box(root, [0.06, 0.14, 0.25], 'tail', [-3.08, 1.0, -0.95]);
  rig.box(root, [0.16, 0.12, 0.16], 'beacon', [2.6, 2.83, 0.6]);
  operator(rig, root, [2.7, 1.3, 0.45]);
  // Fuel tank and exhaust.
  rig.cyl(root, 0.32, 1.1, 'steel', [1.3, 0.85, 1.0], [0, 0, Math.PI / 2]);
  exhaust(rig, root, [2.0, 1.4, -1.0], 1.6);
  const wheels: THREE.Group[] = [];
  for (const x of [2.6, -1.3, -2.5]) {
    const axle = node(root, [x, 0.55, 0]);
    rig.wheel(axle, [0, 0, 1.0], 0.55, 0.45);
    rig.wheel(axle, [0, 0, -1.0], 0.55, 0.45);
    wheels.push(axle);
  }
  // Mudguards over the wheels.
  for (const x of [2.6, -1.9])
    for (const sz of [-1, 1])
      rig.box(root, [x > 0 ? 1.3 : 2.5, 0.06, 0.55], 'dark', [x, 1.22, sz * 1.0]);
  const bed = node(root, [-2.95, 1.15, 0]);
  rig.box(bed, [4.5, 0.15, 2.4], 'amber', [2.25, 0.1, 0]);
  // Sides taller at the front, like a real tipper body.
  for (const z of [1.17, -1.17])
    rig.profile(
      bed,
      [
        [0, 0.15],
        [4.5, 0.15],
        [4.55, 1.28],
        [0.12, 1.02],
      ],
      0.1,
      'amber',
      [0, 0, z],
      [0, 0, 0],
      0.02,
    );
  rig.box(bed, [0.14, 1.3, 2.4], 'amber', [4.5, 0.8, 0]);
  rig.box(bed, [0.1, 0.9, 2.3], 'yellow', [0.05, 0.6, 0]);
  rig.box(bed, [0.6, 0.12, 2.42], 'dark', [4.0, 0.0, 0]);
  // Ribs along the body sides.
  for (let i = 0; i < 5; i++)
    for (const sz of [-1, 1])
      rig.box(bed, [0.08, 0.95, 0.06], 'amber', [0.5 + i * 0.95, 0.62, sz * 1.23]);
  const heap = node(bed, [2.3, 0.18, 0]);
  rig.heap(heap, 1.9, 0.8, 'dirt', [0, 0, 0]);
  return { root, bed, heap, wheels };
}

// ---------------------------------------------------------------- backhoe

/** JCB-like backhoe loader digging at a pit behind it and loading a dump truck at its side. */
export function makeBackhoe(rig: Rig, dirt: Debris, truck: DumpTruck): Animated {
  const root = node(null);
  rig.box(root, [4.4, 0.7, 1.9], 'dark', [0, 0.95, 0]);
  // Engine hood: a sloped nose, cut from a side outline.
  rig.profile(
    root,
    [
      [0.4, 1.25],
      [2.15, 1.25],
      [2.27, 1.62],
      [2.0, 2.04],
      [0.4, 2.08],
    ],
    1.5,
    'yellow',
    [0, 0, 0],
    [0, 0, 0],
    0.06,
  );
  rig.box(root, [0.1, 0.5, 1.1], 'dark', [2.12, 1.55, 0]);
  rig.box(root, [1.5, 0.25, 2.25], 'yellow', [-0.6, 1.32, 0]);
  rig.box(root, [1.8, 0.16, 0.6], 'yellow', [-1.2, 1.72, 1.0]);
  rig.box(root, [1.8, 0.16, 0.6], 'yellow', [-1.2, 1.72, -1.0]);
  rig.box(root, [0.06, 0.14, 0.3], 'lamp', [2.12, 1.95, 0.5]);
  rig.box(root, [0.06, 0.14, 0.3], 'lamp', [2.12, 1.95, -0.5]);
  cab(rig, root, [-0.55, 2.2, 0], [1.5, 1.5, 1.5]);
  exhaust(rig, root, [1.7, 2.0, -0.45], 0.8);
  // Engine hood louvres and a sloped nose.
  for (let i = 0; i < 4; i++) rig.box(root, [0.06, 0.04, 1.2], 'dark', [0.9 + i * 0.25, 2.06, 0]);
  rig.wheel(root, [-1.2, 0.78, 1.05], 0.78, 0.5);
  rig.wheel(root, [-1.2, 0.78, -1.05], 0.78, 0.5);
  rig.wheel(root, [1.45, 0.52, 0.95], 0.52, 0.36);
  rig.wheel(root, [1.45, 0.52, -0.95], 0.52, 0.36);
  for (const z of [1.15, -1.15]) {
    rig.box(root, [0.2, 1.2, 0.2], 'hazard', [-2.3, 0.62, z], [z > 0 ? -0.25 : 0.25, 0, 0]);
    rig.box(root, [0.55, 0.08, 0.55], 'dark', [-2.3, 0.04, z * 1.25]);
  }
  // Front loader bucket.
  const loader = node(root, [0.3, 1.5, 0]);
  for (const z of [1.0, -1.0])
    rig.box(loader, [2.6, 0.2, 0.16], 'yellow', [1.2, -0.4, z], [0, 0, -0.35]);
  // Loader bucket: open to the front, a sloping back and a flat floor.
  rig.profile(
    loader,
    [
      [2.3, -0.55],
      [2.52, -0.6],
      [3.02, -1.06],
      [3.08, -1.32],
      [2.42, -1.32],
      [2.28, -1.12],
    ],
    2.3,
    'yellow',
    [0, 0, 0],
    [0, 0, 0],
    0.04,
  );
  rig.box(loader, [0.1, 0.08, 2.3], 'steel', [3.0, -1.3, 0]);
  for (const z of [0.7, -0.7]) ram(rig, loader, [0.2, -0.15, z], [1.9, -0.75, z], 0.06);
  // Backhoe arm: swing post → boom → stick → bucket.
  const swing = node(root, [-2.45, 1.25, 0]);
  rig.box(swing, [0.45, 0.65, 0.55], 'dark', [0, 0, 0]);
  const boom = node(swing, [-0.1, 0.1, 0]);
  // Banana-shaped boom, deeper in the middle like the real one.
  rig.profile(
    boom,
    [
      [0.15, 0.2],
      [-0.6, 0.55],
      [-1.4, 0.68],
      [-2.1, 0.5],
      [-2.82, 0.16],
      [-2.82, -0.15],
      [-2.1, 0.17],
      [-1.4, 0.33],
      [-0.6, 0.21],
      [0.15, -0.2],
    ],
    0.3,
    'yellow',
    [0, 0, 0],
    [0, 0, 0],
    0.04,
  );
  // Hoses from the swing post along both sides of the boom.
  for (const z of [0.19, -0.19])
    rig.hose(boom, [
      [0, 0.3, z],
      [-0.7, 0.7, z],
      [-1.5, 0.8, z],
      [-2.2, 0.6, z],
      [-2.75, 0.25, z * 0.7],
    ]);
  ram(rig, boom, [-0.1, 0.45, 0], [-1.9, 0.38, 0], 0.08);
  const stick = node(boom, [-2.7, 0, 0]);
  // Tapered stick with a knuckle at the bucket end.
  rig.profile(
    stick,
    [
      [0.18, 0.2],
      [-2.38, 0.1],
      [-2.38, -0.1],
      [0.18, -0.22],
    ],
    0.26,
    'yellow',
    [0, 0, 0],
    [0, 0, 0],
    0.04,
  );
  rig.cyl(stick, 0.11, 0.34, 'dark', [-2.3, 0, 0], [Math.PI / 2, 0, 0]);
  for (const z of [0.15, -0.15])
    rig.hose(stick, [
      [0.1, 0.24, z],
      [-0.8, 0.22, z],
      [-1.6, 0.17, z],
    ]);
  ram(rig, stick, [-0.1, 0.24, 0], [-1.7, 0.2, 0], 0.06);
  const bucket = node(stick, [-2.3, 0, 0]);
  // Digging bucket: a rounded scoop seen from the side.
  rig.profile(
    bucket,
    [
      [0.06, 0.12],
      [-0.35, 0.18],
      [-0.68, -0.04],
      [-0.78, -0.44],
      [-0.62, -0.62],
      [-0.3, -0.36],
      [0, -0.1],
    ],
    0.75,
    'dark',
    [0, 0, 0],
    [0, 0, 0],
    0.03,
  );
  rig.box(bucket, [0.12, 0.12, 0.78], 'steel', [-0.55, -0.55, 0]);
  for (let i = 0; i < 5; i++)
    rig.box(bucket, [0.16, 0.05, 0.07], 'steel', [-0.64, -0.6, -0.3 + i * 0.15], [0, 0, 0.3]);
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
      rig.box(root, [0.3, 0.3, 2.4], 'hazard', [x, 1.0, s * 2.3]);
      rig.box(root, [0.28, 0.95, 0.28], 'dark', [x, 0.55, s * 3.45]);
      ram(rig, root, [x, 1.0, s * 3.45], [x, 0.25, s * 3.45], 0.09);
      rig.box(root, [0.8, 0.1, 0.8], 'dark', [x, 0.05, s * 3.45]);
    }
  const turret = node(root, [CRANE.turretX, CRANE.turretY, 0]);
  rig.box(turret, [3.4, 1.1, 2.3], 'yellow', [-0.3, 0.55, 0]);
  rig.box(turret, [1.0, 1.1, 2.4], 'hazard', [-2.3, 0.65, 0]); // counterweight
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
  ram(rig, turret, [ax, ay, 0], [bx, by, 0], 0.17);
  const boom = node(turret, [px, py, 0]);
  boom.rotation.z = e;
  rig.box(boom, [7.2, 0.78, 0.66], 'yellow', [3.4, 0, 0]);
  rig.box(boom, [6.0, 0.6, 0.52], 'yellow', [9.0, 0, 0]);
  rig.box(boom, [4.4, 0.46, 0.4], 'amber', [13.8, 0, 0]);
  rig.cyl(boom, 0.32, 0.3, 'dark', [16, 0, 0], [Math.PI / 2, 0, 0]);
  rig.hose(boom, [
    [0.3, 0.42, 0.2],
    [3.5, 0.42, 0.2],
    [6.8, 0.4, 0.2],
  ]);
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
  truckCab(rig, root, 2.85, 'white');
  rig.box(root, [4.6, 0.5, 2.4], 'yellow', [-0.9, 1.35, 0]);
  rig.box(root, [0.16, 0.12, 0.16], 'beacon', [2.7, 2.83, 0.6]);
  for (const x of [2.7, -1.6]) {
    rig.wheel(root, [x, 0.55, 1.0], 0.55, 0.45);
    rig.wheel(root, [x, 0.55, -1.0], 0.55, 0.45);
  }
  for (const x of [1.6, -3.0])
    for (const s of [1, -1]) {
      rig.box(root, [0.25, 0.25, 1.2], 'hazard', [x, 1.0, s * 1.6]);
      rig.box(root, [0.22, 0.9, 0.22], 'dark', [x, 0.5, s * 2.15]);
      rig.box(root, [0.6, 0.08, 0.6], 'dark', [x, 0.04, s * 2.15]);
    }
  const turret = node(root, [-1.5, 1.9, 0]);
  turret.rotation.y = -Math.PI / 2;
  rig.cyl(turret, 0.6, 0.5, 'dark', [0, 0.25, 0], [0, 0, 0]);
  rig.box(turret, [0.9, 0.6, 0.8], 'yellow', [0, 0.6, 0]);
  const boom = node(turret, [0, 0.6, 0]);
  rig.box(boom, [4.3, 0.42, 0.42], 'yellow', [2.0, 0, 0]);
  ram(rig, boom, [0.2, -0.3, 0], [2.2, -0.25, 0], 0.09);
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
  for (const z of [1.07, -1.07]) rig.cyl(drum, 0.5, 0.04, 'dark', [0, 0, z], [Math.PI / 2, 0, 0]);
  for (const z of [1.15, -1.15]) rig.box(root, [1.7, 1.0, 0.14], 'yellow', [1.4, 1.15, z]);
  rig.box(root, [0.5, 0.4, 2.4], 'yellow', [2.1, 1.65, 0]);
  rig.box(root, [2.4, 1.15, 1.9], 'yellow', [-0.9, 1.3, 0]);
  rig.box(root, [0.08, 0.5, 1.4], 'dark', [-2.12, 1.4, 0]);
  rig.box(root, [0.12, 0.22, 1.95], 'hazard', [-2.14, 0.85, 0]); // rear bumper
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
  rig.box(root, [0.35, 0.45, 2.05], 'hazard', [-2.6, 0.95, 0]); // counterweight
  rig.box(root, [1.7, 0.8, 1.5], 'yellow', [0.9, 1.15, 0]);
  rig.box(root, [0.6, 0.6, 0.8], 'dark', [-0.1, 1.0, 0]);
  cab(rig, root, [-0.65, 2.75, 0], [1.3, 1.6, 1.4]);
  for (const x of [1.05, -1.7]) {
    rig.wheel(root, [x, 0.82, 1.05], 0.82, 0.55);
    rig.wheel(root, [x, 0.82, -1.05], 0.82, 0.55);
  }
  const arms = node(root, [0.9, 1.75, 0]);
  // Curved lift arms and their cylinders.
  for (const z of [0.75, -0.75]) {
    rig.profile(
      arms,
      [
        [-0.1, 0.12],
        [1.2, 0.0],
        [2.62, -0.7],
        [2.5, -0.92],
        [1.15, -0.28],
        [-0.1, -0.14],
      ],
      0.22,
      'yellow',
      [0, 0, z],
      [0, 0, 0],
      0.03,
    );
    ram(rig, arms, [-0.4, -0.55, z * 0.8], [1.2, -0.35, z * 0.8], 0.08);
  }
  const bucket = node(arms, [2.5, -0.8, 0]);
  rig.profile(
    bucket,
    [
      [-0.15, 0.35],
      [0.1, 0.38],
      [0.75, -0.2],
      [0.82, -0.55],
      [0.0, -0.55],
      [-0.18, -0.3],
    ],
    2.5,
    'amber',
    [0, 0, 0],
    [0, 0, 0],
    0.04,
  );
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
  truckCab(rig, root, 3.65, 'white');
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
    rig.box(root, [0.3, 0.3, 1.4], 'hazard', [2.2, 1.0, s * 1.7]);
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
  ram(rig, boom1, [0.3, -0.25, 0], [2.4, -0.22, 0], 0.08);
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
    // Track: a long loop with rounded ends.
    const track: [number, number][] = [];
    for (let k = 0; k <= 8; k++) {
      const a = -Math.PI / 2 + (k / 8) * Math.PI;
      track.push([1.55 + Math.cos(a) * 0.42, 0.45 + Math.sin(a) * 0.42]);
    }
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI / 2 + (k / 8) * Math.PI;
      track.push([-1.55 + Math.cos(a) * 0.42, 0.45 + Math.sin(a) * 0.42]);
    }
    rig.profile(root, track, 0.6, 'tyre', [0, 0, z], [0, 0, 0], 0.03);
    for (let k = 0; k < 4; k++)
      rig.cyl(root, 0.12, 0.64, 'dark', [-0.9 + k * 0.6, 0.2, z], [Math.PI / 2, 0, 0]);
    rig.cyl(root, 0.38, 0.62, 'dark', [1.55, 0.45, z], [Math.PI / 2, 0, 0]);
    rig.cyl(root, 0.38, 0.62, 'dark', [-1.55, 0.45, z], [Math.PI / 2, 0, 0]);
  }
  rig.box(root, [3.0, 1.0, 1.7], 'yellow', [0, 1.3, 0]);
  rig.box(root, [1.5, 0.5, 1.5], 'yellow', [0.8, 2.05, 0]);
  rig.box(root, [0.15, 0.6, 0.15], 'dark', [1.0, 2.55, 0.4]);
  cab(rig, root, [-0.75, 2.55, 0], [1.3, 1.4, 1.5]);
  // Curved moldboard, the cutting edge at the bottom.
  rig.profile(
    root,
    [
      [2.2, 0.08],
      [2.55, 0.08],
      [2.42, 0.45],
      [2.42, 0.85],
      [2.6, 1.3],
      [2.38, 1.36],
      [2.2, 0.9],
      [2.18, 0.45],
    ],
    3.1,
    'yellow',
    [0, 0, 0],
    [0, 0, 0],
    0.03,
  );
  rig.box(root, [0.1, 0.1, 3.1], 'steel', [2.5, 0.1, 0]);
  for (const z of [0.9, -0.9]) {
    rig.box(root, [1.3, 0.2, 0.2], 'dark', [1.7, 0.9, z], [0, 0, -0.3]);
    ram(rig, root, [1.0, 1.75, z * 0.6], [2.25, 1.1, z * 0.6], 0.07);
  }
  rig.box(root, [0.2, 0.9, 0.2], 'dark', [-1.9, 0.6, 0], [0, 0, 0.3]);
  const pile = node(null);
  rig.heap(pile, 1.5, 1.0, 'dirt', [0, 0, 0]);
  return { root, pile, update() {} };
}

// ---------------------------------------------------------------- tractor

export function makeTractor(rig: Rig): Animated & { wheels: THREE.Group[] } {
  const root = node(null);
  // Hood sloping down to the grille, like the MTZ.
  rig.profile(
    root,
    [
      [-0.5, 0.85],
      [1.72, 0.85],
      [1.75, 1.45],
      [1.45, 1.66],
      [-0.5, 1.66],
    ],
    1.0,
    'yellow',
    [0, 0, 0],
    [0, 0, 0],
    0.05,
  );
  for (let i = 0; i < 4; i++) rig.box(root, [0.04, 0.05, 0.8], 'dark', [1.76, 1.0 + i * 0.11, 0]);
  for (const sz of [-1, 1]) rig.box(root, [0.05, 0.12, 0.18], 'lamp', [1.74, 1.52, sz * 0.36]);
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
