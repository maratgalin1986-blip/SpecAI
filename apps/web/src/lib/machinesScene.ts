import * as THREE from 'three';
import type { SceneSounds } from './machineSounds';
import {
  buildBackhoeLoader,
  buildBulldozer,
  buildDumpTruck,
  buildMobileCrane,
  buildWheelLoader,
  createEnvironment,
  createGroundTexture,
  type HoePose,
  type MachineModel,
} from './realisticMachines';

// Animated 3D hero scene: a rotating line-up of realistic construction
// machines on a small asphalt site pad. The machine drives towards the
// pointer, switches its headlights on while the button is held, sounds its
// horn when clicked and otherwise gets on with its work. Imported dynamically
// from Hero3D so three.js stays out of the main bundle.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AMBER = 0xf59e0b;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smooth(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function approachAngle(current: number, target: number, maxStep: number) {
  const diff = wrapAngle(target - current);
  return current + clamp(diff, -maxStep, maxStep);
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

function lerpPose(a: HoePose, b: HoePose, t: number): HoePose {
  return {
    swing: lerp(a.swing, b.swing, t),
    boom: lerp(a.boom, b.boom, t),
    stick: lerp(a.stick, b.stick, t),
    bucket: lerp(a.bucket, b.bucket, t),
  };
}

function softDotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

function beamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Top of the texture maps to the cone tip at the lamp.
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Traffic cone: orange body, two retro-reflective bands, black base. */
function createCone(orange: THREE.Material, white: THREE.Material, black: THREE.Material) {
  const cone = new THREE.Group();
  const profile = (from: number, to: number) =>
    new THREE.LatheGeometry(
      [from, to].map((h) => new THREE.Vector2(lerp(0.16, 0.035, h / 0.7), h)),
      20,
    );
  const bands: [number, number, THREE.Material][] = [
    [0.03, 0.22, orange],
    [0.22, 0.32, white],
    [0.32, 0.42, orange],
    [0.42, 0.5, white],
    [0.5, 0.7, orange],
  ];
  for (const [from, to, material] of bands) {
    const part = new THREE.Mesh(profile(from, to), material);
    part.castShadow = true;
    cone.add(part);
  }
  const tip = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), orange);
  tip.rotation.x = -Math.PI / 2;
  tip.position.y = 0.7;
  cone.add(tip);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.035, 0.4), black);
  base.position.y = 0.0175;
  base.castShadow = true;
  base.receiveShadow = true;
  cone.add(base);
  cone.scale.setScalar(0.6);
  return cone;
}

// ---------------------------------------------------------------------------
// Machines and what they do on the pad
// ---------------------------------------------------------------------------

interface WorkContext {
  time: number;
  dt: number;
  /** 0 while driving, easing to 1 once stopped — blends travel pose → work. */
  work: number;
  moving: boolean;
  /** Direction to the look target, relative to the machine's heading. */
  lookYaw: number;
  emit(origin: THREE.Object3D, count: number, spread: number): void;
}

interface Actor {
  name: string;
  model: MachineModel;
  /** Model metres → scene units. */
  scale: number;
  engineHz: number;
  /** Machines with a slewing superstructure look at the target with it. */
  hasTurret: boolean;
  /** Preferred heading relative to the camera while working on its own. */
  presentYaw: number;
  update(ctx: WorkContext): void;
}

function backhoeActor(): Actor {
  const model = buildBackhoeLoader();
  // Teeth reach/height behind the swing post, bucket pitch, swing.
  const keys: [number, number, number, number][] = [
    [4.7, 0.9, -0.8, 0],
    [4.5, -0.12, -1.45, 0],
    [3.3, -0.1, -2.15, 0],
    [3.4, 1.5, -2.55, 0],
    [3.5, 1.7, -2.55, 1.05],
    [3.7, 1.6, -0.35, 1.05],
    [4.2, 1.4, -0.6, 0.3],
  ];
  const poses = keys.map(([r, h, p, s]) => model.solveHoe(r, h, p, s));
  let workTime = 0;
  let stabilisers = 1;
  return {
    name: 'Экскаватор-погрузчик',
    model,
    scale: 0.62,
    engineHz: 42,
    hasTurret: false,
    presentYaw: 2.2,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      stabilisers = damp(stabilisers, ctx.moving ? 0 : 1, ctx.moving ? 8 : 2.5, ctx.dt);
      model.setStabilisers(stabilisers);
      const k = smooth(ctx.work);
      model.setLoader(lerp(0.25, 0, k), lerp(0.3, 0.05, k));
      const p = cycle(poses, workTime, 1.25);
      model.setHoe(lerpPose(model.hoeTravel, p, smooth((ctx.work - 0.15) / 0.85)));
      const segment = Math.floor((workTime / 1.25) % poses.length);
      if (
        ctx.work > 0.85 &&
        (segment === 1 || segment === 5) &&
        Math.random() < 0.5 * ctx.dt * 60
      ) {
        ctx.emit(model.bucketTip, 2, 0.35);
      }
    },
  };
}

