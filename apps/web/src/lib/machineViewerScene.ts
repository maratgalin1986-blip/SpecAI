import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MachineKind } from './equipmentCatalog';
import {
  buildBackhoeLoader,
  buildBulldozer,
  buildDumpTruck,
  buildMobileCrane,
  buildWheelLoader,
  createEnvironment,
  type MachineModel,
} from './realisticMachines';

// Turntable viewer for the machine page: one realistic model on a small
// showroom disc, drag to rotate, slow auto-rotation. Imported dynamically by
// Machine3DViewer so three.js stays out of the page bundle.

const AMBER = 0xf59e0b;

export interface WorkingEnvelope {
  /** Max dig depth below ground, metres (from the listing's specs). */
  digDepth?: number | null;
  /** Max digging reach from the swing axis, metres (from the listing's specs). */
  reach?: number | null;
}

export interface MachineViewer {
  setRunning(running: boolean): void;
  dispose(): void;
}

function buildPosed(kind: MachineKind): { model: MachineModel; origin?: THREE.Vector3 } {
  switch (kind) {
    case 'backhoe': {
      const model = buildBackhoeLoader();
      model.setStabilisers(1);
      model.setLoader(0.05, 0.1);
      model.setHoe(model.solveHoe(3.9, 1.3, -0.9, 0));
      model.update();
      return { model, origin: model.hoeOrigin.clone() };
    }
    case 'crane': {
      const model = buildMobileCrane();
      model.setOutriggers(1);
      model.setBoom(0.62, 0.22, 2.6);
      model.update();
      return { model };
    }
    case 'wheelLoader': {
      const model = buildWheelLoader();
      model.setLoader(0.35, 0.55);
      model.update();
      return { model };
    }
    case 'dumpTruck': {
      const model = buildDumpTruck();
      model.setTip(0, 0.9);
      model.update();
      return { model };
    }
    case 'dozer': {
      const model = buildBulldozer();
      model.setBlade(0.25);
      model.setRipper(0);
      model.update();
      return { model };
    }
  }
}

/** Dashed schematic of the dig depth and reach behind the swing axis, from specs. */
function envelopeLines(origin: THREE.Vector3, envelope: WorkingEnvelope) {
  const group = new THREE.Group();
  const material = new THREE.LineDashedMaterial({
    color: AMBER,
    dashSize: 0.18,
    gapSize: 0.12,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const add = (points: THREE.Vector3[]) => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    line.computeLineDistances();
    line.renderOrder = 10;
    group.add(line);
  };
  const { digDepth, reach } = envelope;
  const floor = digDepth ? -digDepth : -Infinity;
  if (reach) {
    // Arc in the boom plane behind the machine (-x), clipped at the dig depth.
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = -Math.PI / 2 + (i / 64) * (Math.PI * 0.95);
      const y = Math.sin(angle) * reach;
      if (y < floor) continue;
      points.push(new THREE.Vector3(origin.x - Math.cos(angle) * reach, y, 0));
    }
    if (points.length > 1) add(points);
  }
  if (digDepth) {
    const far = origin.x - (reach ? Math.sqrt(Math.max(0, reach ** 2 - digDepth ** 2)) : 4);
    add([new THREE.Vector3(origin.x, -digDepth, 0), new THREE.Vector3(far, -digDepth, 0)]);
    add([new THREE.Vector3(origin.x, 0, 0), new THREE.Vector3(origin.x, -digDepth, 0)]);
  }
  return { group, material };
}

