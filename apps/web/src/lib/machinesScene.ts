import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SceneSounds, SoundName } from './machineSounds';

// Animated 3D hero scene: a rotating cast of cartoon construction machines on a
// floating platform. Each machine has a face — blinking eyes that follow the
// pointer, eyebrows and a mouth — and reacts with emotions: surprised when it
// appears, curious while chasing the pointer, happy next to it, overjoyed when
// clicked, focused while working and sleepy when left alone. Imported
// dynamically from Hero3D so three.js stays out of the main bundle.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AMBER = 0xf59e0b;
const INK = 0x1f1b2e;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smooth(t: number) {
  const x = clamp(t, 0, 1);
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

// ---------------------------------------------------------------------------
// Cartoon materials: 3-step toon shading plus an inverted-hull ink outline.
// ---------------------------------------------------------------------------

function createToonGradient() {
  const texture = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createOutlineMaterial() {
  const material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed += normalize(normal) * 0.028;',
    );
  };
  return material;
}

const LAMP_OFF = new THREE.Color(0xd9d2b8);
const LAMP_ON = new THREE.Color(0xffffff);

/** Soft round glow for lamp halos, and a fading gradient for light beams. */
function createGlowTextures() {
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 64;
  const halo = haloCanvas.getContext('2d');
  if (halo) {
    const g = halo.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,244,200,0.8)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
    halo.fillStyle = g;
    halo.fillRect(0, 0, 64, 64);
  }
  const beamCanvas = document.createElement('canvas');
  beamCanvas.width = 4;
  beamCanvas.height = 64;
  const beam = beamCanvas.getContext('2d');
  if (beam) {
    // Top of the texture maps to the cone tip at the lamp.
    const g = beam.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    beam.fillStyle = g;
    beam.fillRect(0, 0, 4, 64);
  }
  return {
    halo: new THREE.CanvasTexture(haloCanvas),
    beam: new THREE.CanvasTexture(beamCanvas),
  };
}
type GlowTextures = ReturnType<typeof createGlowTextures>;

function createMaterials(
  gradientMap: THREE.Texture,
  glowTextures: GlowTextures,
  paint: number,
  paintDark: number,
) {
  const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap });
  return {
    paint: toon(paint),
    paintDark: toon(paintDark),
    steel: toon(0x475569),
    chrome: toon(0xcbd5e1),
    rubber: toon(0x27272a),
    soil: toon(0xa16207),
    glass: toon(0xbae6fd),
    eyeWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    pupil: new THREE.MeshBasicMaterial({ color: INK }),
    brow: new THREE.MeshBasicMaterial({ color: INK }),
    cheek: new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0 }),
    lamp: new THREE.MeshBasicMaterial({ color: LAMP_OFF.clone() }),
    halo: new THREE.SpriteMaterial({
      map: glowTextures.halo,
      color: 0xfff1b8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    lightBeam: new THREE.MeshBasicMaterial({
      map: glowTextures.beam,
      color: 0xfff1b8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
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
  const radius = Math.min(w, h, d) * 0.32;
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), material);
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
    new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.04, 8),
    m.chrome,
  );
  hub.rotation.x = Math.PI / 2;
  group.add(tyre, hub);
  return group;
}

interface Headlights {
  /** Where the scene's spotlight beam starts. */
  anchor: THREE.Object3D;
  /** 0 = off, 1 = full beam: lamp glow, halos and visible light cones. */
  setLevel(level: number, time: number): void;
}

const BEAM_LENGTH = 3.2;
const BEAM_TILT = 0.14;

function headlights(
  m: Materials,
  parent: THREE.Object3D,
  x: number,
  y: number,
  zs: number[],
): Headlights {
  const halos: THREE.Sprite[] = [];
  const beams: THREE.Mesh[] = [];
  const beamGeometry = new THREE.ConeGeometry(0.5, BEAM_LENGTH, 24, 1, true);
  for (const z of zs) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), m.lamp);
    lamp.position.set(x, y, z);
    parent.add(lamp);

    const halo = new THREE.Sprite(m.halo);
    halo.position.set(x + 0.08, y, z);
    halo.visible = false;
    parent.add(halo);
    halos.push(halo);

    // Cone with its tip at the lamp, opening forward and slightly downward.
    const beam = new THREE.Mesh(beamGeometry, m.lightBeam);
    beam.rotation.z = Math.PI / 2 - BEAM_TILT;
    beam.position.set(
      x + Math.cos(BEAM_TILT) * (BEAM_LENGTH / 2),
      y - Math.sin(BEAM_TILT) * (BEAM_LENGTH / 2),
      z,
    );
    beam.visible = false;
    beam.userData.noOutline = true;
    parent.add(beam);
    beams.push(beam);
  }
  const anchor = new THREE.Object3D();
  anchor.position.set(x + 0.05, y, 0);
  parent.add(anchor);

  return {
    anchor,
    setLevel(level, time) {
      const on = level > 0.01;
      m.lamp.color.copy(LAMP_OFF).lerp(LAMP_ON, clamp(level, 0, 1));
      m.halo.opacity = clamp(level, 0, 1);
      m.lightBeam.opacity = 0.28 * clamp(level, 0, 1);
      const flicker = 1 + Math.sin(time * 40) * 0.04;
      for (const halo of halos) {
        halo.visible = on;
        halo.scale.setScalar((0.35 + 0.75 * level) * flicker);
      }
      for (const beam of beams) beam.visible = on;
    },
  };
}

function beacon(m: Materials, parent: THREE.Object3D, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), m.beacon);
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