function craneActor(): Actor {
  const model = buildMobileCrane();
  let workTime = 0;
  let slew = 0;
  let sway = 0;
  let swayVelocity = 0;
  return {
    name: 'Автокран',
    model,
    scale: 0.44,
    engineHz: 34,
    hasTurret: true,
    presentYaw: 0.75,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      model.setOutriggers(smooth(ctx.work / 0.6));
      const lift = smooth((ctx.work - 0.55) / 0.45);
      const previous = slew;
      slew = damp(slew, lift > 0.5 ? clamp(ctx.lookYaw, -1.6, 1.6) : 0, 1.2, ctx.dt);
      model.pivots.turret.rotation.y = slew;
      // The hook swings a little as the turret slews.
      const slewSpeed = ctx.dt > 0 ? (slew - previous) / ctx.dt : 0;
      swayVelocity += (-sway * 9 - swayVelocity * 1.2 - slewSpeed * 0.8) * ctx.dt;
      sway += swayVelocity * ctx.dt;
      const elevation = lerp(-0.015, 0.62 + 0.18 * Math.sin(workTime * 0.35), lift);
      const extension = lift * (0.12 + 0.1 * (0.5 + 0.5 * Math.sin(workTime * 0.27 + 1)));
      const hook = lerp(1.25, 2.2 + 1.6 * (0.5 + 0.5 * Math.sin(workTime * 0.5)), lift);
      model.setBoom(elevation, extension, hook, sway * lift + Math.sin(ctx.time * 1.3) * 0.015);
    },
  };
}

function loaderActor(): Actor {
  const model = buildWheelLoader();
  const poses = [
    { lift: 0, tilt: 0 },
    { lift: 0.04, tilt: 0.65 },
    { lift: 0.85, tilt: 0.6 },
    { lift: 0.92, tilt: -0.75 },
    { lift: 0.4, tilt: -0.2 },
  ];
  let workTime = 0;
  return {
    name: 'Фронтальный погрузчик',
    model,
    scale: 0.5,
    engineHz: 48,
    hasTurret: false,
    presentYaw: 0.7,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      const p = cycle(poses, workTime, 1.3);
      const k = smooth(ctx.work);
      model.setLoader(lerp(0.12, p.lift, k), lerp(0.4, p.tilt, k));
      const segment = Math.floor((workTime / 1.3) % poses.length);
      if (ctx.work > 0.85 && segment === 2 && Math.random() < 0.9 * ctx.dt * 60) {
        ctx.emit(model.bucketEdge, 3, 0.9);
      }
    },
  };
}

function dumpTruckActor(): Actor {
  const model = buildDumpTruck();
  let workTime = 0;
  return {
    name: 'Самосвал',
    model,
    scale: 0.52,
    engineHz: 33,
    hasTurret: false,
    presentYaw: 2.1,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      // hold → raise → hold → lower, 7 seconds per load.
      const t = workTime % 7;
      const raise =
        t < 1.5 ? 0 : t < 3.4 ? smooth((t - 1.5) / 1.9) : t < 4.8 ? 1 : 1 - smooth((t - 4.8) / 1.9);
      const tip = raise * ctx.work;
      const emptied = t < 1.5 ? 0 : t < 4.8 ? smooth((t - 2.2) / 2.4) : 1 - smooth((t - 5.2) / 1.6);
      model.setTip(tip, Math.max(0.05, 1 - emptied * ctx.work));
      if (tip > 0.45 && t < 4.8 && Math.random() < 0.9 * ctx.dt * 60) {
        ctx.emit(model.tailPoint, 3, 0.9);
      }
    },
  };
}