export function createMachineViewer(
  container: HTMLElement,
  options: { kind: MachineKind; reducedMotion: boolean; envelope?: WorkingEnvelope },
): MachineViewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.cursor = 'grab';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const environment = createEnvironment(renderer);
  scene.environment = environment;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

  const { model, origin } = buildPosed(options.kind);
  scene.add(model.root);
  model.root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  // Centre the machine on the turntable.
  const box = new THREE.Box3().setFromObject(model.root);
  const center = box.getCenter(new THREE.Vector3());
  model.root.position.x -= center.x;
  model.root.position.z -= center.z;
  model.update();

  let envelope: ReturnType<typeof envelopeLines> | undefined;
  if (origin && (options.envelope?.digDepth || options.envelope?.reach)) {
    envelope = envelopeLines(origin, options.envelope);
    model.root.add(envelope.group);
  }

  const framed = new THREE.Box3().setFromObject(model.root);
  const size = framed.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * 0.56;
  // Frame the machine together with its turntable.
  framed.union(
    new THREE.Box3(new THREE.Vector3(-radius, 0, -radius), new THREE.Vector3(radius, 0, radius)),
  );
  const sphere = framed.getBoundingSphere(new THREE.Sphere());

  // Showroom disc with an amber rim, and a shadow catcher on top of it.
  const discMaterial = new THREE.MeshStandardMaterial({
    color: 0x141a26,
    roughness: 0.85,
    metalness: 0.1,
  });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.08, 96), discMaterial);
  disc.position.y = -0.04;
  disc.receiveShadow = true;
  scene.add(disc);
  const rimMaterial = new THREE.MeshBasicMaterial({ color: AMBER });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 8, 128), rimMaterial);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  scene.add(new THREE.HemisphereLight(0xdbe4f0, 0x2b2621, 0.8));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  sun.position.set(radius * 0.8, radius * 2.2, radius * 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, {
    left: -radius * 1.4,
    right: radius * 1.4,
    top: radius * 1.4,
    bottom: -radius * 1.4,
    near: 0.5,
    far: radius * 6,
  });
  scene.add(sun);
  const rim = new THREE.PointLight(AMBER, 30, radius * 5);
  rim.position.set(-radius * 1.2, radius * 0.6, -radius * 1.4);
  scene.add(rim);

  const target = new THREE.Vector3(0, envelope ? sphere.center.y : size.y * 0.3, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  // One-finger vertical swipes still scroll the page on phones.
  renderer.domElement.style.touchAction = 'pan-y';
  controls.target.copy(target);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = envelope ? Math.PI / 2 - 0.02 : 1.42;
  controls.autoRotate = !options.reducedMotion;
  controls.autoRotateSpeed = 1.1;

  let running = true;
  let frame = 0;
  let idleFrames = 0;

  let fitDistance = 10;
  function resize() {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // Fit the bounding sphere into the narrower field of view.
    const vertical = THREE.MathUtils.degToRad(camera.fov) / 2;
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    fitDistance =
      (sphere.radius * (envelope ? 0.98 : 0.78)) / Math.sin(Math.min(vertical, horizontal));
    camera.updateProjectionMatrix();
    requestRender();
  }

  // Three-quarter front view to start with; side-on when the dig envelope is drawn.
  const startDirection = (
    envelope ? new THREE.Vector3(-0.35, 0.18, 1) : new THREE.Vector3(1, 0.34, 0.95)
  ).normalize();
  resize();
  camera.position.copy(target).addScaledVector(startDirection, fitDistance);
  controls.minDistance = controls.maxDistance = fitDistance;
  controls.update();

  let resumeTimer = 0;
  const onStart = () => {
    controls.autoRotate = false;
    renderer.domElement.style.cursor = 'grabbing';
    window.clearTimeout(resumeTimer);
  };
  const onEnd = () => {
    renderer.domElement.style.cursor = 'grab';
    if (!options.reducedMotion) {
      resumeTimer = window.setTimeout(() => {
        controls.autoRotate = true;
        requestRender();
      }, 4000);
    }
  };
  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);
  controls.addEventListener('change', () => requestRender());

  const observer = new ResizeObserver(() => {
    resize();
    controls.minDistance = controls.maxDistance = fitDistance;
  });
  observer.observe(container);

  function tick() {
    // \`frame\` stays set while ticking, so 'change' events fired by
    // controls.update() don't schedule a second loop.
    const moved = controls.update();
    renderer.render(scene, camera);
    // Keep animating while rotating or while damping settles, then sleep.
    idleFrames = moved || controls.autoRotate ? 0 : idleFrames + 1;
    frame = running && idleFrames < 30 ? requestAnimationFrame(tick) : 0;
  }

  function requestRender() {
    idleFrames = 0;
    if (running && !frame) frame = requestAnimationFrame(tick);
  }

  requestRender();

  return {
    setRunning(next) {
      running = next;
      if (next) requestRender();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frame);
      window.clearTimeout(resumeTimer);
      observer.disconnect();
      controls.dispose();
      model.dispose();
      envelope?.group.children.forEach((line) => (line as THREE.Line).geometry.dispose());
      envelope?.material.dispose();
      disc.geometry.dispose();
      discMaterial.dispose();
      ring.geometry.dispose();
      rimMaterial.dispose();
      sun.shadow.map?.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