function tracks(m: Materials, root: THREE.Group, length: number, zs: number[]) {
  const rollers: THREE.Object3D[] = [];
  for (const z of zs) {
    root.add(box(length, 0.55, 0.5, m.rubber, 0, 0.28, z));
    const count = Math.round(length / 0.7);
    for (let i = 0; i < count; i++) {
      const roller = wheel(m, 0.18, 0.54, -length / 2 + 0.35 + i * 0.7, 0.28, z);
      rollers.push(roller);
      root.add(roller);
    }
  }
  return rollers;
}

/** Gives every mesh of a machine a cartoon ink outline (skipping face details). */
function addOutlines(root: THREE.Object3D, outline: THREE.Material) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !object.userData.noOutline) meshes.push(object);
  });
  for (const mesh of meshes) {
    const hull = new THREE.Mesh(mesh.geometry, outline);
    hull.userData.noOutline = true;
    mesh.add(hull);
  }
}

// ---------------------------------------------------------------------------
// Faces and emotions
// ---------------------------------------------------------------------------

export type Emotion = 'happy' | 'curious' | 'surprised' | 'joy' | 'sleepy' | 'focused';
type MouthShape = 'smile' | 'grin' | 'o' | 'small-o' | 'flat' | 'sleepy';

const EXPRESSIONS: Record<
  Emotion,
  { open: number; browRaise: number; browTilt: number; mouth: MouthShape; blush: number }
> = {
  happy: { open: 0.85, browRaise: 0.03, browTilt: -0.15, mouth: 'smile', blush: 0.5 },
  curious: { open: 1.15, browRaise: 0.06, browTilt: -0.3, mouth: 'small-o', blush: 0 },
  surprised: { open: 1.35, browRaise: 0.1, browTilt: 0, mouth: 'o', blush: 0 },
  joy: { open: 1, browRaise: 0.07, browTilt: -0.2, mouth: 'grin', blush: 0.9 },
  sleepy: { open: 0.22, browRaise: -0.03, browTilt: 0.25, mouth: 'sleepy', blush: 0 },
  focused: { open: 0.7, browRaise: -0.03, browTilt: 0.45, mouth: 'flat', blush: 0 },
};

function drawMouth(ctx: CanvasRenderingContext2D, shape: MouthShape) {
  const ink = '#1f1b2e';
  ctx.clearRect(0, 0, 128, 64);
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.beginPath();
  switch (shape) {
    case 'smile':
      ctx.moveTo(30, 20);
      ctx.quadraticCurveTo(64, 62, 98, 20);
      ctx.stroke();
      break;
    case 'grin':
      ctx.moveTo(24, 14);
      ctx.lineTo(104, 14);
      ctx.quadraticCurveTo(64, 80, 24, 14);
      ctx.fillStyle = '#7f1d1d';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(64, 42, 16, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fb7185';
      ctx.fill();
      break;
    case 'o':
      ctx.ellipse(64, 32, 15, 20, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7f1d1d';
      ctx.fill();
      ctx.stroke();
      break;
    case 'small-o':
      ctx.ellipse(64, 32, 9, 11, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7f1d1d';
      ctx.fill();
      ctx.stroke();
      break;
    case 'flat':
      ctx.moveTo(38, 34);
      ctx.lineTo(90, 30);
      ctx.stroke();
      break;
    case 'sleepy':
      ctx.moveTo(44, 34);
      ctx.quadraticCurveTo(54, 26, 64, 34);
      ctx.quadraticCurveTo(74, 42, 84, 34);
      ctx.stroke();
      break;
  }
}

interface Face {
  update(dt: number, time: number, emotion: Emotion, lookWorld: THREE.Vector3): void;
}

/**
 * Builds a cartoon face on `parent`, facing its local +x axis: two blinking
 * eyes whose pupils track `lookWorld`, eyebrows, blush and a canvas mouth.
 */
function createFace(
  m: Materials,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  size: number,
): Face {
  const face = new THREE.Group();
  face.position.set(x, y, z);
  face.scale.setScalar(size);
  parent.add(face);

  const eyes: {
    eye: THREE.Group;
    pupil: THREE.Group;
    brow: THREE.Mesh;
    happyArc: THREE.Mesh;
    side: number;
  }[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(0, 0.1, side * 0.17);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), m.eyeWhite);
    white.scale.x = 0.5;
    const pupil = new THREE.Group();
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.068, 20, 14), m.pupil);
    iris.scale.x = 0.35;
    iris.userData.noOutline = true;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), m.eyeWhite);
    shine.position.set(0.03, 0.028, -0.022);
    shine.userData.noOutline = true;
    pupil.add(iris, shine);
    pupil.position.x = 0.052;
    eye.add(white, pupil);
    face.add(eye);

    // "^ ^" eyes for joy.
    const happyArc = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.025, 8, 20, Math.PI), m.pupil);
    happyArc.rotation.y = Math.PI / 2;
    happyArc.position.set(0.06, 0.06, side * 0.17);
    happyArc.visible = false;
    happyArc.userData.noOutline = true;
    face.add(happyArc);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.17), m.brow);
    brow.position.set(0.03, 0.29, side * 0.17);
    brow.userData.noOutline = true;
    face.add(brow);

    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), m.cheek);
    cheek.rotation.y = Math.PI / 2;
    cheek.position.set(0.04, -0.08, side * 0.27);
    cheek.userData.noOutline = true;
    face.add(cheek);

    eyes.push({ eye, pupil, brow, happyArc, side });
  }

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const mouthTexture = new THREE.CanvasTexture(canvas);
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.17),
    new THREE.MeshBasicMaterial({ map: mouthTexture, transparent: true, depthWrite: false }),
  );
  mouth.rotation.y = Math.PI / 2;
  mouth.position.set(0.05, -0.17, 0);
  mouth.userData.noOutline = true;
  face.add(mouth);

  let currentMouth: MouthShape | null = null;
  let open = 1;
  let browRaise = 0;
  let browTilt = 0;
  let nextBlink = 1 + Math.random() * 2;
  let blinkStart = -10;
  let doubleBlink = false;
  const local = new THREE.Vector3();

  return {
    update(dt, time, emotion, lookWorld) {
      const expression = EXPRESSIONS[emotion];

      // Blinking ("хлопает глазами"): quick close/open, sometimes twice.
      if (time > nextBlink) {
        blinkStart = time;
        doubleBlink = Math.random() < 0.3;
        nextBlink = time + 1.6 + Math.random() * 3.2;
      }
      const sinceBlink = time - blinkStart;
      const blinkPulse = (t: number) => (t >= 0 && t < 0.16 ? Math.sin((t / 0.16) * Math.PI) : 0);
      const blink = Math.max(
        blinkPulse(sinceBlink),
        doubleBlink ? blinkPulse(sinceBlink - 0.22) : 0,
      );

      open = damp(open, expression.open, 10, dt);
      browRaise = damp(browRaise, expression.browRaise, 8, dt);
      browTilt = damp(browTilt, expression.browTilt, 8, dt);
      m.cheek.opacity = damp(m.cheek.opacity, expression.blush, 5, dt);

      const joyful = emotion === 'joy';
      for (const { eye, pupil, brow, happyArc, side } of eyes) {
        eye.visible = !joyful;
        happyArc.visible = joyful;
        eye.scale.y = Math.max(0.06, open * (1 - blink * 0.95));
        brow.position.y = 0.27 + browRaise + (open - 1) * 0.08;
        brow.rotation.x = side * browTilt;

        // Pupils look towards the target.
        local.copy(lookWorld);
        eye.worldToLocal(local);
        local.x = Math.max(local.x, 0.2);
        local.normalize();
        pupil.position.y = clamp(local.y * 0.09, -0.055, 0.055);
        pupil.position.z = clamp(local.z * 0.09, -0.055, 0.055);
      }

      if (ctx && expression.mouth !== currentMouth) {
        currentMouth = expression.mouth;
        drawMouth(ctx, currentMouth);
        mouthTexture.needsUpdate = true;
      }
    },
  };
}