function bulldozerActor(): Actor {
  const model = buildBulldozer();
  let workTime = 0;
  return {
    name: 'Бульдозер',
    model,
    scale: 0.62,
    engineHz: 45,
    hasTurret: false,
    presentYaw: 0.7,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      // Blade down to push while driving; raise/lower and rip once parked.
      const parked = 0.35 + 0.3 * Math.sin(workTime * 1.6);
      model.setBlade(lerp(-0.03, parked, ctx.work));
      model.setRipper(ctx.work * (0.5 + 0.5 * Math.sin(workTime * 1.1)));
      if (ctx.moving && Math.random() < 0.9 * ctx.dt * 60) ctx.emit(model.bladeEdge, 2, 1.4);
    },
  };
}

const ACTORS = [backhoeActor, craneActor, loaderActor, dumpTruckActor, bulldozerActor];

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
  /** Headlights stay on while the mouse button / finger is held down. */
  setPressed(pressed: boolean): void;
  /** Clicking/tapping the machine sounds the horn and flashes the lights. */
  poke(clientX: number, clientY: number): void;
  setRunning(running: boolean): void;
  dispose(): void;
}

const PLATFORM_RADIUS = 4.6;
const DRIVE_RADIUS = 2.2;
const SWITCH_SECONDS = 16;
const BEAM_LENGTH = 4.5;
const BEAM_TILT = 0.12;

