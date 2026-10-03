// The /stroyka 3D engine: renderer, scene, tour camera, free walk, zones,
// time of day and weather. React talks to it through a small API.
import * as THREE from 'three';
import type { MachineType } from '@/lib/machinePhotos';
import {
  BOUNDS,
  detectZone,
  obstaclesFor,
  PLAYER_RADIUS,
  resolveCollision,
  TOUR_PATH,
  TOUR_STOP_SECONDS,
  tourStops,
  ZONES,
  zoneById,
  type SpeakerId,
  type ZoneId,
} from '@/lib/stroyka';
import {
  moonPhase,
  moonPosition,
  skyPalette,
  sunPosition,
  weatherScene,
  type LiftStop,
  type WeatherPoint,
  type WeatherScene,
} from '@/lib/stroykaSky';
import { splitCensored, type BanterSpeaker } from '@/lib/stroykaJokes';
import { Atmosphere } from './atmosphere';
import type { WorldProgress } from '@/lib/stroyka/progress';
import { createMaterials, Debris, node, pixelTexture, retint, Rig, smooth } from './kit';
import { buildDistrict, buildProject, buildTowerCrane, type ProjectBuild } from './project';
import { buildCity } from './cityMesh';
import { placeSite, type CityData } from '@/lib/stroyka/city';
import {
  CRANE,
  craneTip,
  makeAgp,
  makeBackhoe,
  makeCrane,
  makeDozer,
  makeDumpTruck,
  makeKmu,
  makeLoader,
  makeRoller,
  makeTractor,
  palletBuilder,
} from './machines';
import {
  animateDog,
  animatePerson,
  HAT,
  lookFor,
  makeDog,
  makePerson,
  MoodFace,
  resetPeopleMaterials,
  setDetail,
  VEST,
  voxelMesh,
  walk,
  type Dog,
  type DogPose,
  type PersonLook,
  type Person,
} from './people';
import type { Mood } from '@/lib/stroyka/mood';
import type { SeasonEvent } from '@/lib/stroyka/seasonal';
import {
  brandTexture,
  canvasTexture,
  buildCraneTargets,
  buildWorld,
  MASTS,
  MAST_HEIGHT,
  type AdTarget,
  type World,
} from './world';

export type Mode = 'tour' | 'free';
export type View = 'fp' | 'tp';

export interface SharedInput {
  joyX: number;
  joyY: number;
}

export interface Telemetry {
  x: number;
  z: number;
  yaw: number;
  fps: number;
  mode: Mode;
  zone: ZoneId | null;
  tourStop: ZoneId | null;
  ready: boolean;
  drawCalls: number;
  pixelRatio: number;
  cityInstances?: number;
  /** People drawn in full detail / as one-mesh stand-ins, last frame. */
  people?: { detailed: number; lod: number };
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  mobile: boolean;
  input: SharedInput;
  telemetry: Telemetry;
  onZone(zone: ZoneId | null): void;
  onProgress(p: number): void;
  onWantFree(): void;
  /** A billboard, branded truck or a cabin was tapped. */
  onAdClick(target: AdTarget): void;
  /** The site dog was tapped. */
  onDog?(): void;
}

interface Character {
  id: string;
  speaker: BanterSpeaker;
  person: Person;
  home: THREE.Vector3;
  baseYaw: number;
  zone?: ZoneId;
  bubble?: HTMLDivElement;
  bubbleUntil: number;
  patrol?: THREE.Vector3[];
  guard?: boolean;
  sitter?: boolean;
  /** The mood face and talking gestures last until this time. */
  faceUntil: number;
  mood: Mood;
  dist: number;
}

/** The named characters, matching their portraits (Portraits.tsx). */
const LOOKS: Record<SpeakerId, Partial<PersonLook>> = {
  mihalych: {
    hat: HAT.white,
    facial: 'moustache',
    hair: 0x9ca3af,
    skin: 0xd39a74,
    shirt: 0x2f4f7f,
    build: 1.12,
    height: 1.0,
  },
  rinat: { hat: HAT.orange, facial: 'beard', hair: 0x1f2937, skin: 0xc98d68, shirt: 0x5b6573 },
  sveta: {
    female: true,
    hat: HAT.red,
    vest: VEST.yellow,
    headset: true,
    skin: 0xe6b08c,
    hair: 0x7c4a2a,
    facial: 'none',
    gloves: null,
  },
  ildar: { hat: HAT.yellow, glasses: true, skin: 0xc48a62, hair: 0x374151, facial: 'none' },
  alsu: {
    female: true,
    hat: HAT.blue,
    vest: VEST.yellow,
    skin: 0xe2a982,
    hair: 0x2b1d14,
    facial: 'none',
    gloves: null,
  },
};

/** Detailed people beyond this distance become one-mesh stand-ins. */
const DETAIL_DISTANCE = 25;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