type Emote = 'heart' | '!' | '?' | 'zzz' | 'note';

const EMOTES: Partial<Record<Emotion, Emote>> = {
  joy: 'heart',
  surprised: '!',
  curious: '?',
  sleepy: 'zzz',
  happy: 'note',
};

function createEmoteTexture(emote: Emote) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Speech bubble.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1f1b2e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(64, 56, 50, 44, 0, 0, Math.PI * 2);
    ctx.moveTo(44, 92);
    ctx.lineTo(34, 120);
    ctx.lineTo(62, 98);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(64, 56, 47, 41, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    switch (emote) {
      case 'heart':
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(64, 82);
        ctx.bezierCurveTo(20, 56, 34, 20, 64, 40);
        ctx.bezierCurveTo(94, 20, 108, 56, 64, 82);
        ctx.fill();
        break;
      case '!':
        ctx.fillStyle = '#f97316';
        ctx.font = 'bold 72px sans-serif';
        ctx.fillText('!', 64, 58);
        break;
      case '?':
        ctx.fillStyle = '#0ea5e9';
        ctx.font = 'bold 68px sans-serif';
        ctx.fillText('?', 64, 58);
        break;
      case 'zzz':
        ctx.fillStyle = '#8b5cf6';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('Z', 44, 68);
        ctx.font = 'bold 42px sans-serif';
        ctx.fillText('Z', 66, 54);
        ctx.font = 'bold 50px sans-serif';
        ctx.fillText('Z', 88, 40);
        break;
      case 'note':
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        ctx.ellipse(50, 74, 13, 10, -0.4, 0, Math.PI * 2);
        ctx.ellipse(84, 66, 13, 10, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(58, 26, 7, 48);
        ctx.fillRect(92, 18, 7, 48);
        ctx.beginPath();
        ctx.moveTo(58, 26);
        ctx.lineTo(99, 18);
        ctx.lineTo(99, 30);
        ctx.lineTo(58, 38);
        ctx.fill();
        break;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  lights: Headlights;
  /** The emote bubble floats above this point. */
  head: THREE.Object3D;
  face: Face;
  /** Machines with a turret look at the target with it; others turn in place. */
  hasTurret: boolean;
  update(ctx: MachineContext): void;
}

function headAnchor(parent: THREE.Object3D, x: number, y: number, z: number) {
  const anchor = new THREE.Object3D();
  anchor.position.set(x, y, z);
  parent.add(anchor);
  return anchor;
}

function buildExcavator(m: Materials): Machine {
  const root = new THREE.Group();
  const wheels = tracks(m, root, 2.8, [-0.75, 0.75]);

  const turret = new THREE.Group();
  turret.position.y = 0.6;
  root.add(turret);
  turret.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.2, 24), m.steel));
  turret.add(box(2.2, 0.75, 1.6, m.paint, -0.3, 0.5, 0));
  turret.add(box(0.5, 0.65, 1.6, m.paintDark, -1.4, 0.45, 0));
  turret.add(box(1.0, 1.0, 0.9, m.paint, 0.3, 1.3, 0.35));
  turret.add(box(0.06, 0.8, 0.75, m.glass, 0.8, 1.32, 0.35));
  beacon(m, turret, 0.3, 1.88, 0.35);
  const lights = headlights(m, turret, 0.83, 0.92, [0.1, 0.6]);
  const face = createFace(m, turret, 0.83, 1.33, 0.35, 1.05);
  const head = headAnchor(turret, 0.3, 2.5, 0.35);

  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.7, 0.8, -0.35);
  turret.add(boomPivot);
  boomPivot.add(box(2.4, 0.34, 0.36, m.paint, 1.2, 0, 0));
  const armPivot = new THREE.Group();
  armPivot.position.x = 2.4;
  boomPivot.add(armPivot);
  armPivot.add(box(1.7, 0.26, 0.3, m.paintDark, 0.85, 0, 0));
  const bucketPivot = new THREE.Group();
  bucketPivot.position.x = 1.7;
  armPivot.add(bucketPivot);
  bucketPivot.add(box(0.5, 0.1, 0.62, m.steel, 0.25, 0, 0));
  bucketPivot.add(box(0.1, 0.45, 0.62, m.steel, 0.5, -0.2, 0));
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
    wheelRadius: 0.18,
    lights,
    head,
    face,
    hasTurret: true,
    update(ctx) {
      turret.rotation.y = damp(turret.rotation.y, ctx.lookYaw, 4, ctx.dt);
      if (!ctx.moving) workTime += ctx.dt;
      const p = cycle(poses, workTime, 1.3);
      boomPivot.rotation.z = lerp(travel.boom, p.boom, ctx.work);
      armPivot.rotation.z = lerp(travel.arm, p.arm, ctx.work);
      bucketPivot.rotation.z = lerp(travel.bucket, p.bucket, ctx.work);
      const segment = Math.floor((workTime / 1.3) % poses.length);
      if (ctx.work > 0.8 && (segment === 1 || segment === 3) && Math.random() < 0.6 * ctx.dt * 60) {
        ctx.emit(tip.getWorldPosition(tipWorld), 2, 0.4);
      }
    },
  };
}

