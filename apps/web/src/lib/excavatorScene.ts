import * as THREE from 'three';

// Animated 3D hero scene: a stylised excavator digging and dumping soil on a
// floating platform, with dust particles and drifting wireframe shapes.
// Imported dynamically from Hero3D so three.js stays out of the main bundle.

interface Pose {
  swing: number;
  boom: number;
  arm: number;
  bucket: number;
}

// One work cycle: reach → dig → lift → swing → dump → swing back.
const DIG_POSE: Pose = { swing: 0, boom: -0.28, arm: -1.35, bucket: -0.9 };
const DUMP_POSE: Pose = { swing: 1.7, boom: 0.45, arm: -0.55, bucket: 0.8 };
const POSES: Pose[] = [
  { swing: 0, boom: 0.1, arm: -0.5, bucket: 0.3 },
  DIG_POSE,
  { swing: 0, boom: 0.6, arm: -1.1, bucket: -1.15 },
  { swing: 1.7, boom: 0.6, arm: -1.0, bucket: -1.15 },
  DUMP_POSE,
  { swing: 0.2, boom: 0.3, arm: -0.6, bucket: 0.2 },
];
const SEGMENT_SECONDS = 1.4;
const DIG_SEGMENT = POSES.indexOf(DIG_POSE);
const DUMP_SEGMENT = POSES.indexOf(DUMP_POSE);

const AMBER = 0xf59e0b;
const AMBER_DARK = 0xd97706;
const STEEL = 0x1e293b;
const SOIL = 0x8b5a2b;

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function box(w: number, h: number, d: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildExcavator() {
  const paint = new THREE.MeshStandardMaterial({ color: AMBER, metalness: 0.3, roughness: 0.45 });
  const paintDark = new THREE.MeshStandardMaterial({ color: AMBER_DARK, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.6, roughness: 0.4 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.4,
    transparent: true,
    opacity: 0.75,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.25,
  });

  const root = new THREE.Group();

  // Tracks with wheels.
  for (const z of [-0.75, 0.75]) {
    const track = box(2.8, 0.55, 0.5, steel);
    track.position.set(0, 0.28, z);
    root.add(track);
    for (let i = 0; i < 4; i++) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.52, 16),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 }),
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(-1.05 + i * 0.7, 0.28, z);
      root.add(wheel);
    }
  }

  // Rotating upper structure.
  const upper = new THREE.Group();
  upper.position.y = 0.6;
  root.add(upper);

  const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.2, 24), steel);
  turntable.position.y = 0.05;
  upper.add(turntable);

  const body = box(2.2, 0.75, 1.6, paint);
  body.position.set(-0.3, 0.5, 0);
  upper.add(body);

  const counterweight = box(0.5, 0.6, 1.6, paintDark);
  counterweight.position.set(-1.4, 0.45, 0);
  upper.add(counterweight);

  const cab = box(0.9, 0.9, 0.8, paint);
  cab.position.set(0.35, 1.3, 0.35);
  upper.add(cab);

  const windshield = box(0.05, 0.6, 0.65, glass);
  windshield.position.set(0.82, 1.35, 0.35);
  upper.add(windshield);
  const sideWindow = box(0.6, 0.5, 0.05, glass);
  sideWindow.position.set(0.35, 1.4, 0.77);
  upper.add(sideWindow);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0xff7a00, emissiveIntensity: 2 }),
  );
  beacon.position.set(0.35, 1.82, 0.35);
  upper.add(beacon);

  // Boom → arm → bucket, each on its own pivot.
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.7, 0.8, -0.3);
  upper.add(boomPivot);
  const boom = box(2.4, 0.32, 0.34, paint);
  boom.position.x = 1.2;
  boomPivot.add(boom);

  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 12), steel);
  cylinder.rotation.z = Math.PI / 2;
  cylinder.position.set(0.8, -0.28, 0);
  boomPivot.add(cylinder);

  const armPivot = new THREE.Group();
  armPivot.position.x = 2.4;
  boomPivot.add(armPivot);
  const arm = box(1.7, 0.24, 0.28, paintDark);
  arm.position.x = 0.85;
  armPivot.add(arm);

  const bucketPivot = new THREE.Group();
  bucketPivot.position.x = 1.7;
  armPivot.add(bucketPivot);
  const bucket = new THREE.Group();
  const bucketBack = box(0.5, 0.08, 0.6, steel);
  bucketBack.position.set(0.25, 0, 0);
  const bucketBottom = box(0.08, 0.45, 0.6, steel);
  bucketBottom.position.set(0.5, -0.2, 0);
  bucket.add(bucketBack, bucketBottom);
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), steel);
    tooth.position.set(0.5, -0.48, -0.22 + i * 0.15);
    tooth.rotation.z = Math.PI;
    bucket.add(tooth);
  }
  const bucketTip = new THREE.Object3D();
  bucketTip.position.set(0.4, -0.3, 0);
  bucket.add(bucketTip);
  bucketPivot.add(bucket);

  return { root, upper, boomPivot, armPivot, bucketPivot, bucketTip, beacon };
}