/** Direction vector for an azimuth (from north, clockwise) and elevation, degrees. */
function skyDir(azimuth: number, elevation: number, out = new THREE.Vector3()) {
  const a = azimuth * (Math.PI / 180);
  const e = elevation * (Math.PI / 180);
  // North is −Z, east is +X.
  return out.set(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
}

export class StroykaEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private M = createMaterials();
  private world!: World;
  private atmosphere!: Atmosphere;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private nightLight!: THREE.PointLight;
  private fog!: THREE.Fog;
  private raf = 0;
  private running = false;
  private visible = true;
  private onScreen = true;
  private disposed = false;
  private observer?: IntersectionObserver;
  private cleanups: (() => void)[] = [];
  private updaters: ((time: number, dt: number) => void)[] = [];
  private characters: Character[] = [];
  private avatar!: Person;
  private face!: MoodFace;
  private dog!: Dog;
  private dogState = {
    pos: new THREE.Vector3(4.2, 0, 51.8),
    yaw: 0,
    phase: 0,
    pose: 'sit' as DogPose,
    bubble: null as HTMLDivElement | null,
    bubbleUntil: 0,
  };
  private nextLod = 0;
  private dogPlaced = false;
  private craneBoom: THREE.Group | null = null;
  private season: SeasonEvent | null = null;
  private seasonGroup: THREE.Group | null = null;
  private garland: { mesh: THREE.InstancedMesh; colors: THREE.Color[] } | null = null;
  private debris: Debris[] = [];
  private headBeams: THREE.Mesh[] = [];
  private headBeamMat!: THREE.MeshBasicMaterial;
  private guardBeam!: THREE.Mesh;
  private time = 0;
  private obstacles = obstaclesFor(false);
  private voxelMat = new THREE.MeshLambertMaterial({ map: pixelTexture() });
  private project: ProjectBuild | null = null;
  private district: { group: THREE.Group; lit: THREE.InstancedMesh } | null = null;
  private tower: ReturnType<typeof buildTowerCrane> | null = null;
  private progress: WorldProgress | null = null;
  private agpRoot: THREE.Object3D | null = null;
  private reveal: { from: number; t: number; dur: number } | null = null;
  private intro = { t: 0, dur: 9, active: true };
  private brandMat = new THREE.MeshLambertMaterial({ map: brandTexture() });
  private clickables: THREE.Object3D[] = [];
  private fireworks: Debris | null = null;
  private nextFirework = 0;
  private cityLit: THREE.InstancedMesh | null = null;

  // Camera state
  private mode: Mode = 'tour';
  private view: View = 'fp';
  private hold = false;
  private curve!: THREE.CatmullRomCurve3;
  private stops = tourStops();
  private tourT = 0;
  private tourPhase: 'move' | 'stop' = 'stop';
  private tourStopIdx = 0;
  private tourTimer = 0;
  private skipStop = false;
  private tp = 0;
  private walkPhase = 0;
  private lookTarget = new THREE.Vector3();
  private player = new THREE.Vector3(0, 0, 66);
  private yaw = Math.PI;
  private pitch = 0;
  private lookOffset = 0;
  private keys = new Set<string>();
  private blend: { from: THREE.Vector3; fromQ: THREE.Quaternion; t: number; dur: number } | null =
    null;
  private zone: ZoneId | null = null;
  private activeZone: ZoneId | null = null;

  // Environment
  private envTarget = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    fog: new THREE.Color(),
    sun: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    sunIntensity: 1,
    hemiIntensity: 1,
    night: 0,
    sunDir: new THREE.Vector3(0, 1, 0),
    moonDir: new THREE.Vector3(0, 1, 0),
    moonPhase: 0.5,
    moonUp: 0,
    sunUp: 1,
  };
  private env = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    fog: new THREE.Color(),
    sun: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    sunIntensity: 1,
    hemiIntensity: 1,
    night: 0,
    sunDir: new THREE.Vector3(0, 1, 0),
    moonDir: new THREE.Vector3(0, 1, 0),
    clouds: 0,
    rain: 0,
    snow: 0,
    fog_: 0,
  };
  private weather: WeatherScene = weatherScene(null);
  private lift: LiftStop = { stop: false, reason: null };
  private hour = 12;
  private ground: 'dry' | 'wet' | 'snow' | null = null;
  private flashUntil = 0;
  private nextFlash = 6;
  private clocks = { crane: 0, agp: 0 };

  // Perf
  private frames = 0;
  private fpsTime = 0;
  private slowWindows = 0;
  private pixelRatio = 1;
  private maxPixelRatio = 1;

  private constructor(private opts: EngineOptions) {}

  static async create(opts: EngineOptions) {
    const engine = new StroykaEngine(opts);
    await engine.build();
    return engine;
  }

  // ------------------------------------------------------------------ build

  private async build() {
    const { canvas, mobile } = this.opts;
    this.opts.onProgress(0.05);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !mobile,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);
    this.resize();

    this.fog = new THREE.Fog(0xc8d9e6, 40, 220);
    this.scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(0xb8d0ee, 0x6e5a44, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const size = mobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -36;
    cam.right = cam.top = 36;
    cam.near = 1;
    cam.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.nightLight = new THREE.PointLight(0xffc477, 0, 46, 1.2);
    this.nightLight.position.set(0, MAST_HEIGHT, 40);
    this.scene.add(this.nightLight);
    this.opts.onProgress(0.15);
    await nextFrame();

    this.world = buildWorld(this.M, mobile);
    this.scene.add(this.world.group);
    this.opts.onProgress(0.4);
    await nextFrame();

    this.buildMachines();
    this.opts.onProgress(0.65);
    await nextFrame();

    this.buildPeople();
    this.opts.onProgress(0.8);
    await nextFrame();

    this.atmosphere = new Atmosphere(mobile);
    this.scene.add(this.atmosphere.group);
    this.curve = new THREE.CatmullRomCurve3(
      TOUR_PATH.map((p) => new THREE.Vector3(p.p[0], 0, p.p[1])),
      true,
      'centripetal',
    );
    this.tourT = 0;
    this.lookTarget.set(3, 1.6, 50);
    // Opening shot: an aerial fly-over of the district, landing at the gate.
    this.introPose(0);
    this.setEnvironment(new Date(), null, undefined, true);
    this.opts.onProgress(0.9);
    await nextFrame();

    this.renderer.compile(this.scene, this.camera);
    this.bindInput();
    void this.loadCity();
    this.opts.onProgress(1);
    this.opts.telemetry.ready = true;
    this.running = true;
    this.clock.start();
    this.loop();
  }

  /** The real city around (OSM, fetched lazily); the placeholder skyline stays if it fails. */
  private async loadCity() {
    try {
      const response = await fetch('/stroyka/chelny-osm.json');
      if (!response.ok) return;
      const data = (await response.json()) as CityData;
      if (this.disposed || !data.b || data.b.length < 20) return;
      const city = buildCity(data, placeSite(data), this.voxelMat, this.opts.mobile);
      this.scene.add(city.group);
      this.cityLit = city.lit;
      this.world.procCity.visible = false;
      this.opts.telemetry.cityInstances = city.instances;
    } catch {
      // Keep the placeholder skyline.
    }
  }

  private place(obj: THREE.Object3D, x: number, z: number, rotY = 0, y = 0) {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    this.scene.add(obj);
  }

  /** «СпецПласт16» panels on both sides of a machine part (local X along the body). */
  private brand(
    parent: THREE.Object3D,
    x: number,
    y: number,
    halfWidth: number,
    length: number,
    machine: MachineType,
  ) {
    for (const side of [1, -1]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(length, length / 4), this.brandMat);
      panel.position.set(x, y, side * (halfWidth + 0.02));
      panel.rotation.y = side > 0 ? 0 : Math.PI;
      panel.userData.machine = machine;
      parent.add(panel);
      this.clickables.push(panel);
    }
  }

  private beam(parent: THREE.Object3D, x: number, y: number) {
    // Square headlight beam pointing +X (the machine's front), shown at night.
    if (!this.headBeamMat) {
      this.headBeamMat = new THREE.MeshBasicMaterial({
        color: 0xfff0c8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }
    const geo = new THREE.CylinderGeometry(0.35, 2.6, 9, 4, 1, true);
    geo.rotateZ(-Math.PI / 2);
    geo.rotateX(Math.PI / 4);
    const mesh = new THREE.Mesh(geo, this.headBeamMat);
    mesh.position.set(x + 4.5, y - 0.4, 0);
    mesh.visible = false;
    parent.add(mesh);
    this.headBeams.push(mesh);
  }

  private buildMachines() {
    const M = this.M;
    const rig = new Rig(M);
    const dirt = new Debris(this.opts.mobile ? 60 : 120, 0x7a5434, 0.16, 1.9);
    const gravel = new Debris(this.opts.mobile ? 60 : 120, 0x8f8c86, 0.14, 0.3);
    this.debris.push(dirt, gravel);
    this.scene.add(dirt.points, gravel.points);

    // Котлован: backhoe and the truck it loads.
    const truck1 = makeDumpTruck(rig);
    this.place(truck1.root, -25.65, 26.05);
    this.brand(truck1.bed, 2.25, 0.62, 1.22, 3.6, 'truck');
    const backhoe = makeBackhoe(rig, dirt, truck1);
    this.place(backhoe.root, -23, 22);
    this.updaters.push(backhoe.update);

    // Монтаж: truck crane between a slab stack and the frame it builds.
    const tip = craneTip();
    const pivot = new THREE.Vector3(38, 0, 22);
    const at = (yaw: number) => ({
      x: pivot.x - tip.reach * Math.cos(yaw),
      z: pivot.z + tip.reach * Math.sin(yaw),
      rot: Math.PI + yaw,
    });
    const targets = buildCraneTargets(M, at(CRANE.yawA), at(CRANE.yawB));
    this.scene.add(targets.group);
    const crane = makeCrane(rig, targets.stackTop, targets.frameTop);
    this.place(crane.root, 36, 22, Math.PI);
    this.craneBoom = crane.boom;
    this.updaters.push((_t, dt) => {
      // Strong wind or a storm: the crane finishes the cycle and stays with the hook up.
      const period = 24;
      const phase = this.clocks.crane % period;
      const rate = this.lift.stop ? 1 : this.weather.wind >= 7 ? 0.6 : 1;
      if (!(this.lift.stop && phase < 0.3)) this.clocks.crane += dt * rate;
      crane.update(this.clocks.crane, dt);
    });

    // Корпус: aerial platform at the north facade.
    const agp = makeAgp(rig);
    this.place(agp.root, 25.5, -42.5);
    this.agpRoot = agp.root;
    this.updaters.push((_t, dt) => {
      const phase = this.clocks.agp % 26;
      if (!(this.lift.stop && phase < 7)) this.clocks.agp += dt;
      agp.update(this.clocks.agp, dt);
    });

    // Дорога: roller back and forth, a truck reversing in through the back gate.
    const roller = makeRoller(rig);
    this.place(roller.root, -20, -12);
    this.beam(roller.root, 2.3, 1.4);
    this.updaters.push((time) => {
      const x = -20 + 10 * Math.sin(time * 0.35);
      roller.drive(x);
      roller.root.position.x = x;
      roller.update(time, 0);
    });
    const truck2 = makeDumpTruck(rig);
    this.place(truck2.root, -80, -16.8, Math.PI);
    this.brand(truck2.bed, 2.25, 0.62, 1.22, 3.6, 'truck');
    this.beam(truck2.root, 3.5, 1.3);
    this.updaters.push((time) => {
      const t = time % 32;
      let x: number;
      let tilt = 0;
      if (t < 9) x = -82 + (-39 + 82) * smooth(0, 9, t);
      else if (t < 19) {
        x = -39;
        tilt = t < 14 ? smooth(10, 13, t) * 0.85 : 0.85 * (1 - smooth(15.5, 18.5, t));
        if (t > 11.5 && t < 15) {
          const p = truck2.root.localToWorld(new THREE.Vector3(-3.3, 1.6, 0));
          gravel.emit(p, 0.8, 2);
        }
      } else x = -39 - 50 * smooth(19, 28, t);
      // Mud: in the rain the truck stalls for a moment on the way in.
      if (this.weather.wet && t > 5 && t < 7) x += Math.sin(time * 30) * 0.03;
      truck2.root.position.x = x;
      truck2.bed.rotation.z = -tilt;
      truck2.heap.visible = t < 15;
      truck2.root.visible = t < 29;
    });

    // Склад: KMU unloading pallets, a front loader at the sand.
    const kmu = makeKmu(rig, palletBuilder(rig));
    this.place(kmu.root, -27.5, -43.8);
    this.brand(kmu.root, -1.0, 1.0, 1.24, 3.2, 'kmu');
    this.updaters.push(kmu.update);
    const loader = makeLoader(rig);
    this.place(loader.root, -12, -47, Math.PI / 2);
    this.beam(loader.root, 3.2, 1.6);
    this.updaters.push((time) => {
      const t = time % 12;
      const fwd = smooth(0, 3.5, t) - smooth(6, 9.5, t);
      loader.root.position.z = -46.5 - 7 * fwd;
      loader.lift(smooth(3.5, 5, t) - smooth(9.5, 11.5, t));
      loader.update(time, 0);
    });

    // Планировка: dozer pushing spoil, a tractor doing circles.
    const dozer = makeDozer(rig);
    this.place(dozer.root, 11, 5.2);
    this.scene.add(dozer.pile);
    this.beam(dozer.root, 2.4, 1.4);
    this.updaters.push((time) => {
      const t = time % 14;
      const push = smooth(0, 7, t);
      const back = smooth(8.5, 13, t);
      const x = 11 + 11 * push - 11 * back;
      dozer.root.position.x = x;
      const pushing = t < 7.2;
      if (pushing) {
        dozer.pile.position.set(x + 3.6, 0, 5.2);
        const s = 0.45 + push * 0.6;
        dozer.pile.scale.set(s, s, s);
      } else {
        dozer.pile.scale.multiplyScalar(0.999);
      }
    });
    const tractor = makeTractor(rig);
    this.place(tractor.root, 44, -2);
    this.beam(tractor.root, 1.8, 1.3);
    this.updaters.push((time) => {
      const a = time * 0.22;
      tractor.root.position.set(44 + Math.cos(a) * 4.8, 0, -2 + Math.sin(a) * 4.8);
      tractor.root.rotation.y = -a - Math.PI;
    });

    // Our branded van on the road outside the fence, passing the gate now and then.
    const van = node(null);
    rig.box(van, [4.6, 1.5, 2.0], 'white', [0, 1.25, 0]);
    rig.box(van, [1.0, 1.0, 1.9], 'glass', [2.0, 1.55, 0]);
    rig.box(van, [0.16, 0.12, 0.5], 'beacon', [0.6, 2.05, 0]);
    rig.box(van, [0.06, 0.16, 0.3], 'lamp', [2.32, 0.95, 0.7]);
    rig.box(van, [0.06, 0.16, 0.3], 'lamp', [2.32, 0.95, -0.7]);
    for (const x of [1.5, -1.5]) {
      rig.wheel(van, [x, 0.4, 0.95], 0.4, 0.3);
      rig.wheel(van, [x, 0.4, -0.95], 0.4, 0.3);
    }
    this.place(van, -140, 71.5);
    this.brand(van, -0.4, 1.3, 1.0, 3.4, 'truck');
    this.beam(van, 2.2, 1.0);
    this.updaters.push((time) => {
      const t = time % 46;
      van.visible = t < 30;
      van.position.x = -140 + 280 * (t / 30);
    });

    rig.bake({ cast: true });
  }

  private buildPeople() {
    this.face = new MoodFace();
    const add = (
      id: string,
      speaker: BanterSpeaker,
      look: PersonLook,
      x: number,
      z: number,
      yaw: number,
      extra: Partial<Character> = {},
    ) => {
      const person = makePerson(look, id);
      this.place(person.root, x, z, yaw);
      const c: Character = {
        id,
        speaker,
        person,
        home: new THREE.Vector3(x, 0, z),
        baseYaw: yaw,
        bubbleUntil: 0,
        faceUntil: 0,
        mood: 'neutral',
        dist: 0,
        ...extra,
      };
      this.characters.push(c);
      return c;
    };
    for (const zone of ZONES) {
      const [x, z] = zone.npc;
      const yaw = Math.atan2(zone.stand[0] - x, zone.stand[1] - z);
      add(
        `npc-${zone.id}`,
        zone.speaker,
        lookFor(`npc-${zone.id}`, LOOKS[zone.speaker]),
        x,
        z,
        yaw,
        {
          zone: zone.id,
        },
      );
    }
    // The crew: seeded skin, hats (orange or yellow), build and height.
    const crew = (id: string) => lookFor(id);
    add('worker-pit', 'worker', crew('worker-pit'), -31, 28.2, 0.4, { sitter: true });
    add('worker-sling', 'worker', crew('worker-sling'), 27.5, 17.5, -2.2);
    add('worker-yard', 'worker', crew('worker-yard'), -20, -48.5, 1.2, { sitter: true });
    add('worker-road', 'worker', crew('worker-road'), -12, -8.3, 2.6, { sitter: true });
    add('worker-walk', 'worker', crew('worker-walk'), 7, 36, Math.PI, {
      patrol: [new THREE.Vector3(7, 0, 36), new THREE.Vector3(7, 0, -8)],
    });
    add('guard', 'worker', lookFor('guard', { hat: HAT.dark, vest: VEST.dark }), -8, 58, 0, {
      guard: true,
      patrol: [
        new THREE.Vector3(-8, 0, 58),
        new THREE.Vector3(-50, 0, 50),
        new THREE.Vector3(-50, 0, -4),
        new THREE.Vector3(-8, 0, 30),
      ],
    });
    this.avatar = makePerson(lookFor('avatar', { hat: HAT.yellow }), 'avatar');
    this.scene.add(this.avatar.root);
    // The guard's flashlight.
    const g = this.characters.find((c) => c.guard)!;
    const geo = new THREE.CylinderGeometry(0.08, 1.6, 7, 4, 1, true);
    geo.rotateX(Math.PI / 2 + 0.35);
    geo.translate(0, 1.0, 3.4);
    this.guardBeam = new THREE.Mesh(geo, this.headBeamMat);
    g.person.root.add(this.guardBeam);
    // «Бетон», the site dog.
    this.dog = makeDog();
    this.dog.hit.userData.dog = true;
    this.clickables.push(this.dog.hit);
    this.place(this.dog.root, this.dogState.pos.x, this.dogState.pos.z);
  }

  // ------------------------------------------------------------------ public API

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    if (mode === 'free') {
      // Continue walking from where the camera is.
      this.player.set(this.camera.position.x, 0, this.camera.position.z);
      const [x, z] = resolveCollision(this.player.x, this.player.z, PLAYER_RADIUS, this.obstacles);
      this.player.set(x, 0, z);
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.yaw = Math.atan2(dir.x, dir.z);
      this.pitch = 0;
    } else {
      // Rejoin the tour at the nearest point of the route.
      let best = 0;
      let bestD = Infinity;
      const p = new THREE.Vector3();
      for (let i = 0; i < 400; i++) {
        this.curve.getPoint(i / 400, p);
        const d = p.distanceToSquared(this.camera.position);
        if (d < bestD) {
          bestD = d;
          best = i / 400;
        }
      }
      this.tourT = best;
      this.tourPhase = 'move';
      const n = TOUR_PATH.length;
      const idx = this.stops.findIndex((s) => s.index / n > best);
      this.tourStopIdx = idx === -1 ? 0 : idx;
    }
    this.mode = mode;
    this.opts.telemetry.mode = mode;
    this.startBlend(1.2);
  }

  setView(view: View) {
    this.view = view;
  }

  setHold(hold: boolean) {
    this.hold = hold;
  }

  /** Leave the current tour stop now. */
  next() {
    if (this.mode === 'tour' && this.tourPhase === 'stop') this.skipStop = true;
  }

  goToZone(id: ZoneId) {
    const zone = zoneById(id);
    if (this.mode === 'tour') {
      const k = this.stops.findIndex((s) => s.zone === id);
      if (k >= 0) {
        this.tourStopIdx = k;
        this.tourT = this.stops[k]!.index / TOUR_PATH.length;
        this.tourPhase = 'stop';
        this.tourTimer = 0;
      }
    } else {
      this.player.set(zone.stand[0], 0, zone.stand[1]);
      this.yaw = Math.atan2(zone.focus[0] - zone.stand[0], zone.focus[2] - zone.stand[1]);
      this.pitch = 0;
    }
    this.startBlend(1.8);
  }

  /** Screen position (CSS px) of a world point, or null behind the camera (tests). */
  toScreen(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    const c = this.opts.canvas;
    return { x: ((v.x + 1) / 2) * c.clientWidth, y: ((1 - v.y) / 2) * c.clientHeight };
  }

  /** Free walk: stand at x, z looking along yaw (tests and screenshots). */
  standAt(x: number, z: number, yaw: number, pitch = 0) {
    this.setMode('free');
    this.blend = null;
    this.player.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = pitch;
  }

  setActiveZone(zone: ZoneId | null) {
    this.activeZone = zone;
  }

  /** The district's real progress: rebuilds the object on the plot (optionally as a time-lapse). */
  setProgress(p: WorldProgress, timelapse = false) {
    const same =
      this.progress &&
      this.progress.projectIndex === p.projectIndex &&
      this.progress.stage === p.stage &&
      this.progress.stagePercent === p.stagePercent;
    if (same) return;
    this.progress = p;
    if (this.project) {
      this.scene.remove(this.project.group);
      this.project.mesh.dispose();
      this.project.lit.dispose();
    }
    this.project = buildProject(this.M, p, this.voxelMat, this.opts.mobile);
    this.scene.add(this.project.group);
    this.obstacles = obstaclesFor(this.project.hasWalls);
    this.reveal = timelapse ? { from: Math.floor(this.project.total * 0.55), t: 0, dur: 5 } : null;
    if (this.reveal) this.project.mesh.count = this.reveal.from;
    // Finished objects around the site.
    if (this.district) this.scene.remove(this.district.group);
    this.district = buildDistrict(p.finishedProjects, this.voxelMat);
    this.scene.add(this.district.group);
    // Machines follow the stage: the tower crane from foundation to facade, the platform for the facade.
    const towerNeeded = p.stage >= 1 && p.stage <= 4;
    if (towerNeeded && !this.tower) {
      this.tower = buildTowerCrane(this.M, p.floors * 4);
      this.scene.add(this.tower.root);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), this.brandMat);
      banner.position.set(8, 0.6, 0.47);
      banner.userData.machine = 'crane';
      this.tower.jib.add(banner);
      const back = banner.clone();
      back.position.z = -0.47;
      back.rotation.y = Math.PI;
      this.tower.jib.add(back);
      this.clickables.push(banner, back);
    }
    if (this.tower) this.tower.root.visible = towerNeeded;
    if (this.agpRoot) this.agpRoot.visible = p.stage >= 4 && p.stage <= 6;
    this.world.setPassport(p);
    if (p.stage === 8 && !this.fireworks) {
      this.fireworks = new Debris(this.opts.mobile ? 160 : 320, 0xffd36b, 0.5, -5);
      this.scene.add(this.fireworks.points);
    }
  }

  /**
   * Holiday dressing by the real date (lib/stroyka/seasonal.ts): a garland on
   * the crane and a fir tree for the New Year, a banner and fireworks for the
   * Builder's Day, bunting for Сабантуй, flowers on 8 March.
   */
  setSeason(event: SeasonEvent | null) {
    if (event?.id === this.season?.id) return;
    this.season = event;
    if (this.seasonGroup) {
      this.seasonGroup.removeFromParent();
      this.seasonGroup.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    }
    this.garland?.mesh.removeFromParent();
    this.garland = null;
    this.seasonGroup = null;
    if (!event) return;
    const group = new THREE.Group();
    this.seasonGroup = group;
    this.scene.add(group);
    const LIGHTS = [0xff3b3b, 0xffd23f, 0x3bd16f, 0x3fa9ff, 0xff8a3b];
    const lights = (count: number, at: (i: number) => [number, number, number], size = 0.2) => {
      const mesh = new THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        count,
      );
      const m = new THREE.Matrix4();
      const colors: THREE.Color[] = [];
      for (let i = 0; i < count; i++) {
        mesh.setMatrixAt(i, m.makeTranslation(...at(i)));
        const c = new THREE.Color(LIGHTS[i % LIGHTS.length]!);
        colors.push(c);
        mesh.setColorAt(i, c);
      }
      mesh.computeBoundingSphere();
      return { mesh, colors };
    };
    if (event.garland && this.craneBoom) {
      // Along the boom, sagging a little between the sections.
      this.garland = lights(40, (i) => [
        0.4 + i * 0.39,
        0.5 - Math.abs(Math.sin(i * 0.8)) * 0.12,
        0,
      ]);
      this.craneBoom.add(this.garland.mesh);
    }
    type Block = [[number, number, number], [number, number, number], number];
    if (event.tree) {
      const blocks: Block[] = [[[0.3, 0.7, 0.3], [0, 0.35, 0], 0x6b4423]];
      for (let i = 0; i < 6; i++) {
        const w = 2.3 - i * 0.36;
        blocks.push([[w, 0.55, w], [0, 0.9 + i * 0.5, 0], i % 2 ? 0x1f6b3a : 0x23784a]);
        // Baubles on the tier corners.
        const r = w / 2;
        const corners: [number, number][] = [
          [r, r],
          [-r, -r],
          [r, -r],
          [-r, r],
        ];
        corners.forEach(([x, z], k) =>
          blocks.push([[0.16, 0.16, 0.16], [x, 0.72 + i * 0.5, z], LIGHTS[(i + k) % 5]!]),
        );
      }
      blocks.push([[0.35, 0.35, 0.12], [0, 3.95, 0], 0xffd23f]);
      const tree = voxelMesh(blocks);
      tree.matrixAutoUpdate = true;
      tree.position.set(23.4, 0, 51.6);
      group.add(tree);
    }
    if (event.banner) {
      const text = event.banner;
      const { texture } = canvasTexture(1024, 128, (ctx) => {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(0, 0, 1024, 128);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 1024, 10);
        ctx.fillRect(0, 118, 1024, 10);
        ctx.font = 'bold 64px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 512, 66, 990);
      });
      // Self-lit like the gate sign, so it reads in the evening too.
      const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.25), mat);
      banner.position.set(0, 3.35, 64.25);
      group.add(banner);
    }
    if (event.flags) {
      // Bunting across the entrance, in plain festive colours.
      const n = 26;
      const bunting = lights(
        n,
        (i) => {
          const t = i / (n - 1);
          return [-8 + 16 * t, 4.05 - Math.sin(t * Math.PI) * 0.7, 61.6];
        },
        0.32,
      );
      (bunting.mesh.material as THREE.Material).dispose();
      bunting.mesh.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
      group.add(bunting.mesh);
    }
    if (event.flowers) {
      const bouquet = (x: number, z: number) => {
        const blocks: Block[] = [[[0.22, 0.3, 0.22], [0, 0.15, 0], 0x64748b]];
        const petals = [0xf43f5e, 0xfacc15, 0xf472b6, 0xffffff, 0xfb7185];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const px = Math.cos(a) * 0.09;
          const pz = Math.sin(a) * 0.09;
          blocks.push([[0.025, 0.3, 0.025], [px, 0.42, pz], 0x2f7d32]);
          blocks.push([
            [0.09, 0.08, 0.09],
            [px * 1.3, 0.6 + (i % 2) * 0.05, pz * 1.3],
            petals[i % 5]!,
          ]);
        }
        const mesh = voxelMesh(blocks);
        mesh.matrixAutoUpdate = true;
        mesh.position.set(x, 0, z);
        group.add(mesh);
      };
      for (const zone of ZONES)
        if (zone.speaker === 'sveta' || zone.speaker === 'alsu')
          bouquet(zone.npc[0] + 0.7, zone.npc[1] + 0.5);
    }
    if (event.fireworks && !this.fireworks) {
      this.fireworks = new Debris(this.opts.mobile ? 160 : 320, 0xffd36b, 0.5, -5);
      this.scene.add(this.fireworks.points);
    }
    if (event.snow) this.setEnvironment(this.lastDate, this.lastPoint, this.lift, true);
  }

  /** Skip the opening fly-over. */
  skipIntro() {
    if (!this.intro.active) return;
    this.intro.active = false;
    this.startBlend(1.2);
  }

  private introPose(k: number) {
    // Orbit the district high up, descending toward the gate.
    const e = smooth(0, 1, k);
    const a = -2.4 + e * 3.95;
    const r = 105 - 55 * e;
    const h = 75 - 62 * e;
    this.camera.position.set(Math.cos(a) * r, h, Math.sin(a) * r + 10);
    const look = new THREE.Vector3(0, 0, -10).lerp(new THREE.Vector3(0, 2, 52), e * e);
    this.camera.lookAt(look);
  }

  /** Real (or overridden) time and the forecast point. */
  private externalEnv = false;
  private lastDate = new Date();
  private lastPoint: WeatherPoint | null = null;
  setEnvironment(
    date: Date,
    point: WeatherPoint | null,
    lift: LiftStop = { stop: false, reason: null },
    immediate = false,
  ) {
    // The first real setting (visitor's time, overrides) applies at once; later ones blend.
    if (!immediate && !this.externalEnv) {
      this.externalEnv = true;
      immediate = true;
    }
    this.lastDate = date;
    this.lastPoint = point;
    const sun = sunPosition(date);
    const moon = moonPosition(date);
    const palette = skyPalette(sun.elevation);
    this.weather = weatherScene(point);
    if (this.season?.snow) {
      // New Year: snow on the ground and a light snowfall whatever the forecast.
      const w = this.weather;
      this.weather = {
        ...w,
        snow: Math.max(w.snow, w.rain, 0.3),
        rain: 0,
        wet: false,
        snowGround: true,
        temp: Math.min(w.temp, -2),
      };
    }
    this.lift = lift;
    this.hour = (date.getUTCHours() + 3) % 24;
    const w = this.weather;
    const grey = new THREE.Color(0x8d939b);
    const dim = 1 - w.clouds * 0.7 - w.fog * 0.2;
    const T = this.envTarget;
    const darkGrey = grey.clone().multiplyScalar(0.35 + 0.65 * (1 - palette.night));
    T.zenith.setHex(palette.zenith).lerp(darkGrey, w.clouds * 0.75);
    T.horizon.setHex(palette.horizon).lerp(darkGrey, w.clouds * 0.6 + w.fog * 0.3);
    T.fog.setHex(palette.fog).lerp(darkGrey, Math.max(w.clouds * 0.5, w.fog * 0.8));
    T.sun.setHex(palette.sun);
    T.hemiSky.setHex(palette.hemiSky).lerp(grey, w.clouds * 0.4);
    T.hemiGround.setHex(palette.hemiGround);
    T.sunIntensity = palette.sunIntensity * Math.max(0.15, dim);
    T.hemiIntensity = palette.hemiIntensity * (1 + w.clouds * 0.25);
    T.night = palette.night;
    skyDir(sun.azimuth, Math.max(sun.elevation, -4), T.sunDir);
    skyDir(moon.azimuth, moon.elevation, T.moonDir);
    T.moonPhase = moonPhase(date);
    T.moonUp = moon.elevation > 0 ? Math.min(1, moon.elevation / 5) * (1 - w.clouds * 0.85) : 0;
    T.sunUp = sun.elevation > -1 ? (1 - w.clouds * 0.9) * (1 - w.fog) : 0;
    if (immediate) {
      const E = this.env;
      E.zenith.copy(T.zenith);
      E.horizon.copy(T.horizon);
      E.fog.copy(T.fog);
      E.sun.copy(T.sun);
      E.hemiSky.copy(T.hemiSky);
      E.hemiGround.copy(T.hemiGround);
      E.sunIntensity = T.sunIntensity;
      E.hemiIntensity = T.hemiIntensity;
      E.night = T.night;
      E.sunDir.copy(T.sunDir);
      E.moonDir.copy(T.moonDir);
      E.clouds = w.clouds;
      E.rain = w.rain;
      E.snow = w.snow;
      E.fog_ = w.fog;
    }
  }

  /** Nearby characters in front of the camera, nearest first. */
  nearby(maxDistance: number) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const to = new THREE.Vector3();
    return this.characters
      .filter((c) => c.person.root.visible)
      .map((c) => {
        to.copy(c.person.root.position).sub(this.camera.position);
        return {
          id: c.id,
          speaker: c.speaker,
          zone: c.zone,
          dist: to.length(),
          front: to.dot(dir),
        };
      })
      .filter((c) => c.dist < maxDistance && c.front > 0)
      .sort((a, b) => a.dist - b.dist);
  }

  /** A speech bubble over a character (or the dog) for `seconds`; the speaker shows the mood. */
  say(id: string, text: string, seconds = 5, mood: Mood = 'neutral') {
    if (id === 'dog') {
      const d = this.dogState;
      d.bubble ??= this.bubbleEl();
      this.fillBubble(d.bubble, text);
      d.bubbleUntil = this.time + seconds;
      return;
    }
    const c = this.characters.find((ch) => ch.id === id);
    if (!c) return;
    c.bubble ??= this.bubbleEl();
    this.fillBubble(c.bubble, text);
    c.bubbleUntil = this.time + seconds;
    this.setFace(c, mood, seconds);
  }

  /**
   * The character speaking in the dialogue box: the one in the active zone
   * with this voice, else the nearest with it. Shows the mood face and the
   * talking gestures for `seconds`.
   */
  speak(speaker: BanterSpeaker, mood: Mood, seconds = 6) {
    const c =
      this.characters.find(
        (ch) => ch.speaker === speaker && ch.zone && ch.zone === this.activeZone,
      ) ??
      this.characters
        .filter((ch) => ch.speaker === speaker && ch.person.root.visible)
        .sort((a, b) => a.dist - b.dist)[0];
    if (c) this.setFace(c, mood, seconds);
  }

  private setFace(c: Character, mood: Mood, seconds: number) {
    c.mood = mood;
    c.faceUntil = this.time + seconds;
    this.face.show(c.person, mood);
  }

  private bubbleEl() {
    const el = document.createElement('div');
    el.className = 'stroyka-bubble';
    this.opts.overlay.appendChild(el);
    return el;
  }

  private fillBubble(el: HTMLDivElement, text: string) {
    el.replaceChildren(
      ...splitCensored(text).map((part) => {
        const span = document.createElement('span');
        span.textContent = part.text;
        if (part.censored) span.className = 'stroyka-censor';
        return span;
      }),
    );
    // Measured once per line (not every frame) for the on-screen clamp below.
    el.dataset.w = String(el.offsetWidth);
    el.dataset.h = String(el.offsetHeight);
  }

  /** The current frame as a PNG data URL (rendered and read in the same tick). */
  snapshot(): { url: string; width: number; height: number } {
    this.renderer.render(this.scene, this.camera);
    const canvas = this.renderer.domElement;
    return { url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  }

  get state() {
    const c = this.camera.position;
    return {
      hour: this.hour,
      weather: this.weather,
      lift: this.lift,
      night: this.env.night,
      camera: [c.x, c.y, c.z].map((v) => Math.round(v * 10) / 10),
      intro: this.intro.active,
      characters: this.characters.map((ch) => ({
        id: ch.id,
        p: [ch.person.root.position.x, ch.person.root.position.z],
        v: ch.person.root.visible,
        d: ch.person.detailed,
      })),
      dog: {
        p: [this.dogState.pos.x, this.dogState.pos.z].map((v) => Math.round(v * 10) / 10),
        pose: this.dogState.pose,
      },
      season: this.season?.id ?? null,
    };
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.cleanups.forEach((fn) => fn());
    this.observer?.disconnect();
    this.characters.forEach((c) => c.bubble?.remove());
    this.dogState.bubble?.remove();
    // Geometries, materials and every texture they hold (canvas prints, the
    // pixel grain, decals): iPhones run out of WebGL memory and contexts
    // after a few visits otherwise.
    const textures = new Set<THREE.Texture>();
    const materials = new Set<THREE.Material>([this.voxelMat, this.brandMat]);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) materials.add(m);
    });
    for (const m of materials) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      const uniforms = (m as THREE.ShaderMaterial).uniforms;
      if (uniforms)
        for (const u of Object.values(uniforms))
          if (u?.value instanceof THREE.Texture) textures.add(u.value);
      m.dispose();
    }
    textures.forEach((t) => t.dispose());
    resetPeopleMaterials();
    // Shadow maps are render targets of their own.
    this.scene.traverse((obj) => {
      const light = obj as THREE.DirectionalLight;
      if (light.isLight && light.shadow) light.shadow.dispose();
    });
    this.renderer.renderLists.dispose();
    this.renderer.forceContextLoss();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ input

  private bindInput() {
    const { canvas } = this.opts;
    const onKey = (event: KeyboardEvent, down: boolean) => {
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      const key = event.key.toLowerCase();
      const movement = [
        'w',
        'a',
        's',
        'd',
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright',
        'shift',
        'ц',
        'ф',
        'ы',
        'в',
      ];
      if (!movement.includes(key)) return;
      if (down) {
        this.keys.add(key);
        // A movement key ends the fly-over, like a tap does.
        if (key !== 'shift') this.skipIntro();
        if (this.mode === 'tour' && key !== 'shift') this.opts.onWantFree();
        if (key.startsWith('arrow')) event.preventDefault();
      } else this.keys.delete(key);
    };
    const keydown = (e: KeyboardEvent) => onKey(e, true);
    const keyup = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    const blur = () => this.keys.clear();
    window.addEventListener('blur', blur);

    let drag: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      const k = e.pointerType === 'touch' ? 0.006 : 0.004;
      if (this.mode === 'free') {
        this.yaw -= dx * k;
        this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch - dy * k));
      } else {
        this.lookOffset = Math.max(-1.2, Math.min(1.2, this.lookOffset - dx * k));
      }
    };
    let downAt = { x: 0, y: 0, t: 0 };
    const raycaster = new THREE.Raycaster();
    const tapStart = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.skipIntro();
    };
    canvas.addEventListener('pointerdown', tapStart);
    this.cleanups.push(() => canvas.removeEventListener('pointerdown', tapStart));
    const up = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      if (moved > 8 || performance.now() - downAt.t > 450) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, this.camera);
      raycaster.far = 70;
      const targets = [...this.clickables, ...this.world.clickables].filter((o) => {
        let visible = true;
        o.traverseAncestors((a) => {
          if (!a.visible) visible = false;
        });
        return visible && o.visible;
      });
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (hit?.object.userData.dog) {
        this.opts.onDog?.();
        return;
      }
      const target = hit?.object.userData.machine as AdTarget | undefined;
      if (target) this.opts.onAdClick(target);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    const resize = () => this.resize();
    window.addEventListener('resize', resize);
    const visibility = () => {
      this.visible = document.visibilityState === 'visible';
      this.wake();
    };
    document.addEventListener('visibilitychange', visibility);
    this.observer = new IntersectionObserver((entries) => {
      this.onScreen = entries[entries.length - 1]?.isIntersecting ?? true;
      this.wake();
    });
    this.observer.observe(canvas);
    this.cleanups.push(() => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    });
  }

  private resize() {
    const canvas = this.opts.canvas;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 72 : 58;
    this.camera.updateProjectionMatrix();
  }

  private wake() {
    if (this.disposed) return;
    const should = this.visible && this.onScreen;
    if (should && !this.running) {
      this.running = true;
      this.clock.getDelta();
      this.loop();
    } else if (!should) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  // ------------------------------------------------------------------ loop

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    // Machines animate with a clamped step; the camera, tour and walking use
    // real time so a slow device does not turn the tour into slow motion.
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.05);
    this.time += dt;
    this.tick(dt, Math.min(raw, 0.5));
    this.renderer.render(this.scene, this.camera);
    this.measure();
  };

  private lastMeasure = performance.now();
  private measure() {
    this.frames++;
    const nowMs = performance.now();
    this.fpsTime = (nowMs - this.lastMeasure) / 1000;
    if (this.fpsTime < 1) return;
    const fps = this.frames / this.fpsTime;
    this.frames = 0;
    this.lastMeasure = nowMs;
    const t = this.opts.telemetry;
    t.fps = Math.round(fps);
    t.drawCalls = this.renderer.info.render.calls;
    // Adaptive resolution: step down when slow for a few seconds.
    if (fps < 26) this.slowWindows++;
    else this.slowWindows = 0;
    // Never below 1: lower made the blocks look blurry and coarse.
    if (this.slowWindows >= 3 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
      this.slowWindows = 0;
    }
    t.pixelRatio = this.pixelRatio;
  }

  private startBlend(dur: number) {
    this.blend = {
      from: this.camera.position.clone(),
      fromQ: this.camera.quaternion.clone(),
      t: 0,
      dur,
    };
  }

  private tick(dt: number, realDt: number) {
    const time = this.time;
    for (const update of this.updaters) update(time, dt);
    for (const d of this.debris) d.update(dt);
    this.updateCamera(realDt);
    this.updatePeople(dt, realDt);
    this.updateEnvironment(dt, realDt);
  }

  private desired = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  private updateCamera(dt: number) {
    const t = this.opts.telemetry;
    if (this.intro.active) {
      this.intro.t += dt;
      this.introPose(this.intro.t / this.intro.dur);
      if (this.intro.t >= this.intro.dur) this.skipIntro();
      return;
    }
    let moving = 0;
    let heading = this.yaw;
    if (this.mode === 'tour') {
      const n = TOUR_PATH.length;
      const stop = this.stops[this.tourStopIdx]!;
      if (this.tourPhase === 'move') {
        const speed = 2.3;
        const p0 = this.curve.getPoint(this.tourT % 1, this.tmpA);
        const p1 = this.curve.getPoint((this.tourT + 0.0005) % 1, this.tmpB);
        const step = (speed * dt) / Math.max(0.001, p0.distanceTo(p1) / 0.0005);
        const target = stop.index / n;
        const remaining = (((target - this.tourT) % 1) + 1) % 1;
        if (remaining <= step) {
          this.tourT = target;
          this.tourPhase = 'stop';
          this.tourTimer = 0;
        } else {
          this.tourT = (this.tourT + step) % 1;
          moving = 1;
        }
      } else {
        this.tourTimer += dt;
        const done = this.tourTimer > TOUR_STOP_SECONDS && !this.hold;
        if (done || this.skipStop) {
          this.skipStop = false;
          this.tourPhase = 'move';
          this.tourStopIdx = (this.tourStopIdx + 1) % this.stops.length;
        }
      }
      const pos = this.curve.getPoint(this.tourT % 1, this.tmpA);
      this.player.set(pos.x, 0, pos.z);
      const ahead = this.curve.getPoint((this.tourT + 0.004) % 1, this.tmpB);
      const forward = ahead.sub(pos).setY(0).normalize().clone();
      // Look ahead while walking, turn to the machine near a stop.
      const cur = this.stops[this.tourStopIdx]!;
      const prev = this.stops[(this.tourStopIdx + this.stops.length - 1) % this.stops.length]!;
      const zoneNext = zoneById(cur.zone);
      const zonePrev = zoneById(prev.zone);
      const dNext = Math.hypot(pos.x - zoneNext.stand[0], pos.z - zoneNext.stand[1]);
      const dPrev = Math.hypot(pos.x - zonePrev.stand[0], pos.z - zonePrev.stand[1]);
      const wNext = 1 - smooth(0, 9, dNext);
      const wPrev = this.tourPhase === 'move' ? 1 - smooth(0, 5, dPrev) : 0;
      const focusZone = wNext >= wPrev ? zoneNext : zonePrev;
      const w = Math.max(wNext, wPrev);
      const fwdLook = new THREE.Vector3(pos.x + forward.x * 10, 1.5, pos.z + forward.z * 10);
      const focus = new THREE.Vector3(...focusZone.focus);
      const want = fwdLook.lerp(focus, w);
      this.lookTarget.lerp(want, damp(2.2, dt));
      heading = Math.atan2(this.lookTarget.x - pos.x, this.lookTarget.z - pos.z);
      if (moving) {
        // Blend the walking direction toward the machine along the shortest turn.
        const walkDir = Math.atan2(forward.x, forward.z);
        const turn = Math.atan2(Math.sin(heading - walkDir), Math.cos(heading - walkDir));
        heading = walkDir + turn * w;
      }
      this.lookOffset *= 1 - damp(0.6, dt);
      const tpWanted = zoneNext.view === 'tp' && dNext < 26 ? 1 : 0;
      this.tp += (tpWanted - this.tp) * damp(1.4, dt);
      t.tourStop = this.tourPhase === 'stop' ? cur.zone : null;
    } else {
      // Free walk: keys and joystick, relative to the view direction.
      const k = this.keys;
      let fwd = this.opts.input.joyY;
      let side = this.opts.input.joyX;
      if (k.has('w') || k.has('ц') || k.has('arrowup')) fwd += 1;
      if (k.has('s') || k.has('ы') || k.has('arrowdown')) fwd -= 1;
      if (k.has('a') || k.has('ф')) side -= 1;
      if (k.has('d') || k.has('в')) side += 1;
      if (k.has('arrowleft')) this.yaw += 1.8 * dt;
      if (k.has('arrowright')) this.yaw -= 1.8 * dt;
      const len = Math.hypot(fwd, side);
      if (len > 1) {
        fwd /= len;
        side /= len;
      }
      const speed = (k.has('shift') ? 7 : 4.2) * dt;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const nx = this.player.x + (sin * fwd - cos * side) * speed;
      const nz = this.player.z + (cos * fwd + sin * side) * speed;
      const [rx, rz] = resolveCollision(nx, nz, PLAYER_RADIUS, this.obstacles);
      moving = Math.min(1, len);
      this.player.set(rx, 0, rz);
      heading = this.yaw;
      this.tp += ((this.view === 'tp' ? 1 : 0) - this.tp) * damp(4, dt);
      t.tourStop = null;
    }
    this.walkPhase += moving * dt * 7.5;

    // First-person eye and over-the-shoulder camera, blended by `tp`.
    const h = heading + this.lookOffset;
    const pitch = this.mode === 'free' ? this.pitch : 0;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const bob = moving * Math.sin(this.walkPhase * 2) * 0.045;
    const sway = moving * Math.sin(this.walkPhase) * 0.03;
    const eye = this.tmpA.set(this.player.x - fz * sway, 1.65 + bob, this.player.z + fx * sway);
    const fpLook =
      this.mode === 'tour' && Math.abs(this.lookOffset) < 0.01
        ? this.lookTarget.clone()
        : new THREE.Vector3(
            eye.x + fx * Math.cos(pitch) * 10,
            eye.y + Math.sin(pitch) * 10,
            eye.z + fz * Math.cos(pitch) * 10,
          );
    const tpPos = new THREE.Vector3(
      this.player.x - fx * 3.4 - fz * 0.75,
      2.35 - pitch * 1.2,
      this.player.z - fz * 3.4 + fx * 0.75,
    );
    const tpLook = new THREE.Vector3(
      this.player.x + fx * 6,
      1.4 + Math.sin(pitch) * 6,
      this.player.z + fz * 6,
    );
    const s = smooth(0, 1, this.tp);
    this.desired.pos.copy(eye).lerp(tpPos, s);
    this.desired.look.copy(fpLook).lerp(tpLook, s);
    this.camera.position.copy(this.desired.pos);
    this.camera.lookAt(this.desired.look);
    if (this.blend) {
      this.blend.t += dt;
      const k = smooth(0, 1, this.blend.t / this.blend.dur);
      const q = this.camera.quaternion.clone();
      this.camera.position.lerpVectors(this.blend.from, this.desired.pos, k);
      this.camera.quaternion.slerpQuaternions(this.blend.fromQ, q, k);
      if (this.blend.t >= this.blend.dur) this.blend = null;
    }

    // The player's own worker, seen over the shoulder.
    const av = this.avatar.root;
    av.visible = s > 0.12;
    av.position.set(this.player.x, 0, this.player.z);
    av.rotation.y = heading;
    walk(this.avatar, this.walkPhase, moving);

    // Zones.
    const zone = detectZone(this.player.x, this.player.z, this.zone);
    if (zone !== this.zone) {
      this.zone = zone;
      t.zone = zone;
      this.opts.onZone(zone);
    }
    t.x = this.player.x;
    t.z = this.player.z;
    t.yaw = heading;
  }

  private updatePeople(dt: number, realDt = dt) {
    const time = this.time;
    const cam = this.camera.position;
    const lunch = this.hour >= 12 && this.hour < 13;
    const night = this.env.night > 0.5;
    const project = new THREE.Vector3();
    const w = this.opts.canvas.clientWidth;
    const h = this.opts.canvas.clientHeight;
    this.bubbleRects.length = 0;
    for (const c of this.characters) {
      const root = c.person.root;
      if (c.guard) {
        root.visible = night;
        this.guardBeam.visible = night;
      }
      let moving = 0;
      let phase = 0;
      if (c.patrol && root.visible && !(lunch && !c.guard)) {
        // Walk the patrol path back and forth.
        const pts = c.patrol;
        const speed = c.guard ? 1.1 : 1.3;
        const legs = pts.map((p, i) => p.distanceTo(pts[(i + 1) % pts.length]!));
        const total = legs.reduce((a, b) => a + b, 0);
        let d = (time * speed) % total;
        let i = 0;
        while (d > legs[i]!) d -= legs[i++]!;
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        root.position.lerpVectors(a, b, d / legs[i]!);
        root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        moving = 1;
        // Steps follow the distance walked: about 1.4 m per stride.
        phase = time * speed * 4.4;
      }
      const dx = cam.x - root.position.x;
      const dz = cam.z - root.position.z;
      c.dist = Math.hypot(dx, dz);
      const toCam = Math.atan2(dx, dz);
      if (!moving) {
        const want = c.dist < 14 && c.zone ? toCam : c.baseYaw;
        let diff = want - root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        root.rotation.y += diff * damp(3, dt);
      }
      // The head turns to a visitor who comes close.
      let look = 0;
      if (c.dist < 8 && !moving) {
        const rel = Math.atan2(
          Math.sin(toCam - root.rotation.y),
          Math.cos(toCam - root.rotation.y),
        );
        look = Math.max(-1, Math.min(1, rel));
      }
      const talking =
        c.bubbleUntil > time || c.faceUntil > time || (!!c.zone && c.zone === this.activeZone);
      // Lunch: the crew sits down with thermoses.
      const sitting = lunch && !!c.sitter;
      root.position.y = sitting ? -0.45 : 0;
      if (c.person.detailed && root.visible)
        animatePerson(c.person, {
          time,
          walk: moving,
          phase,
          sit: sitting,
          talking,
          mood: c.faceUntil > time ? c.mood : 'neutral',
          look,
        });
      // Speech bubble.
      if (c.bubble) this.placeBubble(c.bubble, c.bubbleUntil, root, 2.45, project, w, h);
    }
    // The mood face stays on the speaker while their line lasts.
    const speaker = this.face.person;
    if (speaker) {
      const c = this.characters.find((ch) => ch.person === speaker);
      if (!c || c.faceUntil <= time || !speaker.detailed) this.face.hide();
    }
    this.updateLod(time);
    this.updateDog(realDt, night, project, w, h);
  }

  /**
   * Full detail for the nearest people within DETAIL_DISTANCE, capped on
   * phones; one-mesh stand-ins for the rest. Re-ranked a few times a second.
   */
  private updateLod(time: number) {
    if (time < this.nextLod) return;
    this.nextLod = time + 0.3;
    const cap = this.opts.mobile ? 6 : 14;
    const ranked = this.characters
      .filter((c) => c.person.root.visible)
      .sort(
        (a, b) => a.dist - (a.faceUntil > time ? 50 : 0) - (b.dist - (b.faceUntil > time ? 50 : 0)),
      );
    let detailed = 0;
    let lod = 0;
    ranked.forEach((c, i) => {
      const on = c.dist < DETAIL_DISTANCE && i < cap;
      setDetail(c.person, on);
      if (on) detailed++;
      else lod++;
    });
    this.opts.telemetry.people = { detailed, lod };
  }

  /** Bubbles placed this frame (centre x, bottom y, size), for the overlap check. */
  private bubbleRects: { x: number; y: number; w: number; h: number }[] = [];

  private placeBubble(
    el: HTMLDivElement,
    until: number,
    root: THREE.Object3D,
    height: number,
    project: THREE.Vector3,
    w: number,
    h: number,
  ) {
    const show = until > this.time && root.visible;
    if (!show) {
      el.style.opacity = '0';
      return;
    }
    project.copy(root.position).setY(height).project(this.camera);
    const behind = project.z > 1;
    const far = root.position.distanceTo(this.camera.position) > 45;
    if (behind || far) el.style.opacity = '0';
    else {
      el.style.opacity = '1';
      // Keep the bubble on screen and below the HUD (mission card, mini-map,
      // menu button): on a phone they take the top ~third of the screen.
      const bw = Number(el.dataset.w) || 0;
      const bh = Number(el.dataset.h) || 0;
      const safeTop = w < 640 ? Math.min(290, h * 0.36) : 72;
      const x = Math.min(Math.max(((project.x + 1) / 2) * w, bw / 2 + 8), w - bw / 2 - 8);
      let y = Math.max(((1 - project.y) / 2) * h, safeTop + bh);
      // Two bubbles never cover each other: a later one moves below, and is
      // hidden for now if that would push it down into the dialogue area.
      let pushed = false;
      for (const r of this.bubbleRects) {
        const overlapX = Math.abs(r.x - x) < (r.w + bw) / 2;
        const overlapY = y > r.y - r.h && y - bh < r.y;
        if (overlapX && overlapY) {
          y = r.y + bh + 6;
          pushed = true;
        }
      }
      if (pushed && y > h * (w < 640 ? 0.46 : 0.6)) {
        el.style.opacity = '0';
        return;
      }
      this.bubbleRects.push({ x, y, w: bw, h: bh });
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  /**
   * «Бетон»: sits by Михалыч at the gate, trots after the visitor in free
   * walk, sleeps by the cabin at night.
   */
  private updateDog(dt: number, night: boolean, project: THREE.Vector3, w: number, h: number) {
    const d = this.dogState;
    const root = this.dog.root;
    let target: THREE.Vector3;
    let rest: DogPose = 'sit';
    let restYaw = 0.2;
    if (night && !(this.mode === 'free' && this.player.distanceTo(d.pos) < 12)) {
      target = this.tmpB.set(19.6, 0, 49.9);
      rest = 'sleep';
      restYaw = 1.2;
    } else if (this.mode === 'free' && !this.intro.active) {
      // At the visitor's side, a little ahead: in view in both cameras.
      const side = this.yaw - 0.3;
      target = this.tmpB.set(
        this.player.x + Math.sin(side) * 2.3,
        0,
        this.player.z + Math.cos(side) * 2.3,
      );
      rest = 'sit';
      restYaw = Math.atan2(this.player.x - d.pos.x, this.player.z - d.pos.z);
    } else {
      target = this.tmpB.set(4.2, 0, 51.8);
      restYaw = Math.atan2(0 - 4.2, 58 - 51.8);
    }
    const to = this.tmpA.copy(target).sub(d.pos).setY(0);
    const dist = to.length();
    let moving = false;
    if (dist > 0.6) {
      // Trot (or run to catch up).
      const speed = Math.min(dist > 6 ? 6.5 : 3.6, dist * 2.5);
      const step = Math.min(dist, speed * dt);
      to.multiplyScalar(step / dist);
      const [x, z] = resolveCollision(d.pos.x + to.x, d.pos.z + to.z, 0.3, this.obstacles);
      d.pos.set(x, 0, z);
      d.phase += step * 7;
      let diff = Math.atan2(to.x, to.z) - d.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      d.yaw += diff * damp(8, dt);
      moving = true;
      // Lost far behind (a teleport, a long jump of the tour): catch up at once.
      if (dist > 40 || !this.dogPlaced) d.pos.copy(target);
    } else {
      let diff = restYaw - d.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      d.yaw += diff * damp(3, dt);
    }
    this.dogPlaced = true;
    d.pose = moving ? 'trot' : rest;
    root.position.copy(d.pos);
    root.rotation.y = d.yaw;
    const near = d.pos.distanceTo(this.camera.position) < 60;
    root.visible = near;
    if (near) animateDog(this.dog, d.pose, this.time, d.phase);
    if (d.bubble) this.placeBubble(d.bubble, d.bubbleUntil, root, 1.1, project, w, h);
  }

  private updateEnvironment(dt: number, realDt: number) {
    const T = this.envTarget;
    const E = this.env;
    const k = damp(0.8, realDt);
    E.zenith.lerp(T.zenith, k);
    E.horizon.lerp(T.horizon, k);
    E.fog.lerp(T.fog, k);
    E.sun.lerp(T.sun, k);
    E.hemiSky.lerp(T.hemiSky, k);
    E.hemiGround.lerp(T.hemiGround, k);
    E.sunIntensity += (T.sunIntensity - E.sunIntensity) * k;
    E.hemiIntensity += (T.hemiIntensity - E.hemiIntensity) * k;
    E.night += (T.night - E.night) * k;
    E.sunDir.lerp(T.sunDir, k).normalize();
    E.moonDir.lerp(T.moonDir, k).normalize();
    const w = this.weather;
    E.clouds += (w.clouds - E.clouds) * k;
    E.rain += (w.rain - E.rain) * k;
    E.snow += (w.snow - E.snow) * k;
    E.fog_ += (w.fog - E.fog_) * k;

    // Thunder flashes.
    let flash = 0;
    if (w.thunder) {
      if (this.time > this.nextFlash) {
        this.flashUntil = this.time + 0.18;
        this.nextFlash = this.time + 6 + Math.random() * 10;
      }
      if (this.time < this.flashUntil) flash = 0.6 + Math.random() * 0.4;
    }

    // Lights: the sun by day, the moon at night (dimmer, bluish).
    const nightK = E.night;
    const moonLight = 0.25 + 0.35 * (1 - Math.abs(T.moonPhase - 0.5) * 2) * T.moonUp;
    const useMoon = E.sunIntensity < 0.25;
    const lightDir = useMoon ? E.moonDir : E.sunDir;
    this.sun.color.copy(useMoon ? new THREE.Color(0x9fb4ff) : E.sun);
    this.sun.intensity = useMoon ? moonLight * (1 - E.clouds * 0.7) : E.sunIntensity;
    const focus = this.player;
    const snap = (v: number) => Math.round(v / 4) * 4;
    this.sun.target.position.set(snap(focus.x), 0, snap(focus.z));
    const dirY = Math.max(lightDir.y, 0.12);
    this.sun.position
      .set(lightDir.x, dirY, lightDir.z)
      .normalize()
      .multiplyScalar(120)
      .add(this.sun.target.position);
    this.hemi.color.copy(E.hemiSky);
    this.hemi.groundColor.copy(E.hemiGround);
    this.hemi.intensity = E.hemiIntensity + flash * 3;
    this.renderer.toneMappingExposure = 1 + nightK * 0.45;

    // Fog distance: weather and night.
    const mobileFar = this.opts.mobile ? 0.85 : 1;
    const far = (230 - 170 * E.fog_ - 70 * E.rain - 60 * E.snow) * mobileFar;
    // The aerial opening shot sees farther.
    const aerial = this.intro.active
      ? 1 + 1.6 * (1 - smooth(0.6, 1, this.intro.t / this.intro.dur))
      : 1;
    this.fog.far = Math.max(45, far) * aerial;
    this.fog.near = Math.max(3, 40 - 34 * E.fog_ - 10 * E.rain) * aerial;
    this.fog.color.copy(E.fog);
    this.scene.background = this.fog.color;

    // Night lights.
    const n = smooth(0.25, 0.75, nightK);
    for (const o of this.world.night) o.visible = n > 0.02;
    const [beamMat, poolMat, paneMat] = this.world.nightMaterials as THREE.MeshBasicMaterial[];
    beamMat!.opacity = 0.07 * n * (1 + E.fog_ * 1.5 + E.rain);
    poolMat!.opacity = 0.5 * n;
    paneMat!.opacity = 0.95 * n;
    if (this.headBeamMat) this.headBeamMat.opacity = 0.11 * n;
    for (const b of this.headBeams) b.visible = n > 0.05;
    // The night light follows the floodlight nearest to the camera.
    let best = this.world.lampHeads[0]!;
    let bestD = Infinity;
    for (const head of this.world.lampHeads) {
      const d = head.distanceToSquared(this.camera.position);
      if (d < bestD) {
        bestD = d;
        best = head;
      }
    }
    const mast = MASTS[this.world.lampHeads.indexOf(best)]!;
    this.tmpB.set((best.x + mast.aim[0]) / 2, MAST_HEIGHT - 3, (best.z + mast.aim[1]) / 2);
    this.nightLight.position.lerp(this.tmpB, damp(1.5, dt));
    this.nightLight.intensity = 140 * n;
    // Beacons blink.
    const blink = Math.sin(this.time * 7) > 0.2;
    this.M.beacon.color.setHex(blink ? 0xffa21a : 0x5a3200);

    // Ground: wet (darker, puddles) or snow (white).
    const ground = w.snowGround ? 'snow' : w.wet ? 'wet' : 'dry';
    if (ground !== this.ground) {
      this.ground = ground;
      const white = new THREE.Color(0xf4f7fb);
      const t = this.world.terrain;
      const hp = this.world.heaps;
      if (ground === 'snow') {
        retint(t.mesh, t.colors, white, 0.88);
        retint(hp.mesh, hp.colors, white, 0.6);
        (this.world.farGround.material as THREE.MeshLambertMaterial).color.setHex(0xe8eef4);
      } else if (ground === 'wet') {
        retint(t.mesh, t.colors, new THREE.Color(0x3a3f48), 0.2, 0.62);
        retint(hp.mesh, hp.colors, white, 0, 0.7);
        (this.world.farGround.material as THREE.MeshLambertMaterial).color.setHex(0x3f5528);
      } else {
        retint(t.mesh, t.colors, white, 0);
        retint(hp.mesh, hp.colors, white, 0);
        (this.world.farGround.material as THREE.MeshLambertMaterial).color.setHex(0x5a7434);
      }
      this.world.puddles.visible = ground === 'wet';
    }

    // Wind direction in world space: the wind blows toward windDir + 180°.
    const toward = ((w.windDir + 180) * Math.PI) / 180;
    const wx = Math.sin(toward) * w.wind;
    const wz = -Math.cos(toward) * w.wind;
    this.world.updateFlags(this.time, w.wind, Math.atan2(wx, wz));
    this.world.updateAds(this.time, n);
    if (this.project) {
      (this.project.lit.material as THREE.MeshBasicMaterial).opacity = 0.95 * n;
      this.project.lit.visible = n > 0.02;
      if (this.reveal) {
        this.reveal.t += dt;
        const k = smooth(0, 1, this.reveal.t / this.reveal.dur);
        this.project.mesh.count = Math.round(
          this.reveal.from + (this.project.total - this.reveal.from) * k,
        );
        if (k >= 1) this.reveal = null;
      }
    }
    if (this.cityLit) {
      (this.cityLit.material as THREE.MeshBasicMaterial).opacity = 0.85 * n;
      this.cityLit.visible = n > 0.02;
    }
    if (this.district) {
      (this.district.lit.material as THREE.MeshBasicMaterial).opacity = 0.9 * n;
      this.district.lit.visible = n > 0.02;
    }
    if (this.tower?.root.visible) {
      this.tower.jib.rotation.y = Math.sin(this.time * 0.07) * 1.4 + 0.6;
      this.tower.red.color.setHex(Math.sin(this.time * 3) > 0 || n < 0.3 ? 0xff2020 : 0x400000);
    }
    // Holiday garland: the colours run along the string.
    if (this.garland) {
      const g = this.garland;
      const shift = Math.floor(this.time * 3);
      const c = new THREE.Color();
      for (let i = 0; i < g.colors.length; i++) {
        c.copy(g.colors[(i + shift) % g.colors.length]!).multiplyScalar(0.6 + 0.6 * n);
        g.mesh.setColorAt(i, c);
      }
      if (g.mesh.instanceColor) g.mesh.instanceColor.needsUpdate = true;
    }
    // Handover night: fireworks over the finished object.
    if (this.fireworks) {
      if (n > 0.4 && this.time > this.nextFirework) {
        this.nextFirework = this.time + 1.2 + Math.random() * 2;
        const at = new THREE.Vector3(
          18 + Math.random() * 12,
          30 + Math.random() * 12,
          -30 + Math.random() * 6,
        );
        this.fireworks.emit(at, 0.3, 40);
        (this.fireworks.points.material as THREE.PointsMaterial).color.setHSL(
          Math.random(),
          0.9,
          0.65,
        );
      }
      this.fireworks.update(dt * 0.35);
    }

    this.atmosphere.setSky(E.zenith, E.horizon, E.sun, E.sunDir);
    this.atmosphere.skyUniforms.glow.value = (1 - E.clouds * 0.8) * (1 - nightK);
    this.atmosphere.skyUniforms.flash.value = flash * 0.5;
    this.atmosphere.setBodies(
      this.camera,
      E.sunDir,
      T.sunUp * (1 - nightK),
      E.moonDir,
      T.moonPhase,
      T.moonUp,
    );
    this.atmosphere.update(dt, this.time, this.camera, {
      clouds: E.clouds,
      rain: E.rain,
      snow: E.snow,
      dust: (1 - nightK) * (w.wet || w.snow > 0 ? 0 : 1) * (1 - E.fog_),
      night: nightK,
      windX: wx,
      windZ: wz,
    });
  }
}

export { BOUNDS };