function buildCrane(m: Materials): Machine {
  const root = new THREE.Group();
  root.add(box(3.6, 0.5, 1.3, m.steel, 0, 0.75, 0));
  root.add(box(0.8, 0.95, 1.3, m.paint, 1.4, 1.4, 0));
  root.add(box(0.06, 0.75, 1.1, m.glass, 1.8, 1.45, 0));
  const lights = headlights(m, root, 1.82, 1.02, [-0.45, 0.45]);
  const face = createFace(m, root, 1.83, 1.42, 0, 1.3);
  const head = headAnchor(root, 1.4, 2.6, 0);
  beacon(m, root, 1.4, 1.95, 0);

  const wheels: THREE.Object3D[] = [];
  for (const x of [1.2, -0.4, -1.2]) {
    for (const z of [-0.62, 0.62]) {
      const w = wheel(m, 0.4, 0.32, x, 0.4, z);
      wheels.push(w);
      root.add(w);
    }
  }

  const outriggers: { beam: THREE.Mesh; side: number }[] = [];
  for (const x of [0.75, -1.5]) {
    for (const side of [-1, 1]) {
      const beam = box(0.2, 0.2, 0.9, m.paintDark, x, 0.6, side * 0.5);
      beam.add(box(0.32, 0.5, 0.32, m.steel, 0, -0.25, side * 0.45));
      outriggers.push({ beam, side });
      root.add(beam);
    }
  }

  const turret = new THREE.Group();
  turret.position.set(-0.6, 1.0, 0);
  root.add(turret);
  turret.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 24), m.steel));
  turret.add(box(1.6, 0.5, 1.1, m.paint, -0.3, 0.3, 0));
  turret.add(box(0.6, 0.6, 0.45, m.paint, 0.25, 0.7, 0.55));
  turret.add(box(0.5, 0.6, 1.1, m.paintDark, -1.2, 0.4, 0));

  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.4, 0.55, -0.1);
  turret.add(boomPivot);
  boomPivot.add(box(2.6, 0.38, 0.38, m.paint, 1.3, 0, 0));
  const inner = box(2.4, 0.28, 0.28, m.paintDark, 1.2, 0, 0);
  boomPivot.add(inner);
  const hanger = new THREE.Group();
  hanger.position.x = 1.2;
  inner.add(hanger);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), m.chrome);
  rope.userData.noOutline = true;
  hanger.add(rope);
  const hook = new THREE.Group();
  hook.add(box(0.28, 0.32, 0.28, m.paint));
  const hookCurve = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.035, 8, 16, Math.PI * 1.4),
    m.steel,
  );
  hookCurve.position.y = -0.27;
  hook.add(hookCurve);
  hanger.add(hook);

  let workTime = 0;
  return {
    name: 'Автокран',
    root,
    wheels,
    wheelRadius: 0.4,
    lights,
    head,
    face,
    hasTurret: false,
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
      hook.position.y = -ropeLength - 0.16;
      for (const { beam, side } of outriggers) beam.position.z = side * (0.5 + 0.55 * ctx.work);
    },
  };
}

