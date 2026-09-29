import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  buildBackhoeLoader,
  createEnvironment,
  createGroundTexture,
  createSoilHeapGeometry,
  type HoePose,
} from './realisticMachines';

// The "one shift" scroll story as a 3D set: a backhoe loader drives onto a
// dark site under a work light, puts its stabilisers down and digs a trench,
// piling the spoil beside it. Everything is a pure function of the scroll
// progress, so the scene can be scrubbed both ways.

export interface ShiftStoryScene {
  setProgress(progress: number): void;
  setRunning(running: boolean): void;
  dispose(): void;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const phase = (p: number, from: number, to: number) => clamp((p - from) / (to - from));
const smooth = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPose = (a: HoePose, b: HoePose, t: number): HoePose => ({
  swing: lerp(a.swing, b.swing, t),
  boom: lerp(a.boom, b.boom, t),
  stick: lerp(a.stick, b.stick, t),
  bucket: lerp(a.bucket, b.bucket, t),
});

const DEPTH = 2.4;
const CYCLES = 7;
/** Trench span, metres behind the backhoe's swing axis. */
const TRENCH_NEAR = 1.55;
const TRENCH_FAR = 3.45;
const TRENCH_WIDTH = 1.2;
const DUMP_SWING = 1.05;
const DRIVE_DISTANCE = 17;

export function createShiftStoryScene(
  container: HTMLElement,
  options: { reducedMotion: boolean },
): ShiftStoryScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07080a, 12, 27);
  const environment = createEnvironment(renderer);
  scene.environment = environment;
  scene.environmentIntensity = 0.28;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // A warm work light on a mast above the trench, a cool rim from behind.
  scene.add(new THREE.HemisphereLight(0x8fa3c0, 0x1a130c, 0.35));
  const work = new THREE.SpotLight(0xffd29a, 900, 40, 0.62, 0.55, 1.6);
  work.position.set(1.5, 11, 5);
  work.target.position.set(0, 0, -0.8);
  work.castShadow = true;
  work.shadow.mapSize.set(2048, 2048);
  work.shadow.bias = -0.0003;
  work.shadow.normalBias = 0.02;
  scene.add(work, work.target);
  const rim = new THREE.DirectionalLight(0x9db4ff, 0.8);
  rim.position.set(-6, 5, -9);
  scene.add(rim);

  // Ground with a rectangular opening for the trench.
  const soil = createGroundTexture('soil');

  soil.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: soil,
    color: 0x7d7268,
    roughness: 1,
  });
  // Four panels around the opening, with planar UVs in metres.
  const xs = [-120, TRENCH_NEAR, TRENCH_FAR, 120];
  const zs = [-120, -TRENCH_WIDTH / 2, TRENCH_WIDTH / 2, 60];
  const panel = (x0: number, x1: number, z0: number, z1: number) => {
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const uv = geometry.attributes.uv as THREE.BufferAttribute;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      // Snap shared edges to identical values so no hairline cracks show.
      const x = pos.getX(i) < (x0 + x1) / 2 ? x0 : x1;
      const z = pos.getZ(i) < (z0 + z1) / 2 ? z0 : z1;
      pos.setXYZ(i, x, 0, z);
      uv.setXY(i, x / 2.6, -z / 2.6);
    }
    return geometry;
  };
  const panels: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i !== 1 || j !== 1) panels.push(panel(xs[i]!, xs[i + 1]!, zs[j]!, zs[j + 1]!));
    }
  }
  const groundGeometry = mergeGeometries(panels) ?? new THREE.PlaneGeometry(1, 1);
  for (const panel of panels) panel.dispose();
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.receiveShadow = true;
  scene.add(ground);

  // Trench: an open box seen from the inside, deepening with the shift.
  const trenchMaterial = new THREE.MeshStandardMaterial({
    map: soil,
    color: 0x9a8472,
    roughness: 1,
    side: THREE.BackSide,
    vertexColors: true,
  });
  const trenchGeometry = new THREE.BoxGeometry(TRENCH_FAR - TRENCH_NEAR, 1, TRENCH_WIDTH, 1, 10, 1);
  // Darker towards the bottom, as little light gets down there.
  const trenchPosition = trenchGeometry.attributes.position as THREE.BufferAttribute;
  const shade = new Float32Array(trenchPosition.count * 3);
  for (let i = 0; i < trenchPosition.count; i++) {
    const v = 0.12 + 0.88 * Math.exp(-(0.5 - trenchPosition.getY(i)) * 5);
    shade.set([v, v, v], i * 3);
  }
  trenchGeometry.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  const trench = new THREE.Mesh(trenchGeometry, trenchMaterial);
  trench.position.set((TRENCH_NEAR + TRENCH_FAR) / 2, 0, 0);
  trench.receiveShadow = true;
  scene.add(trench);
  // Untouched ground over the trench until the first bite.
  const lid = new THREE.Mesh(panel(TRENCH_NEAR, TRENCH_FAR, zs[1]!, zs[2]!), groundMaterial);
  lid.receiveShadow = true;
  scene.add(lid);

  // Spoil heap beside the trench, where the bucket swings to dump.
  const heapGeometry = createSoilHeapGeometry(9);
  const heapMaterial = new THREE.MeshStandardMaterial({
    map: soil,
    color: 0x857260,
    roughness: 1,
  });
  const heap = new THREE.Mesh(heapGeometry, heapMaterial);
  const dumpReach = 3.1;
  heap.position.set(Math.cos(DUMP_SWING) * dumpReach, 0, -Math.sin(DUMP_SWING) * dumpReach - 0.2);
  heap.castShadow = true;
  heap.receiveShadow = true;
  scene.add(heap);

  // The machine. It faces -x so the backhoe points at the trench; the swing
  // axis sits at the origin.
  const model = buildBackhoeLoader();
  model.root.rotation.y = Math.PI;
  scene.add(model.root);
  const parkedX = model.hoeOrigin.x;
  const bucketLoad = new THREE.Mesh(heapGeometry, heapMaterial);
  bucketLoad.scale.set(0.34, 0.22, 0.26);
  bucketLoad.position.set(0.5, -0.02, 0);
  bucketLoad.rotation.z = Math.PI + 0.5;
  model.pivots.bucket.add(bucketLoad);
  // Night shift: lamps on.
  model.materials.lens.emissiveIntensity = 4;

  // Soil falling from the bucket.
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = dotCanvas.height = 32;
  const dotCtx = dotCanvas.getContext('2d');
  if (dotCtx) {
    const g = dotCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    dotCtx.fillStyle = g;
    dotCtx.fillRect(0, 0, 32, 32);
  }
  const dotTexture = new THREE.CanvasTexture(dotCanvas);
  const COUNT = 160;
  const particlePositions = new Float32Array(COUNT * 3).fill(-100);
  const particles = Array.from({ length: COUNT }, () => ({
    p: new THREE.Vector3(0, -100, 0),
    v: new THREE.Vector3(),
    life: 0,
  }));
  const particleGeometry = new THREE.BufferGeometry();
  const particleAttribute = new THREE.BufferAttribute(particlePositions, 3);
  particleGeometry.setAttribute('position', particleAttribute);
  const particleMaterial = new THREE.PointsMaterial({
    map: dotTexture,
    color: 0x8a6d52,
    size: 0.16,
    transparent: true,
    depthWrite: false,
  });
  const dust = new THREE.Points(particleGeometry, particleMaterial);
  dust.frustumCulled = false;
  scene.add(dust);
  let nextParticle = 0;
  const tipWorld = new THREE.Vector3();

  function dig(depth: number, u: number): HoePose {
    // One dig cycle, u = 0…1: reach, bite, drag, curl, lift, swing, dump, return.
    const keys: [number, number, number, number, number][] = [
      [0, 3.7, 0.7, -0.9, 0],
      [0.18, 3.05, -depth, -1.35, 0],
      [0.36, 2.0, -depth + 0.05, -2.1, 0],
      [0.48, 2.0, -depth + 0.5, -2.5, 0],
      [0.62, 2.7, 1.7, -2.55, 0],
      [0.72, 3.0, 1.9, -2.55, DUMP_SWING],
      [0.84, 3.2, 1.75, -0.35, DUMP_SWING],
      [0.94, 3.5, 1.2, -0.7, 0.3],
      [1, 3.7, 0.7, -0.9, 0],
    ];
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1]![0] <= u) i++;
    const a = keys[i]!;
    const b = keys[i + 1]!;
    const k = smooth((u - a[0]) / (b[0] - a[0]));
    return model.solveHoe(
      lerp(a[1], b[1], k),
      lerp(a[2], b[2], k),
      lerp(a[3], b[3], k),
      lerp(a[4], b[4], k),
    );
  }

  let target = options.reducedMotion ? 1 : 0;
  let shown = target;
  let lastDrawn = -1;
  let running = false;
  let frame = 0;
  let time = 0;
  let last = performance.now();

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    // Frame the whole set on wide screens, the dig on narrow ones.
    const wide = camera.aspect >= 1.2;
    const span = wide ? 13.5 : 7;
    const fovH = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const distance = Math.max(wide ? 11 : 9, span / 2 / Math.tan(fovH / 2));
    const centerX = wide ? -0.6 : 0.4;
    camera.position.set(centerX + distance * 0.2, distance * 0.52, distance);
    camera.lookAt(centerX, 0.4, -0.8);
    camera.updateProjectionMatrix();
    lastDrawn = -1;
    if (!running) draw(0);
  }

  function draw(dt: number) {
    const p = shown;
    const drive = 1 - Math.pow(1 - phase(p, 0.12, 0.4), 3);
    const workT = phase(p, 0.4, 0.84);
    const settle = smooth(phase(p, 0.84, 0.95));
    const unfold = smooth(phase(p, 0.34, 0.42));
    const depth = DEPTH * workT;

    // Drive in from the right, front first.
    const x = parkedX + DRIVE_DISTANCE * (1 - drive);
    const previousX = model.root.position.x;
    model.root.position.x = x;
    model.root.visible = drive > 0.001;
    model.roll(previousX - x);

    const stabilisers = smooth(phase(p, 0.33, 0.39)) * (1 - smooth(phase(p, 0.9, 0.97)));
    model.setStabilisers(stabilisers);
    const loaderDown = smooth(phase(p, 0.33, 0.4)) * (1 - smooth(phase(p, 0.9, 0.97)));
    model.setLoader(lerp(0.25, 0, loaderDown), lerp(0.3, 0.05, loaderDown));

    const cycle = workT * CYCLES;
    const u = workT >= 1 ? 0 : cycle % 1;
    const cycleDepth = DEPTH * Math.min(1, (Math.floor(cycle) + 1) / CYCLES);
    let pose = dig(Math.min(cycleDepth, depth + 0.3), u);
    pose = lerpPose(model.hoeTravel, pose, unfold);
    pose = lerpPose(pose, model.hoeTravel, settle);
    model.setHoe(pose);
    model.update();

    trench.visible = depth > 0.02;
    lid.visible = !trench.visible;
    trench.scale.y = Math.max(0.01, depth);
    trench.position.y = -depth / 2;
    const soilAmount = Math.sqrt(workT);
    heap.visible = workT > 0.01;
    heap.scale.set(1.6 * soilAmount + 0.01, 0.95 * soilAmount + 0.01, 1.2 * soilAmount + 0.01);
    const carrying = workT > 0 && workT < 1 && u > 0.4 && u < 0.84;
    bucketLoad.visible = carrying;

    // Beacon turns while the machine is moving or working.
    const beaconOn = drive < 1 || (workT > 0 && workT < 1) || (settle > 0 && settle < 1);
    for (const rotator of model.beacons) rotator.rotation.y = beaconOn ? time * 7 : 0.6;
    model.materials.beacon.emissiveIntensity = beaconOn
      ? 1.2 + 0.9 * Math.max(0, Math.sin(time * 7))
      : 0.4;

    if (dt > 0) {
      if (u > 0.76 && u < 0.86 && workT > 0 && workT < 1) {
        model.bucketTip.getWorldPosition(tipWorld);
        for (let n = 0; n < 3; n++) {
          const particle = particles[nextParticle]!;
          nextParticle = (nextParticle + 1) % COUNT;
          particle.p.set(
            tipWorld.x + (Math.random() - 0.5) * 0.5,
            tipWorld.y,
            tipWorld.z + (Math.random() - 0.5) * 0.4,
          );
          particle.v.set(
            (Math.random() - 0.5) * 0.4,
            -Math.random() * 0.5,
            (Math.random() - 0.5) * 0.4,
          );
          particle.life = 1;
        }
      }
      particles.forEach((particle, i) => {
        if (particle.life > 0) {
          particle.life -= dt * 0.9;
          particle.v.y -= dt * 7;
          particle.p.addScaledVector(particle.v, dt);
          if (particle.p.y < 0.05 || particle.life <= 0) {
            particle.life = 0;
            particle.p.y = -100;
          }
        }
        particleAttribute.setXYZ(i, particle.p.x, particle.p.y, particle.p.z);
      });
      particleAttribute.needsUpdate = true;
    }

    renderer.render(scene, camera);
    lastDrawn = p;
  }

  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    // Ease towards the scroll position so scrubbing stays smooth.
    shown += (target - shown) * (1 - Math.exp(-10 * dt));
    if (Math.abs(target - shown) < 0.0003) shown = target;
    draw(dt);
    if (running) frame = requestAnimationFrame(loop);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  return {
    setProgress(progress) {
      target = clamp(progress);
      if (options.reducedMotion) {
        shown = target;
        if (shown !== lastDrawn) draw(0);
      }
    },
    setRunning(next) {
      if (options.reducedMotion || next === running) return;
      running = next;
      cancelAnimationFrame(frame);
      if (running) {
        last = performance.now();
        frame = requestAnimationFrame(loop);
      }
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      model.pivots.bucket.remove(bucketLoad);
      model.dispose();
      for (const item of [
        groundGeometry,
        groundMaterial,
        lid.geometry,
        trench.geometry,
        trenchMaterial,
        heapGeometry,
        heapMaterial,
        particleGeometry,
        particleMaterial,
        dotTexture,
        soil,
        environment,
      ]) {
        item.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