export function createMachinesScene(
  container: HTMLElement,
  options: {
    reducedMotion: boolean;
    onChange?: (index: number) => void;
    sound?: SceneSounds;
  },
): MachinesScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0f172a, 18, 34);
  const environment = createEnvironment(renderer);
  scene.environment = environment;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const cameraBase = new THREE.Vector3(8.7, 4.5, 9.6);
  const lookAt = new THREE.Vector3(0.2, 1.05, 0);

  scene.add(new THREE.HemisphereLight(0xdbe4f0, 0x2b2621, 0.7));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.8);
  sun.position.set(7, 11, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  scene.add(sun);
  const rim = new THREE.PointLight(AMBER, 40, 22);
  rim.position.set(-6, 4, -5);
  scene.add(rim);

  // Headlight beam that follows whatever the machine is looking at.
  const beam = new THREE.SpotLight(0xfff1c1, 0, 14, 0.4, 0.6, 1.4);
  const beamTarget = new THREE.Object3D();
  beam.target = beamTarget;
  scene.add(beam, beamTarget);

  // Site pad: an asphalt disc with a painted safety ring.
  const asphalt = createGroundTexture('asphalt');
  asphalt.repeat.set(3, 3);
  asphalt.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const padTop = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.93, metalness: 0 });
  const padSide = new THREE.MeshStandardMaterial({ color: 0x3b3c40, roughness: 0.95 });
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS + 0.12, 0.45, 96),
    [padSide, padTop, padSide],
  );
  platform.position.y = -0.225;
  platform.receiveShadow = true;
  scene.add(platform);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: AMBER,
    emissive: AMBER,
    emissiveIntensity: 0.25,
    roughness: 0.6,
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(PLATFORM_RADIUS - 0.2, PLATFORM_RADIUS - 0.08, 128),
    ringMaterial,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  ring.receiveShadow = true;
  scene.add(ring);

  // Traffic cones around the edge.
  const coneOrange = new THREE.MeshStandardMaterial({ color: 0xff5a0a, roughness: 0.55 });
  const coneWhite = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    roughness: 0.25,
    metalness: 0.35,
    emissive: 0xffffff,
    emissiveIntensity: 0.06,
  });
  const coneBlack = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.3;
    const cone = createCone(coneOrange, coneWhite, coneBlack);
    cone.position.set(Math.cos(angle) * 4.05, 0, Math.sin(angle) * 4.05);
    cone.rotation.y = angle;
    scene.add(cone);
  }

  // Target marker under the pointer.
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.4, 48),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0, depthWrite: false }),
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.position.y = 0.02;
  scene.add(reticle);
  const reticleMaterial = reticle.material as THREE.MeshBasicMaterial;

  // Dust.
  const dotTexture = softDotTexture();
  const PARTICLES = 260;
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
      map: dotTexture,
      color: 0xa89078,
      size: 0.32,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  dust.frustumCulled = false;
  scene.add(dust);
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
        (Math.random() - 0.5) * 0.6,
        Math.random() * 0.8 - 0.1,
        (Math.random() - 0.5) * 0.6,
      );
      particle.life = 1;
    }
  }

  // Lamp glow and light cones, shared by every machine.
  const haloMaterial = new THREE.SpriteMaterial({
    map: dotTexture,
    color: 0xfff1d0,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const beamMap = beamTexture();
  const lightBeamMaterial = new THREE.MeshBasicMaterial({
    map: beamMap,
    color: 0xfff1d0,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beamGeometry = new THREE.ConeGeometry(0.55, BEAM_LENGTH, 24, 1, true);

  // Machines.
  const actors = ACTORS.map((create) => {
    const actor = create();
    const holder = new THREE.Group();
    const body = new THREE.Group();
    holder.add(body);
    body.add(actor.model.root);
    actor.model.root.scale.setScalar(actor.scale);
    actor.model.materials.grime.value = 0.9 * actor.scale;
    const glows: THREE.Object3D[] = [];
    actor.model.headlights.forEach((anchor, i) => {
      const halo = new THREE.Sprite(haloMaterial);
      halo.visible = false;
      anchor.add(halo);
      glows.push(halo);
      // Visible beams only for the forward-facing driving lights.
      if (i > 1) return;
      const cone = new THREE.Mesh(beamGeometry, lightBeamMaterial);
      cone.scale.setScalar(1 / actor.scale);
      cone.rotation.z = Math.PI / 2 - BEAM_TILT;
      cone.position.set(
        (Math.cos(BEAM_TILT) * BEAM_LENGTH) / 2 / actor.scale,
        (-Math.sin(BEAM_TILT) * BEAM_LENGTH) / 2 / actor.scale,
        0,
      );
      cone.visible = false;
      anchor.add(cone);
      glows.push(cone);
    });
    return { ...actor, holder, body, glows };
  });
  type ActiveActor = (typeof actors)[number];

  const order = shuffledOrder(actors.length);
  let current = order[0] ?? 0;
  rememberShown(current);
  let active: ActiveActor = actors[current]!;
  scene.add(active.holder);

  const drive = {
    position: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    speed: 0,
    steer: 0,
    work: 1,
    wanderTarget: new THREE.Vector3(),
    repositionAt: 9,
    repositioning: false,
    turning: false,
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
  const pointerLook = new THREE.Vector3();
  const lookPlane = new THREE.Plane();
  const toCamera = new THREE.Vector3();
  const planePoint = new THREE.Vector3();
  let pointerOnGround = false;
  let hasPointer = false;
  let pressed = false;
  let lightsLevel = 0;
  let pointerActiveUntil = -1;
  let hornAt = -10;

  function toNdc(clientX: number, clientY: number) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  function updatePointerTargets() {
    raycaster.setFromCamera(pointerNdc, camera);
    // Where the pointer touches the pad (the machine drives there)…
    pointerOnGround =
      raycaster.ray.intersectPlane(groundPlane, pointerGround) !== null &&
      pointerGround.length() < PLATFORM_RADIUS + 0.5;
    // …and, for pointers anywhere else on screen, a point on a vertical plane
    // between the machine and the camera to turn towards.
    toCamera
      .set(camera.position.x - drive.position.x, 0, camera.position.z - drive.position.z)
      .normalize();
    planePoint.copy(drive.position).addScaledVector(toCamera, 3).setY(1.2);
    lookPlane.setFromNormalAndCoplanarPoint(toCamera, planePoint);
    if (!raycaster.ray.intersectPlane(lookPlane, pointerLook)) pointerLook.copy(planePoint);
  }

  function faceCameraYaw() {
    return Math.atan2(
      -(camera.position.z - drive.position.z),
      camera.position.x - drive.position.x,
    );
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

  let lastDirtSoundAt = -10;
  /** Dust from a machine part, with a (throttled) dirt sound. */
  function workEmit(origin: THREE.Object3D, count: number, spread: number) {
    emit(origin.getWorldPosition(anchorWorld), count, spread);
    if (elapsed - lastDirtSoundAt > 1.4) {
      lastDirtSoundAt = elapsed;
      options.sound?.play('dirt');
    }
  }

  function placeCamera() {
    camera.position.set(
      cameraBase.x + smoothPointer.x * 1.4,
      cameraBase.y + smoothPointer.y * 0.7,
      cameraBase.z - smoothPointer.x * 0.9,
    );
    if (camera.aspect < 1) camera.position.multiplyScalar(1.32);
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();
  }

  function startTransition(next: number) {
    if (next === current || transition?.next === next) return;
    autoSwitchAt = wallTime + SWITCH_SECONDS;
    if (options.reducedMotion) {
      swapTo(next);
      active.body.scale.setScalar(1);
      render();
      return;
    }
    transition = { phase: 'out', t: 0, next };
  }

  function swapTo(next: number) {
    for (const glow of active.glows) glow.visible = false;
    scene.remove(active.holder);
    current = next;
    active = actors[current]!;
    scene.add(active.holder);
    drive.work = 1;
    drive.speed = 0;
    drive.repositionAt = elapsed + 8;
    drive.repositioning = false;
    drive.yaw = faceCameraYaw() + active.presentYaw;
    emit(drive.position.clone().setY(0.2), 40, 2.5);
    options.sound?.play('appear');
    rememberShown(current);
    options.onChange?.(current);
  }

  // Start with the first machine presented at its best angle.
  placeCamera();
  drive.yaw = faceCameraYaw() + active.presentYaw;

  function render() {
    const rawDelta = clock.getDelta();
    const dt = Math.min(rawDelta, 0.05);
    wallTime += Math.min(rawDelta, 1);
    const animate = !options.reducedMotion;
    if (animate) elapsed += dt;

    placeCamera();

    // --- Choose where to go and what to look at. -------------------------
    const pointerActive = animate && hasPointer && elapsed < pointerActiveUntil;
    if (pointerActive) {
      updatePointerTargets();
      drive.repositioning = false;
      drive.repositionAt = elapsed + 6;
      if (pointerOnGround) {
        lookTarget.copy(pointerGround);
        followTarget.copy(pointerGround);
        if (followTarget.length() > DRIVE_RADIUS) followTarget.setLength(DRIVE_RADIUS);
      } else {
        const toward = Math.atan2(
          -(pointerLook.z - drive.position.z),
          pointerLook.x - drive.position.x,
        );
        lookTarget.set(
          drive.position.x + Math.cos(toward) * 3,
          0,
          drive.position.z - Math.sin(toward) * 3,
        );
        followTarget.copy(drive.position);
      }
    } else {
      // On its own the machine works in place, now and then moving to a new spot.
      if (!drive.repositioning && elapsed > drive.repositionAt) {
        const angle = Math.random() * Math.PI * 2;
        drive.wanderTarget
          .set(Math.cos(angle), 0, Math.sin(angle))
          .multiplyScalar(0.4 + Math.random() * 1.2);
        drive.repositioning = true;
      }
      if (drive.repositioning) {
        followTarget.copy(drive.wanderTarget);
        lookTarget.copy(drive.wanderTarget);
        if (followTarget.distanceTo(drive.position) < 0.35) {
          drive.repositioning = false;
          drive.repositionAt = elapsed + 9 + Math.random() * 4;
        }
      } else {
        followTarget.copy(drive.position);
        const heading = faceCameraYaw() + active.presentYaw;
        lookTarget.set(
          drive.position.x + Math.cos(heading) * 5,
          0,
          drive.position.z - Math.sin(heading) * 5,
        );
      }
    }

    // --- Drive. ------------------------------------------------------------
    const dx = followTarget.x - drive.position.x;
    const dz = followTarget.z - drive.position.z;
    const distance = Math.hypot(dx, dz);
    const stopDistance = pointerActive ? 1.9 : 0.3;
    const toPointer = Math.hypot(lookTarget.x - drive.position.x, lookTarget.z - drive.position.z);
    const wantsToMove =
      animate && !transition && distance > stopDistance && (!pointerActive || toPointer > 2.3);
    const lookHeading = Math.atan2(
      -(lookTarget.z - drive.position.z),
      lookTarget.x - drive.position.x,
    );
    let lookYaw = wrapAngle(lookHeading - drive.yaw);
    // Turn the whole machine in place (turret machines only when idle), with
    // some hysteresis so it doesn't fidget.
    const canTurn = animate && !transition && (!active.hasTurret || !pointerActive);
    if (!canTurn || Math.abs(lookYaw) < 0.08) drive.turning = false;
    else if (Math.abs(lookYaw) > 0.35) drive.turning = true;
    let moving = false;
    const previousYaw = drive.yaw;
    // Machines stow their gear (work → 0) before they drive off or turn.
    if (wantsToMove) {
      const heading = Math.atan2(-dz, dx);
      if (drive.work < 0.3) {
        drive.yaw = approachAngle(drive.yaw, heading, dt * 1.3);
        const aligned = Math.abs(wrapAngle(heading - drive.yaw)) < 0.5;
        drive.speed = damp(drive.speed, aligned ? Math.min(1.5, distance * 1.1) : 0.35, 2.2, dt);
      }
      moving = true;
    } else {
      drive.speed = damp(drive.speed, 0, 3.5, dt);
      if (drive.turning) {
        if (drive.work < 0.3) drive.yaw = approachAngle(drive.yaw, lookHeading, dt * 0.8);
        moving = true;
      }
    }
    drive.position.x += Math.cos(drive.yaw) * drive.speed * dt;
    drive.position.z -= Math.sin(drive.yaw) * drive.speed * dt;
    drive.work = damp(drive.work, moving ? 0 : 1, moving ? 3.5 : 1.2, dt);
    lookYaw = wrapAngle(lookHeading - drive.yaw);

    const machine = active;
    const turnRate = dt > 0 ? wrapAngle(drive.yaw - previousYaw) / dt : 0;
    drive.steer = damp(drive.steer, clamp(turnRate * 0.9, -0.6, 0.6), 4, dt || 1);
    machine.model.steer(drive.steer);
    const yawStep = Math.abs(wrapAngle(drive.yaw - previousYaw));
    machine.model.roll((drive.speed * dt + yawStep * 0.8) / machine.scale);

    // Engine vibration, and a nod on the suspension after the horn.
    const idle = animate ? Math.sin(elapsed * 55) * 0.0025 : 0;
    const hornT = elapsed - hornAt;
    const nod = hornT < 1.2 ? Math.sin(hornT * 9) * Math.exp(-hornT * 3) * 0.012 : 0;
    machine.holder.position.set(drive.position.x, idle, drive.position.z);
    machine.body.rotation.z = nod;

    // --- Switching machines. ----------------------------------------------
    let baseScale = 1;
    if (transition) {
      transition.t += dt / (transition.phase === 'out' ? 0.4 : 0.6);
      if (transition.phase === 'out') {
        baseScale = Math.max(0.001, 1 - smooth(transition.t));
        if (transition.t >= 1) {
          swapTo(transition.next);
          transition = { phase: 'in', t: 0, next: transition.next };
          baseScale = 0.001;
        }
      } else {
        baseScale = Math.max(0.001, smooth(Math.min(1, transition.t)));
        if (transition.t >= 1) transition = null;
      }
    } else if (animate && wallTime > autoSwitchAt) {
      const position = order.indexOf(current);
      startTransition(order[(position + 1) % order.length] ?? 0);
    }
    active.body.scale.setScalar(baseScale);
    active.holder.rotation.y = drive.yaw;

    active.update({
      time: elapsed,
      dt: animate ? dt : 0,
      work: drive.work,
      moving,
      lookYaw,
      emit: workEmit,
    });
    active.model.update();

    // Engine note follows throttle and hydraulic load.
    if (animate && running) {
      const throttle = clamp(0.3 + (drive.speed / 1.5) * 0.6 + drive.work * 0.15, 0, 1);
      options.sound?.engine(throttle * baseScale, active.engineHz);
    }

    // Beacon and lamps.
    const { materials } = active.model;
    for (const rotator of active.model.beacons) rotator.rotation.y = elapsed * 7;
    materials.beacon.emissiveIntensity = 1.1 + 0.9 * Math.max(0, Math.sin(elapsed * 7));
    // Holding the mouse button (or a finger) down switches the headlights on;
    // the horn comes with two quick flashes.
    const flash = hornT < 0.7 && Math.sin((hornT / 0.7) * Math.PI * 4) > 0 ? 1 : 0;
    lightsLevel = damp(lightsLevel, pressed ? 1 : 0, pressed ? 14 : 4, dt || 1);
    const level = Math.max(lightsLevel, flash);
    materials.lens.emissiveIntensity = 0.05 + level * 8;
    haloMaterial.opacity = level;
    lightBeamMaterial.opacity = 0.14 * level;
    for (const glow of active.glows) {
      glow.visible = level > 0.01;
      if (glow instanceof THREE.Sprite) {
        glow.scale.setScalar(
          ((0.35 + 0.6 * level) * (1 + Math.sin(elapsed * 40) * 0.03)) / active.scale,
        );
      }
    }
    const front = active.model.headlights[0];
    if (front) {
      front.getWorldPosition(anchorWorld);
      beam.position.copy(anchorWorld);
    }
    beamTarget.position.copy(lookTarget);
    beam.angle = 0.4 + 0.15 * level;
    beam.intensity = damp(beam.intensity, (pointerActive ? 25 : 0) + 240 * level, 6, dt || 1);
    const reticleOn = pointerActive && pointerOnGround && pointerGround.length() < PLATFORM_RADIUS;
    reticle.position.set(pointerGround.x, 0.02, pointerGround.z);
    reticleMaterial.opacity = damp(reticleMaterial.opacity, reticleOn ? 0.75 : 0, 8, dt || 1);

    if (animate) {
      particles.forEach((particle, i) => {
        if (particle.life > 0) {
          particle.life -= dt * 0.55;
          particle.velocity.y -= dt * 0.6;
          particle.velocity.multiplyScalar(1 - dt * 0.8);
          particle.position.addScaledVector(particle.velocity, dt);
          particle.position.y = Math.max(0.04, particle.position.y);
          if (particle.life <= 0) particle.position.y = -100;
        }
        dustPositions.setXYZ(i, particle.position.x, particle.position.y, particle.position.z);
      });
      dustPositions.needsUpdate = true;
    }

    renderer.render(scene, camera);
    if (running && animate) frame = requestAnimationFrame(render);
  }
  render();

  return {
    machines: actors.map((actor) => actor.name),
    get current() {
      return current;
    },
    show(index) {
      if (index >= 0 && index < actors.length) startTransition(index);
    },
    setPointer(clientX, clientY) {
      const ndc = toNdc(clientX, clientY);
      if (!ndc) return;
      pointerNdc.copy(ndc);
      smoothPointer.x = damp(smoothPointer.x, clamp(ndc.x, -1.5, 1.5), 1, 0.3);
      smoothPointer.y = damp(smoothPointer.y, clamp(-ndc.y, -1.5, 1.5), 1, 0.3);
      hasPointer = true;
      pointerActiveUntil = elapsed + 4;
    },
    setPressed(next) {
      if (next !== pressed) options.sound?.play(next ? 'lightsOn' : 'lightsOff');
      pressed = next;
      if (options.reducedMotion) {
        lightsLevel = next ? 1 : 0;
        render();
      }
    },
    poke(clientX, clientY) {
      const ndc = toNdc(clientX, clientY);
      if (!ndc || transition?.phase === 'out') return;
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.intersectObject(active.holder, true).length === 0) return;
      options.sound?.play('horn');
      hornAt = elapsed;
      if (options.reducedMotion) render();
    },
    setRunning(next) {
      if (next === running) return;
      running = next;
      cancelAnimationFrame(frame);
      if (!running) options.sound?.engine(0, 40);
      if (running) {
        clock.getDelta();
        render();
      }
    },
    dispose() {
      running = false;
      options.sound?.engine(0, 40);
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      for (const actor of actors) {
        for (const glow of actor.glows) glow.removeFromParent();
        actor.model.dispose();
      }
      const disposed = new Set<{ dispose(): void }>();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points ||
          object instanceof THREE.Sprite
        ) {
          const materialList = Array.isArray(object.material) ? object.material : [object.material];
          for (const item of [object.geometry, ...materialList] as { dispose(): void }[]) {
            if (!disposed.has(item)) {
              disposed.add(item);
              item.dispose();
            }
          }
        }
      });
      for (const item of [
        haloMaterial,
        lightBeamMaterial,
        beamGeometry,
        beamMap,
        dotTexture,
        asphalt,
        environment,
      ]) {
        item.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