function buildLoader(m: Materials): Machine {
  const root = new THREE.Group();
  root.add(box(1.5, 0.95, 1.35, m.paint, -0.65, 1.0, 0));
  root.add(box(0.6, 0.65, 1.15, m.paintDark, -1.3, 0.95, 0));
  root.add(box(1.0, 1.0, 1.2, m.paint, 0.0, 1.85, 0));
  root.add(box(0.06, 0.8, 1.0, m.glass, 0.5, 1.87, 0));
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10), m.chrome);
  exhaust.position.set(-1.1, 1.75, 0.38);
  root.add(exhaust);
  root.add(box(0.9, 0.5, 0.9, m.steel, 0.85, 0.85, 0));
  beacon(m, root, 0.0, 2.42, 0);
  const lights = headlights(m, root, 1.32, 0.95, [-0.28, 0.28]);
  const face = createFace(m, root, 0.53, 1.85, 0, 1.2);
  const head = headAnchor(root, 0.0, 3.0, 0);

  const wheels: THREE.Object3D[] = [];
  for (const x of [-0.95, 0.9]) {
    for (const z of [-0.78, 0.78]) {
      const w = wheel(m, 0.52, 0.42, x, 0.52, z);
      wheels.push(w);
      root.add(w);
    }
  }

  const arms = new THREE.Group();
  arms.position.set(0.9, 1.2, 0);
  root.add(arms);
  for (const z of [-0.45, 0.45]) arms.add(box(1.5, 0.2, 0.16, m.paintDark, 0.75, 0, z));
  const bucket = new THREE.Group();
  bucket.position.x = 1.5;
  arms.add(bucket);
  bucket.add(box(0.1, 0.6, 1.5, m.steel, 0.1, -0.1, 0));
  bucket.add(box(0.55, 0.1, 1.5, m.steel, 0.35, -0.4, 0));
  for (const z of [-0.74, 0.74]) bucket.add(box(0.55, 0.5, 0.07, m.steel, 0.35, -0.15, z));
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
    wheelRadius: 0.52,
    lights,
    head,
    face,
    hasTurret: false,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      const p = cycle(poses, workTime, 1.2);
      arms.rotation.z = lerp(travel.arms, p.arms, ctx.work);
      bucket.rotation.z = lerp(travel.bucket, p.bucket, ctx.work);
      const segment = Math.floor((workTime / 1.2) % poses.length);
      if (ctx.work > 0.8 && segment === 3 && Math.random() < 0.8 * ctx.dt * 60) {
        ctx.emit(tip.getWorldPosition(tipWorld), 3, 0.8);
      }
    },
  };
}

function buildDumpTruck(m: Materials): Machine {
  const root = new THREE.Group();
  root.add(box(3.8, 0.38, 1.15, m.steel, 0, 0.75, 0));
  root.add(box(1.05, 1.2, 1.5, m.paint, 1.38, 1.5, 0));
  root.add(box(0.06, 0.8, 1.3, m.glass, 1.9, 1.58, 0));
  root.add(box(0.22, 0.3, 1.55, m.chrome, 1.95, 0.85, 0));
  beacon(m, root, 1.38, 2.18, 0);
  const lights = headlights(m, root, 1.93, 1.1, [-0.55, 0.55]);
  const face = createFace(m, root, 1.92, 1.52, 0, 1.4);
  const head = headAnchor(root, 1.38, 2.8, 0);

  const wheels: THREE.Object3D[] = [];
  for (const x of [1.3, -0.9, -1.6]) {
    for (const z of [-0.68, 0.68]) {
      const w = wheel(m, 0.47, 0.36, x, 0.47, z);
      wheels.push(w);
      root.add(w);
    }
  }

  const bed = new THREE.Group();
  bed.position.set(-1.9, 1.02, 0);
  root.add(bed);
  bed.add(box(2.8, 0.12, 1.5, m.paintDark, 1.4, 0, 0));
  for (const z of [-0.72, 0.72]) bed.add(box(2.8, 0.7, 0.08, m.paintDark, 1.4, 0.35, z));
  bed.add(box(0.12, 0.9, 1.5, m.paintDark, 2.8, 0.45, 0));
  const load = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.7, 20), m.soil);
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
    wheelRadius: 0.47,
    lights,
    head,
    face,
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
      if (tilt > 0.45 && t < 4.2 && Math.random() < 0.9 * ctx.dt * 60) {
        ctx.emit(spout.getWorldPosition(spoutWorld), 3, 0.9);
      }
    },
  };
}

function buildBulldozer(m: Materials): Machine {
  const root = new THREE.Group();
  const wheels = tracks(m, root, 2.4, [-0.7, 0.7]);
  root.add(box(1.8, 0.85, 1.25, m.paint, -0.1, 0.95, 0));
  root.add(box(0.8, 0.55, 1.0, m.paintDark, 0.7, 0.85, 0));
  root.add(box(1.0, 0.95, 1.15, m.paint, -0.45, 1.8, 0));
  root.add(box(0.06, 0.75, 0.95, m.glass, 0.06, 1.82, 0));
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 10), m.chrome);
  exhaust.position.set(0.5, 1.4, 0.32);
  root.add(exhaust);
  beacon(m, root, -0.45, 2.34, 0);
  const lights = headlights(m, root, 1.05, 1.32, [-0.3, 0.3]);
  const face = createFace(m, root, 0.09, 1.8, 0, 1.15);
  const head = headAnchor(root, -0.45, 2.9, 0);

  const bladeArm = new THREE.Group();
  bladeArm.position.set(0.3, 0.65, 0);
  root.add(bladeArm);
  for (const z of [-0.62, 0.62]) bladeArm.add(box(1.1, 0.16, 0.16, m.steel, 0.55, 0, z));
  const blade = box(0.18, 0.85, 2.0, m.paintDark, 1.2, 0.05, 0);
  blade.add(box(0.12, 0.1, 2.0, m.chrome, 0.06, -0.42, 0));
  bladeArm.add(blade);
  const edge = new THREE.Object3D();
  edge.position.set(1.4, -0.35, 0);
  bladeArm.add(edge);

  const ripper = new THREE.Group();
  ripper.position.set(-1.1, 0.8, 0);
  root.add(ripper);
  ripper.add(box(0.5, 0.14, 0.8, m.steel, -0.25, 0, 0));
  ripper.add(box(0.12, 0.6, 0.12, m.steel, -0.45, -0.3, 0));

  let workTime = 0;
  const edgeWorld = new THREE.Vector3();
  return {
    name: 'Бульдозер',
    root,
    wheels,
    wheelRadius: 0.18,
    lights,
    head,
    face,
    hasTurret: false,
    update(ctx) {
      if (!ctx.moving) workTime += ctx.dt;
      // Blade down to push while driving; raise/lower and rip once parked.
      const parked = 0.1 + 0.12 * Math.sin(workTime * 2.2);
      bladeArm.rotation.z = lerp(-0.12, parked, ctx.work);
      ripper.rotation.z = ctx.work * 0.35 * (0.5 + 0.5 * Math.sin(workTime * 1.5));
      if (ctx.moving && Math.random() < 0.9 * ctx.dt * 60) {
        ctx.emit(edge.getWorldPosition(edgeWorld), 2, 1.6);
      }
    },
  };
}

