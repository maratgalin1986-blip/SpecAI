// Photoreal props from Poly Haven (CC0, see /credits): concrete barriers,
// tyres, barrels, a generator, gas bottles, cement bags, a skip and power
// boxes. Compressed glTF (meshopt + WebP, ~1.6 MB in all), loaded after the
// site is already on screen so the first frame never waits for them; phones
// get fewer copies. Every copy shares its model's geometry and materials.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { FENCE, GATE_HALF, PIT } from '@/lib/stroyka';

type PropName =
  | 'concrete_road_barrier'
  | 'old_tyre'
  | 'Barrel_01'
  | 'barrel_03'
  | 'portable_generator'
  | 'propane_tank'
  | 'cement_bag'
  | 'metal_trash_can'
  | 'utility_box_01';

/** One copy: model, position on the ground, turn (rad), scale, extra rotation. */
type Placement = {
  name: PropName;
  at: [number, number, number?];
  yaw?: number;
  scale?: number;
  tilt?: [number, number];
  /** Shown on phones too (the rest only on computers). */
  phone?: boolean;
};

function layout(): Placement[] {
  const list: Placement[] = [];
  // Safety barriers along the north edge of the pit, and at the gate.
  for (let x = PIT.minX + 1; x < PIT.maxX - 1; x += 2.05) {
    list.push({
      name: 'concrete_road_barrier',
      at: [x, PIT.minZ - 0.8],
      scale: 1.3,
      phone: x < -36,
    });
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = side * (GATE_HALF + 1.4 + k * 2.05);
      list.push({
        name: 'concrete_road_barrier',
        at: [x, FENCE.maxZ - 1.4],
        scale: 1.3,
        phone: k < 2,
      });
    }
  }
  // Tyres by the site cabin: a stack and two leaning on it.
  for (let k = 0; k < 4; k++) {
    list.push({
      name: 'old_tyre',
      at: [23.6, 52.2, 0.12 + k * 0.24],
      tilt: [Math.PI / 2, 0],
      yaw: k * 0.7,
      scale: 1.4,
      phone: true,
    });
  }
  list.push({ name: 'old_tyre', at: [24.8, 52.6, 0.42], yaw: 1.4, tilt: [0.25, 0], scale: 1.4 });
  list.push({ name: 'old_tyre', at: [22.5, 52.9, 0.42], yaw: -1.2, tilt: [-0.2, 0], scale: 1.4 });
  // Fuel corner by the pipes: barrels, a generator, gas bottles.
  const barrels: [number, number, PropName][] = [
    [-50.5, 5, 'Barrel_01'],
    [-50.4, 5.7, 'barrel_03'],
    [-51.1, 5.4, 'Barrel_01'],
    [-49.8, 6.2, 'barrel_03'],
    [-50.9, 6.4, 'Barrel_01'],
  ];
  for (const [x, z, name] of barrels) list.push({ name, at: [x, z], yaw: x * 3.1, phone: true });
  list.push({ name: 'Barrel_01', at: [-49.2, 5.1, 0.28], yaw: 0.4, tilt: [0, Math.PI / 2] });
  list.push({ name: 'portable_generator', at: [14.2, 51.8], yaw: 0.3, scale: 1.2, phone: true });
  list.push({ name: 'portable_generator', at: [-47.5, 7.6], yaw: -1.1, scale: 1.2 });
  for (const [x, z] of [
    [-48.6, 4.2],
    [-48.2, 4.4],
    [13.2, 52.4],
  ] as [number, number][]) {
    list.push({ name: 'propane_tank', at: [x, z], yaw: x, scale: 1.6 });
  }
  // Cement bags on the pallets by the building (pallet top ≈ 0.15 m).
  for (const [px, pz] of [
    [18, -25],
    [19.5, -25],
  ] as [number, number][]) {
    for (let layer = 0; layer < 2; layer++) {
      for (let k = 0; k < 2; k++) {
        list.push({
          name: 'cement_bag',
          at: [px - 0.25 + k * 0.5, pz, 0.15 + layer * 0.18],
          yaw: layer % 2 ? Math.PI / 2 : 0,
          scale: 1.15,
          phone: layer === 0,
        });
      }
    }
  }
  // A skip by the gate cabin and power boxes at the masts.
  list.push({ name: 'metal_trash_can', at: [-10.5, 56.5], yaw: Math.PI, scale: 1.6, phone: true });
  for (const [x, z] of [
    [-10.9, 40],
    [-40.9, 3.2],
    [44.9, 7],
    [40.9, -15.2],
  ] as [number, number][]) {
    list.push({ name: 'utility_box_01', at: [x, z], yaw: Math.atan2(-x, -z) });
  }
  return list;
}

const BASE = '/stroyka/props/';

/**
 * Loads the props and adds them to `group` (freed with the scene by the
 * engine). A model that fails to load is skipped: the site is complete without it.
 */
export async function loadProps(group: THREE.Object3D, mobile: boolean, gone: () => boolean) {
  const placements = layout().filter((p) => !mobile || p.phone);
  const names = [...new Set(placements.map((p) => p.name))];
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const models = new Map<PropName, THREE.Object3D>();
  await Promise.all(
    names.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${BASE}${name}.glb`);
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = !mobile || name === 'concrete_road_barrier';
            o.receiveShadow = true;
          }
        });
        models.set(name, gltf.scene);
      } catch {
        // Skipped: one missing model must not break the site.
      }
    }),
  );
  // The visitor left meanwhile: the engine already freed the scene.
  if (gone()) return [];
  const root = new THREE.Group();
  root.name = 'props3d';
  for (const p of placements) {
    const model = models.get(p.name);
    if (!model) continue;
    const copy = model.clone();
    const [x, z, y = 0] = p.at;
    copy.position.set(x, y, z);
    copy.rotation.set(p.tilt?.[0] ?? 0, p.yaw ?? 0, p.tilt?.[1] ?? 0, 'YXZ');
    copy.scale.setScalar(p.scale ?? 1);
    root.add(copy);
  }
  group.add(root);
  return [root];
}

/**
 * Hides the props far from the camera (they are a few pixels there): fewer
 * draw calls and shadow casters; called a couple of times a second.
 */
export function cullProps(root: THREE.Object3D, camera: THREE.Vector3, far: number) {
  const far2 = far * far;
  for (const copy of root.children) {
    const dx = copy.position.x - camera.x;
    const dz = copy.position.z - camera.z;
    copy.visible = dx * dx + dz * dz < far2;
  }
}
