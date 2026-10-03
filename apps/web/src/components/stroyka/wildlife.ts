// Life around the site (owner, 2026-10-03): a flock of birds wheeling over
// it by day, sparrows on the fence that take off when someone comes near,
// and a tabby cat strolling between the cabins. Birds hide in rain and at
// night. Instanced and tiny: a handful of draw calls.
import * as THREE from 'three';
import { FENCE } from '@/lib/stroyka';
import { animateCat, makeCat, type Cat } from './people';

const FLOCK = 14;
const SPARROWS = 10;

/** Places the cat strolls between (near the cabins and the gate). */
const CAT_SPOTS: [number, number][] = [
  [14, 49],
  [24, 49],
  [-12, 54],
  [-24, 47],
  [6, 56],
];

type Sparrow = {
  x: number;
  z: number;
  y: number;
  vy: number;
  vx: number;
  vz: number;
  away: number;
};

export class Wildlife {
  readonly group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private wingL: THREE.InstancedMesh;
  private wingR: THREE.InstancedMesh;
  private flock: { phase: number; r: number; h: number; speed: number; off: number }[] = [];
  private sparrows: Sparrow[] = [];
  private cat: Cat;
  private catTarget = 0;
  private catWait = 3;
  private catPhase = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  /** Flock birds are drawn bigger than sparrows: crows and gulls high up. */
  private big = new THREE.Vector3(2.4, 2.4, 2.4);
  private center = new THREE.Vector3(0, 0, -5);

  constructor(mobile: boolean) {
    const n = FLOCK + SPARROWS;
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.9 });
    const bodyGeo = new THREE.SphereGeometry(1, 6, 4).scale(0.05, 0.045, 0.11);
    const wingGeo = new THREE.PlaneGeometry(0.22, 0.09).translate(0.11, 0, 0).rotateX(-Math.PI / 2);
    this.body = new THREE.InstancedMesh(bodyGeo, dark, n);
    this.wingL = new THREE.InstancedMesh(wingGeo, dark, n);
    this.wingR = new THREE.InstancedMesh(wingGeo.clone().scale(-1, 1, 1), dark, n);
    (this.wingR.material as THREE.Material).side = THREE.DoubleSide;
    for (const mesh of [this.body, this.wingL, this.wingR]) {
      mesh.frustumCulled = false;
      mesh.castShadow = !mobile;
      this.group.add(mesh);
    }
    for (let i = 0; i < FLOCK; i++)
      this.flock.push({
        phase: Math.random() * Math.PI * 2,
        r: 18 + Math.random() * 14,
        h: 11 + Math.random() * 6,
        speed: 0.25 + Math.random() * 0.08,
        off: Math.random() * 6,
      });
    // Sparrows on the top rail of the south fence, either side of the gate.
    for (let i = 0; i < SPARROWS; i++) {
      const side = i % 2 ? 1 : -1;
      this.sparrows.push({
        x: side * (10 + Math.random() * 30),
        z: FENCE.maxZ - 0.05,
        y: 2.55,
        vx: 0,
        vy: 0,
        vz: 0,
        away: 0,
      });
    }
    this.cat = makeCat();
    this.cat.root.position.set(CAT_SPOTS[0]![0], 0, CAT_SPOTS[0]![1]);
    this.group.add(this.cat.root);
  }

  update(
    dt: number,
    time: number,
    k: { day: number; rain: number; snow: number },
    near: THREE.Vector3,
  ) {
    const birdsOut = k.day > 0.5 && k.rain < 0.35;
    let i = 0;
    // The flock: a loose ring that drifts over the site, wings beating.
    for (const b of this.flock) {
      const a = b.phase + time * b.speed;
      const x = this.center.x + Math.cos(a) * b.r + Math.sin(time * 0.2 + b.off) * 4;
      const z = this.center.z + Math.sin(a) * b.r;
      const y = birdsOut ? b.h + Math.sin(time * 0.7 + b.off) * 1.5 : -50;
      this.bird(i++, x, y, z, -a, Math.sin(time * 9 + b.off * 3) * 0.7);
    }
    // Sparrows: sit and hop; fly off when someone comes close, come back later.
    for (const s of this.sparrows) {
      const d = Math.hypot(near.x - s.x, near.z - s.z);
      if (s.away <= 0 && d < 5) {
        s.away = 6 + Math.random() * 6;
        s.vx = (Math.random() - 0.5) * 3;
        s.vz = -1.5 - Math.random();
        s.vy = 3;
      }
      if (s.away > 0) {
        s.away -= dt;
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        s.y += s.vy * dt;
        if (s.away <= 0) {
          s.x = (s.x > 0 ? 1 : -1) * (10 + Math.random() * 30);
          s.z = FENCE.maxZ - 0.05;
          s.y = 2.55;
        }
      }
      const flying = s.away > 0;
      const hop = flying ? 0 : Math.max(0, Math.sin(time * 3 + s.x)) * 0.03;
      this.bird(
        i++,
        s.x,
        birdsOut || k.snow > 0 ? s.y + hop : -50,
        s.z,
        flying ? Math.atan2(s.vx, s.vz) : Math.PI + Math.sin(time + s.x) * 0.6,
        flying ? Math.sin(time * 18 + s.x) * 0.8 : 1.35,
      );
    }
    for (const mesh of [this.body, this.wingL, this.wingR]) mesh.instanceMatrix.needsUpdate = true;
    this.updateCat(dt, time, k.rain);
  }

  private bird(i: number, x: number, y: number, z: number, yaw: number, flap: number) {
    const scale = i < FLOCK ? this.big : this.one;
    this.p.set(x, y, z);
    this.q.setFromEuler(this.e.set(0, yaw, 0));
    this.m.compose(this.p, this.q, scale);
    this.body.setMatrixAt(i, this.m);
    this.q.setFromEuler(this.e.set(0, yaw, flap));
    this.m.compose(this.p, this.q, scale);
    this.wingL.setMatrixAt(i, this.m);
    this.q.setFromEuler(this.e.set(0, yaw, -flap));
    this.m.compose(this.p, this.q, scale);
    this.wingR.setMatrixAt(i, this.m);
  }

  private updateCat(dt: number, time: number, rain: number) {
    const root = this.cat.root;
    // In heavy rain the cat sits it out under the cabin.
    if (this.catWait > 0 || rain > 0.6) {
      this.catWait -= dt;
      animateCat(this.cat, false, time, this.catPhase);
      if (this.catWait <= 0 && rain <= 0.6)
        this.catTarget = (this.catTarget + 1) % CAT_SPOTS.length;
      return;
    }
    const [tx, tz] = CAT_SPOTS[this.catTarget]!;
    const dx = tx - root.position.x;
    const dz = tz - root.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) {
      this.catWait = 4 + Math.random() * 8;
      return;
    }
    const step = Math.min(d, 0.9 * dt);
    root.position.x += (dx / d) * step;
    root.position.z += (dz / d) * step;
    root.rotation.y = Math.atan2(dx, dz);
    this.catPhase += dt * 9;
    animateCat(this.cat, true, time, this.catPhase);
  }
}