// Each machine gets its own cartoon paint job and engine note (Hz).
const MACHINE_TYPES: {
  build: (m: Materials) => Machine;
  paint: number;
  paintDark: number;
  engineHz: number;
}[] = [
  { build: buildExcavator, paint: 0xfbbf24, paintDark: 0xf59e0b, engineHz: 42 },
  { build: buildCrane, paint: 0xfb7185, paintDark: 0xe11d48, engineHz: 36 },
  { build: buildLoader, paint: 0xfacc15, paintDark: 0x65a30d, engineHz: 50 },
  { build: buildDumpTruck, paint: 0x38bdf8, paintDark: 0xf97316, engineHz: 33 },
  { build: buildBulldozer, paint: 0xf59e0b, paintDark: 0x7c3aed, engineHz: 46 },
];

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
  /** Clicking/tapping the machine makes it happy. */
  poke(clientX: number, clientY: number): void;
  setRunning(running: boolean): void;
  dispose(): void;
}

const PLATFORM_RADIUS = 4.6;
const DRIVE_RADIUS = 2.4;
const SWITCH_SECONDS = 14;

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
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0f172a, 16, 32);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const cameraBase = new THREE.Vector3(9.5, 6.2, 10.5);
  const lookAt = new THREE.Vector3(0.3, 0.9, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 10, 7);
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
  const gradientMap = createToonGradient();
  const glowTextures = createGlowTextures();
  const outline = createOutlineMaterial();
  const coneMaterial = new THREE.MeshToonMaterial({ color: 0xf97316, gradientMap });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.3;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 16), coneMaterial);
    cone.position.set(Math.cos(angle) * 4.2, 0.21, Math.sin(angle) * 4.2);
    cone.castShadow = true;
    cone.add(new THREE.Mesh(cone.geometry, outline));
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

  // Floating wireframe shapes, kept out of the camera's line of sight.
  const shapes: THREE.Mesh[] = [];
  const shapeGeometries = [
    new THREE.OctahedronGeometry(0.45),
    new THREE.IcosahedronGeometry(0.4),
    new THREE.TetrahedronGeometry(0.5),
  ];
  const cameraAngle = Math.atan2(cameraBase.z, cameraBase.x);
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
        size: 0.1,
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

  // Emote bubble above the active machine.
  const emoteTextures = new Map<Emote, THREE.CanvasTexture>();
  for (const emote of ['heart', '!', '?', 'zzz', 'note'] as Emote[]) {
    emoteTextures.set(emote, createEmoteTexture(emote));
  }
  const emoteMaterial = new THREE.SpriteMaterial({ transparent: true, depthTest: false });
  const emoteSprite = new THREE.Sprite(emoteMaterial);
  emoteSprite.renderOrder = 10;
  scene.add(emoteSprite);
  let emoteShownAt = -10;
  let emoteVisible = false;

  // Machines.
  const machines = MACHINE_TYPES.map(({ build, paint, paintDark }) => {
    const machine = build(createMaterials(gradientMap, glowTextures, paint, paintDark));
    addOutlines(machine.root, outline);
    return machine;
  });
  const order = shuffledOrder(machines.length);
  let current = order[0] ?? 0;
  rememberShown(current);
  let activeMachine = machines[current]!;
  scene.add(activeMachine.root);

  const drive = {
    position: new THREE.Vector3(0, 0, 0),
    // Start roughly facing the camera so the face is visible.
    yaw: -0.8 + (Math.random() - 0.5) * 0.8,
    speed: 0,
    work: 1,
    wanderTarget: new THREE.Vector3(),
    wanderUntil: 0,
  };

  // Emotions.
  let emotion: Emotion = 'surprised';
  let emotionLockedUntil = 1.2;
  let lastPointerAt = -100;
  let spawnedAt = 0;
  let hopStart = -10;

  const EMOTION_SOUNDS: Partial<Record<Emotion, SoundName>> = {
    curious: 'curious',
    happy: 'happy',
    joy: 'joy',
    surprised: 'surprised',
    sleepy: 'sleepy',
  };

  function setEmotion(next: Emotion, lockSeconds = 0, silent = false) {
    if (next !== emotion) {
      emotion = next;
      const sound = EMOTION_SOUNDS[next];
      if (sound && !silent) options.sound?.play(sound);
      const emote = EMOTES[next];
      emoteVisible = Boolean(emote);
      if (emote) {
        emoteMaterial.map = emoteTextures.get(emote) ?? null;
        emoteMaterial.needsUpdate = true;
        emoteShownAt = elapsed;
      }
    }
    if (lockSeconds > 0) emotionLockedUntil = elapsed + lockSeconds;
  }

  let nextSnoreAt = 0;
  let lastDirtSoundAt = -10;
  /** Particle emitter for machines' work, with a (throttled) dirt sound. */
  function workEmit(origin: THREE.Vector3, count: number, spread: number) {
    emit(origin, count, spread);
    if (elapsed - lastDirtSoundAt > 1.4) {
      lastDirtSoundAt = elapsed;
      options.sound?.play('dirt');
    }
  }

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
    // Where the pointer touches the platform (the machine drives there)…
    pointerOnGround =
      raycaster.ray.intersectPlane(groundPlane, pointerGround) !== null &&
      pointerGround.length() < PLATFORM_RADIUS + 0.5;
    // …and, for pointers anywhere else on screen, a point on a vertical plane
    // between the machine and the camera, so the machine keeps facing the
    // viewer and its eyes follow the cursor around the screen.
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
  const eyeTarget = new THREE.Vector3();
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
    activeMachine.lights.setLevel(0, elapsed);
    scene.remove(activeMachine.root);
    current = next;
    activeMachine = machines[current]!;
    scene.add(activeMachine.root);
    drive.work = 1;
    drive.speed = 0;
    // Arrive facing the viewer.
    drive.yaw = faceCameraYaw() + (Math.random() - 0.5) * 0.6;
    emit(drive.position.clone().setY(0.2), 40, 2.5);
    spawnedAt = elapsed;
    options.sound?.play('appear');
    setEmotion('surprised', 1.4, true);
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

    // --- Mood. -------------------------------------------------------------
    const pointerActive = animate && hasPointer && elapsed < pointerActiveUntil;
    const idleFor = elapsed - Math.max(lastPointerAt, spawnedAt);
    if (elapsed >= emotionLockedUntil) {
      if (pointerActive) {
        setEmotion(
          emotion === 'sleepy' ? 'surprised' : drive.speed > 0.3 ? 'curious' : 'happy',
          emotion === 'sleepy' ? 1 : 0,
        );
      } else if (idleFor < 5) {
        setEmotion('focused');
      } else if (idleFor < 8.5) {
        setEmotion('happy');
      } else {
        setEmotion('sleepy');
      }
    }
    const sleepy = emotion === 'sleepy';

    // --- Choose where to go and what to look at. -------------------------
    if (pointerActive) {
      updatePointerTargets();
      if (pointerOnGround) {
        lookTarget.copy(pointerGround);
        followTarget.copy(pointerGround);
        if (followTarget.length() > DRIVE_RADIUS) followTarget.setLength(DRIVE_RADIUS);
      } else {
        // Turn towards the cursor, but never so far that the face is hidden —
        // the eyes cover the rest.
        const toward = Math.atan2(
          -(pointerLook.z - drive.position.z),
          pointerLook.x - drive.position.x,
        );
        const facing = faceCameraYaw();
        const heading = facing + clamp(wrapAngle(toward - facing), -0.6, 0.6);
        lookTarget.set(
          drive.position.x + Math.cos(heading) * 3,
          0,
          drive.position.z - Math.sin(heading) * 3,
        );
        followTarget.copy(drive.position);
      }
    } else {
      if (elapsed > drive.wanderUntil) {
        const angle = Math.random() * Math.PI * 2;
        drive.wanderTarget
          .set(Math.cos(angle), 0, Math.sin(angle))
          .multiplyScalar(Math.random() * 1.8);
        drive.wanderUntil = elapsed + 5 + Math.random() * 4;
      }
      // Only wander while working; stay put to greet the viewer or to doze.
      followTarget.copy(emotion === 'focused' ? drive.wanderTarget : drive.position);
      if (emotion === 'happy' || emotion === 'surprised') {
        // Turn to face the viewer.
        lookTarget.set(camera.position.x, 0, camera.position.z);
      } else {
        lookTarget.set(
          drive.position.x + Math.cos(elapsed * 0.3) * 5,
          0,
          drive.position.z - Math.sin(elapsed * 0.3) * 5,
        );
      }
    }

    // Big reactions are played to the audience.
    if (emotion === 'joy' || emotion === 'surprised') {
      lookTarget.set(camera.position.x, 0, camera.position.z);
    }

    // --- Drive. ------------------------------------------------------------
    const dx = followTarget.x - drive.position.x;
    const dz = followTarget.z - drive.position.z;
    const distance = Math.hypot(dx, dz);
    const stopDistance = pointerActive ? 1.9 : 0.3;
    const toPointer = Math.hypot(lookTarget.x - drive.position.x, lookTarget.z - drive.position.z);
    const wantsToMove =
      animate &&
      !transition &&
      !sleepy &&
      emotion !== 'joy' &&
      distance > stopDistance &&
      (!pointerActive || toPointer > 2.3);
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
    if (!moving && !activeMachine.hasTurret && animate && !sleepy && Math.abs(lookYaw) > 0.2) {
      // No turret: turn the whole machine in place to face the target.
      drive.yaw = approachAngle(drive.yaw, lookHeading, dt * 1.6);
      lookYaw = wrapAngle(lookHeading - drive.yaw);
    }

    const machine = activeMachine;
    for (const w of machine.wheels) w.rotation.z -= (drive.speed * dt) / machine.wheelRadius;

    // Hop for joy, rumble while driving, breathe while idle.
    const hopT = elapsed - hopStart;
    const hop =
      hopT < 0.9 ? Math.abs(Math.sin((hopT / 0.45) * Math.PI)) * (hopT < 0.45 ? 0.55 : 0.3) : 0;
    const rumble = moving ? Math.abs(Math.sin(elapsed * 18)) * 0.02 : 0;
    machine.root.position.set(drive.position.x, hop + rumble, drive.position.z);
    const breathe = Math.sin(elapsed * (sleepy ? 1.4 : 2.6)) * (sleepy ? 0.03 : 0.015);

    // --- Switching machines. ----------------------------------------------
    let spin = 0;
    let baseScale = 1;
    if (transition) {
      transition.t += dt / (transition.phase === 'out' ? 0.45 : 0.75);
      if (transition.phase === 'out') {
        baseScale = Math.max(0.001, 1 - smooth(transition.t));
        spin = smooth(transition.t) * Math.PI;
        if (transition.t >= 1) {
          swapTo(transition.next);
          transition = { phase: 'in', t: 0, next: transition.next };
          baseScale = 0.001;
        }
      } else {
        baseScale = Math.max(0.001, easeOutBack(Math.min(1, transition.t)));
        if (transition.t >= 1) transition = null;
      }
    } else if (animate && wallTime > autoSwitchAt) {
      const position = order.indexOf(current);
      startTransition(order[(position + 1) % order.length] ?? 0);
    }
    activeMachine.root.scale.set(
      baseScale * (1 - breathe * 0.5),
      baseScale * (1 + breathe),
      baseScale * (1 - breathe * 0.5),
    );
    activeMachine.root.rotation.y = drive.yaw + spin;

    activeMachine.update({
      time: elapsed,
      dt: animate ? dt * (sleepy ? 0.15 : 1) : 0,
      work: drive.work,
      moving,
      lookYaw,
      emit: workEmit,
    });
    activeMachine.root.updateMatrixWorld(true);

    // Engine hum follows throttle; off while dozing, revving when overjoyed.
    if (animate && running) {
      const throttle = sleepy
        ? 0
        : clamp(0.25 + (drive.speed / 1.8) * 0.75 + (emotion === 'joy' ? 0.5 : 0), 0, 1);
      options.sound?.engine(throttle * baseScale, MACHINE_TYPES[current]?.engineHz ?? 40);
    }
    if (sleepy && elapsed > nextSnoreAt) {
      nextSnoreAt = elapsed + 3.2;
      options.sound?.play('snore');
    }

    // Eyes: follow the pointer, meet the viewer's gaze, or droop when sleepy.
    if (pointerActive && pointerOnGround) eyeTarget.set(pointerGround.x, 0.6, pointerGround.z);
    else if (pointerActive) eyeTarget.copy(pointerLook);
    else if (sleepy) eyeTarget.set(drive.position.x, -5, drive.position.z);
    else if (emotion === 'focused') eyeTarget.copy(lookTarget).setY(0);
    else eyeTarget.copy(camera.position);
    activeMachine.face.update(animate ? dt : 0.016, elapsed, emotion, eyeTarget);

    // Emote bubble.
    activeMachine.head.getWorldPosition(anchorWorld);
    const emoteAge = elapsed - emoteShownAt;
    const emoteOn = emoteVisible && (sleepy || emoteAge < 2.2);
    const pop = emoteOn ? easeOutBack(clamp(emoteAge / 0.35, 0, 1)) : 0;
    emoteSprite.scale.setScalar(Math.max(0.001, pop * 0.95 * baseScale));
    emoteSprite.position.set(
      anchorWorld.x,
      anchorWorld.y + Math.sin(elapsed * 3) * 0.08,
      anchorWorld.z,
    );
    emoteSprite.visible = pop > 0.01;

    // Headlight beam and reticle.
    // Holding the mouse button (or a finger) down switches the headlights on.
    lightsLevel = damp(lightsLevel, pressed ? 1 : 0, pressed ? 14 : 4, dt || 1);
    activeMachine.lights.setLevel(lightsLevel, elapsed);
    activeMachine.lights.anchor.getWorldPosition(anchorWorld);
    beam.position.copy(anchorWorld);
    beamTarget.position.copy(lookTarget);
    beam.angle = 0.38 + 0.2 * lightsLevel;
    const baseBeam = pointerActive ? 80 : sleepy ? 0 : 25;
    beam.intensity = damp(beam.intensity, baseBeam + 220 * lightsLevel, 6, dt || 1);
    const reticleOn = pointerActive && pointerOnGround && pointerGround.length() < PLATFORM_RADIUS;
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
      const ndc = toNdc(clientX, clientY);
      if (!ndc) return;
      pointerNdc.copy(ndc);
      smoothPointer.x = damp(smoothPointer.x, clamp(ndc.x, -1.5, 1.5), 1, 0.3);
      smoothPointer.y = damp(smoothPointer.y, clamp(-ndc.y, -1.5, 1.5), 1, 0.3);
      hasPointer = true;
      pointerActiveUntil = elapsed + 4;
      lastPointerAt = elapsed;
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
      if (raycaster.intersectObject(activeMachine.root, true).length === 0) return;
      options.sound?.play('horn');
      setEmotion('joy', 1.8);
      emoteShownAt = elapsed;
      hopStart = elapsed;
      emit(activeMachine.head.getWorldPosition(new THREE.Vector3()), 20, 1.2);
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
      const disposed = new Set<{ dispose(): void }>();
      const disposeObject = (object: THREE.Object3D) => {
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
      };
      scene.traverse(disposeObject);
      for (const machine of machines) machine.root.traverse(disposeObject);
      for (const texture of emoteTextures.values()) texture.dispose();
      glowTextures.halo.dispose();
      glowTextures.beam.dispose();
      gradientMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