export interface ExcavatorScene {
  setPointer(x: number, y: number): void;
  setRunning(running: boolean): void;
  dispose(): void;
}

export function createExcavatorScene(
  container: HTMLElement,
  options: { reducedMotion: boolean },
): ExcavatorScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0f172a, 14, 30);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const cameraBase = new THREE.Vector3(9.5, 5.8, 10.5);
  const lookAt = new THREE.Vector3(0.6, 0.9, 0);

  // Lights.
  scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  scene.add(sun);
  const rim = new THREE.PointLight(AMBER, 30, 20);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  // Floating platform with glowing edge and grid.
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 5, 0.6, 64),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }),
  );
  platform.position.y = -0.3;
  platform.receiveShadow = true;
  scene.add(platform);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.65, 0.04, 8, 128),
    new THREE.MeshBasicMaterial({ color: AMBER }),
  );
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);
  const grid = new THREE.GridHelper(9, 18, AMBER, 0x475569);
  grid.position.y = 0.01;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.25;
  scene.add(grid);

  // Dig pit and dump pile.
  const soil = new THREE.MeshStandardMaterial({ color: SOIL, roughness: 1 });
  const pit = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), soil);
  pit.rotation.x = -Math.PI / 2;
  pit.position.set(3.4, 0.02, -0.3);
  scene.add(pit);
  const pile = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.9, 24), soil);
  pile.castShadow = true;
  pile.receiveShadow = true;
  scene.add(pile);

  const excavator = buildExcavator();
  scene.add(excavator.root);

  // Place the dump pile under where the bucket ends up at the dump pose.
  excavator.upper.rotation.y = DUMP_POSE.swing;
  excavator.boomPivot.rotation.z = DUMP_POSE.boom;
  excavator.armPivot.rotation.z = DUMP_POSE.arm;
  excavator.root.updateMatrixWorld(true);
  const dumpPoint = excavator.bucketTip.getWorldPosition(new THREE.Vector3());
  pile.position.set(dumpPoint.x, 0.45, dumpPoint.z);

  // Floating wireframe shapes around the scene.
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
        opacity: 0.55,
      }),
    );
    const angle = (i / 7) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * 7.5, 2.8 + (i % 3) * 1.1, Math.sin(angle) * 7.5);
    mesh.userData.phase = i * 0.9;
    shapes.push(mesh);
    scene.add(mesh);
  }

  // Dust particles emitted from the bucket while digging / dumping.
  const PARTICLES = 160;
  const positions = new Float32Array(PARTICLES * 3);
  const particles = Array.from({ length: PARTICLES }, () => ({
    position: new THREE.Vector3(0, -100, 0),
    velocity: new THREE.Vector3(),
    life: 0,
  }));
  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new THREE.BufferAttribute(positions, 3);
  dustGeometry.setAttribute('position', dustPositions);
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      color: 0xd6a36a,
      size: 0.09,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  scene.add(dust);
  let nextParticle = 0;
  const tip = new THREE.Vector3();

  function emit(origin: THREE.Vector3, count: number, spread: number) {
    for (let n = 0; n < count; n++) {
      const particle = particles[nextParticle];
      nextParticle = (nextParticle + 1) % PARTICLES;
      if (!particle) continue;
      particle.position.set(
        origin.x + (Math.random() - 0.5) * spread,
        origin.y,
        origin.z + (Math.random() - 0.5) * spread,
      );
      particle.velocity.set(
        (Math.random() - 0.5) * 0.8,
        Math.random() * 1.2 - 0.4,
        (Math.random() - 0.5) * 0.8,
      );
      particle.life = 1;
    }
  }

  const pointer = { x: 0, y: 0 };
  const smoothPointer = { x: 0, y: 0 };

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    // Pull the camera back on narrow screens so the whole machine fits.
    camera.position.copy(cameraBase).multiplyScalar(camera.aspect < 1 ? 1.35 : 1);
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const clock = new THREE.Clock();
  let elapsed = 0;
  let running = true;
  let frame = 0;

  function pose(time: number): { pose: Pose; segment: number } {
    const cycle = POSES.length * SEGMENT_SECONDS;
    const t = (time % cycle) / SEGMENT_SECONDS;
    const segment = Math.floor(t);
    const a = POSES[segment] ?? DIG_POSE;
    const b = POSES[(segment + 1) % POSES.length] ?? DIG_POSE;
    const k = smooth(t - segment);
    return {
      segment,
      pose: {
        swing: a.swing + (b.swing - a.swing) * k,
        boom: a.boom + (b.boom - a.boom) * k,
        arm: a.arm + (b.arm - a.arm) * k,
        bucket: a.bucket + (b.bucket - a.bucket) * k,
      },
    };
  }

  function render() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!options.reducedMotion) elapsed += dt;

    const { pose: p, segment } = pose(options.reducedMotion ? 0.5 : elapsed);
    excavator.upper.rotation.y = p.swing;
    excavator.boomPivot.rotation.z = p.boom;
    excavator.armPivot.rotation.z = p.arm;
    excavator.bucketPivot.rotation.z = p.bucket;
    excavator.root.updateMatrixWorld(true);

    if (!options.reducedMotion) {
      excavator.bucketTip.getWorldPosition(tip);
      if (segment === DIG_SEGMENT && Math.random() < 0.6) emit(tip, 2, 0.4);
      if (segment === DUMP_SEGMENT && Math.random() < 0.8) emit(tip, 3, 0.3);

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

      // The pile grows as soil is dumped and settles back over the cycle.
      const cycleT = (elapsed % (POSES.length * SEGMENT_SECONDS)) / SEGMENT_SECONDS;
      pile.scale.setScalar(0.85 + 0.15 * smooth(Math.min(1, Math.max(0, cycleT - DUMP_SEGMENT))));

      for (const shape of shapes) {
        const phase = shape.userData.phase as number;
        shape.rotation.x += dt * 0.4;
        shape.rotation.y += dt * 0.6;
        shape.position.y += Math.sin(elapsed * 1.2 + phase) * dt * 0.3;
      }
      ring.rotation.z += dt * 0.2;
      (excavator.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1 + Math.max(0, Math.sin(elapsed * 8)) * 3;
    }

    // Gentle camera parallax following the pointer.
    smoothPointer.x += (pointer.x - smoothPointer.x) * 0.05;
    smoothPointer.y += (pointer.y - smoothPointer.y) * 0.05;
    const base = camera.aspect < 1 ? cameraBase.clone().multiplyScalar(1.35) : cameraBase;
    camera.position.set(
      base.x + smoothPointer.x * 2.2,
      base.y + smoothPointer.y * 1.2,
      base.z - smoothPointer.x * 1.2,
    );
    camera.lookAt(lookAt);

    renderer.render(scene, camera);
    if (running && !options.reducedMotion) frame = requestAnimationFrame(render);
  }
  render();

  return {
    setPointer(x, y) {
      pointer.x = x;
      pointer.y = y;
      if (options.reducedMotion) render();
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
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((m: THREE.Material) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
