// Sky dome, sun and moon, stars, drifting block clouds, rain, snow and dust.
// Particles are Points/LineSegments around the camera with capped counts.
import * as THREE from 'three';

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float glow;
uniform float flash;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(horizon, zenith, pow(h, 0.5));
  if (d.y < 0.0) col = horizon * 0.85;
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(s, 6.0) * 0.28 + pow(s, 60.0) * 0.5) * glow;
  col += vec3(flash);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function moonTexture(phase: number) {
  // A 16×16 pixel moon: lit part from the phase (blocky, like the rest).
  const n = 16;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const k = Math.cos(phase * Math.PI * 2); // 1 new … -1 full
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / (n / 2) - 1;
      const v = (y + 0.5) / (n / 2) - 1;
      if (u * u + v * v > 1) continue;
      const edge = Math.sqrt(1 - v * v);
      // Waxing: lit on the right; the terminator is an ellipse of width k·edge.
      const lit = phase < 0.5 ? u > k * edge : u < -k * edge;
      const crater = (x * 7 + y * 13) % 11 === 0 ? 0.85 : 1;
      const c = lit ? Math.round(235 * crater) : 38;
      ctx.fillStyle = `rgba(${c},${c},${lit ? Math.round(c * 0.95) : 52},${lit ? 1 : 0.55})`;
      ctx.fillRect(x, y, 1, 1);
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface WeatherLevels {
  clouds: number;
  rain: number;
  snow: number;
  dust: number;
  night: number;
  windX: number;
  windZ: number;
}

export class Atmosphere {
  readonly group = new THREE.Group();
  readonly sky: THREE.Mesh;
  readonly skyUniforms: {
    zenith: { value: THREE.Color };
    horizon: { value: THREE.Color };
    sunColor: { value: THREE.Color };
    sunDir: { value: THREE.Vector3 };
    glow: { value: number };
    flash: { value: number };
  };
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private moonPhaseShown = -1;
  private stars: THREE.Points;
  private clouds: THREE.InstancedMesh;
  private cloudBlocks: {
    cluster: number;
    dx: number;
    dy: number;
    dz: number;
    sx: number;
    sy: number;
    sz: number;
  }[] = [];
  private cloudCenters: THREE.Vector3[] = [];
  private clusterEnd: number[] = [];
  private cloudOffset = new THREE.Vector2();
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private rainMat: THREE.LineBasicMaterial;
  private rainCount: number;
  private snow: THREE.Points;
  private snowPos: Float32Array;
  private snowCount: number;
  private dust: THREE.Points;
  private dustPos: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private frame = 0;
  private white = new THREE.Color(0xffffff);

  constructor(mobile: boolean) {
    this.skyUniforms = {
      zenith: { value: new THREE.Color(0x3c7ad6) },
      horizon: { value: new THREE.Color(0xbcd6ee) },
      sunColor: { value: new THREE.Color(0xffffff) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      glow: { value: 1 },
      flash: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 22),
      new THREE.MeshBasicMaterial({
        color: 0xffe2a8,
        fog: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.sun.renderOrder = -9;
    this.group.add(this.sun);
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshBasicMaterial({ fog: false, transparent: true, depthWrite: false }),
    );
    this.moon.renderOrder = -9;
    this.group.add(this.moon);

    // Stars on the upper hemisphere.
    const starCount = mobile ? 350 : 700;
    const stars = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.08 + Math.random() * 0.92;
      const r = Math.sqrt(1 - y * y);
      stars.set([Math.cos(a) * r * 400, y * 400, Math.sin(a) * r * 400], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: mobile ? 1.6 : 2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false,
      }),
    );
    this.stars.renderOrder = -8;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    // Block clouds: clusters of flat boxes.
    const clusters = mobile ? 26 : 44;
    for (let c = 0; c < clusters; c++) {
      this.cloudCenters.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 700,
          70 + Math.random() * 30,
          (Math.random() - 0.5) * 700,
        ),
      );
      const blocks = 4 + Math.floor(Math.random() * 5);
      for (let b = 0; b < blocks; b++) {
        this.cloudBlocks.push({
          cluster: c,
          dx: (Math.random() - 0.5) * 30,
          dy: (Math.random() - 0.5) * 3,
          dz: (Math.random() - 0.5) * 20,
          sx: 10 + Math.floor(Math.random() * 3) * 6,
          sy: 3 + Math.floor(Math.random() * 2) * 2,
          sz: 8 + Math.floor(Math.random() * 3) * 4,
        });
      }
      this.clusterEnd.push(this.cloudBlocks.length);
    }
    this.clouds = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
      this.cloudBlocks.length,
    );
    this.clouds.frustumCulled = false;
    this.clouds.count = 0;
    this.group.add(this.clouds);

    // Rain streaks.
    this.rainCount = mobile ? 700 : 1600;
    this.rainPos = new Float32Array(this.rainCount * 6);
    for (let i = 0; i < this.rainCount; i++) {
      const x = (Math.random() - 0.5) * 50;
      const y = Math.random() * 30;
      const z = (Math.random() - 0.5) * 50;
      this.rainPos.set([x, y, z, x, y + 0.7, z], i * 6);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xaebccc,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.rain = new THREE.LineSegments(rainGeo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.rain);

    // Snow flakes (square points, in style).
    this.snowCount = mobile ? 800 : 1800;
    this.snowPos = new Float32Array(this.snowCount * 3);
    for (let i = 0; i < this.snowCount; i++)
      this.snowPos.set(
        [(Math.random() - 0.5) * 50, Math.random() * 25, (Math.random() - 0.5) * 50],
        i * 3,
      );
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.95 }),
    );
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.group.add(this.snow);

    // Dust motes in the sun.
    const dustCount = mobile ? 120 : 260;
    this.dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++)
      this.dustPos.set(
        [(Math.random() - 0.5) * 40, Math.random() * 8, (Math.random() - 0.5) * 40],
        i * 3,
      );
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xffd9a0,
        size: 0.07,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  setSky(zenith: THREE.Color, horizon: THREE.Color, sunColor: THREE.Color, sunDir: THREE.Vector3) {
    this.skyUniforms.zenith.value.copy(zenith);
    this.skyUniforms.horizon.value.copy(horizon);
    this.skyUniforms.sunColor.value.copy(sunColor);
    this.skyUniforms.sunDir.value.copy(sunDir);
  }

  /** Places sun and moon discs; elevation is in the direction vectors. */
  setBodies(
    camera: THREE.Camera,
    sunDir: THREE.Vector3,
    sunVisible: number,
    moonDir: THREE.Vector3,
    moonPhase: number,
    moonVisible: number,
  ) {
    const center = camera.position;
    this.sun.position.copy(center).addScaledVector(sunDir, 380);
    this.sun.lookAt(center);
    (this.sun.material as THREE.MeshBasicMaterial).opacity = sunVisible;
    this.sun.visible = sunVisible > 0.01;
    const phaseKey = Math.round(moonPhase * 40) / 40;
    if (phaseKey !== this.moonPhaseShown) {
      const mat = this.moon.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.map = moonTexture(phaseKey);
      mat.needsUpdate = true;
      this.moonPhaseShown = phaseKey;
    }
    this.moon.position.copy(center).addScaledVector(moonDir, 380);
    this.moon.lookAt(center);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = moonVisible;
    this.moon.visible = moonVisible > 0.01;
  }

  update(dt: number, time: number, camera: THREE.Camera, w: WeatherLevels) {
    const c = camera.position;
    this.sky.position.copy(c);
    this.stars.position.copy(c);
    (this.stars.material as THREE.PointsMaterial).opacity = w.night * (1 - w.clouds * 0.9);
    this.stars.visible = w.night > 0.05;
    this.frame++;

    // Clouds: lit by the sky (bright by day, grey in overcast, dark blue at night).
    const cloudColor = (this.clouds.material as THREE.MeshBasicMaterial).color;
    cloudColor
      .copy(this.skyUniforms.horizon.value)
      .lerp(this.white, 0.55 * (1 - w.night))
      .multiplyScalar(1 - w.clouds * 0.35);
    // Show the first clusters by coverage, drift with the wind, wrap around.
    const shown = Math.round(this.cloudCenters.length * Math.min(1, 0.08 + w.clouds));
    this.cloudOffset.x += w.windX * dt * 1.5;
    this.cloudOffset.y += w.windZ * dt * 1.5;
    if (this.frame % 2 === 0 || this.clouds.count === 0) {
      const count = shown > 0 ? this.clusterEnd[shown - 1]! : 0;
      const fat = 1 + w.clouds * 0.8;
      for (let i = 0; i < count; i++) {
        const b = this.cloudBlocks[i]!;
        const center = this.cloudCenters[b.cluster]!;
        const x = ((((center.x + this.cloudOffset.x - c.x + 350) % 700) + 700) % 700) - 350 + c.x;
        const z = ((((center.z + this.cloudOffset.y - c.z + 350) % 700) + 700) % 700) - 350 + c.z;
        this.m.compose(
          this.v.set(x + b.dx * fat, center.y - w.clouds * 12 + b.dy, z + b.dz * fat),
          this.q,
          this.s.set(b.sx * fat, b.sy, b.sz * fat),
        );
        this.clouds.setMatrixAt(i, this.m);
      }
      this.clouds.count = count;
      this.clouds.instanceMatrix.needsUpdate = true;
    }

    // Rain: falls fast, slanted by the wind; at night it is lit warm by the floodlights.
    this.rain.visible = w.rain > 0.02;
    if (this.rain.visible) {
      const n = Math.round(this.rainCount * Math.min(1, w.rain));
      this.rain.geometry.setDrawRange(0, n * 2);
      const fall = 17 * dt;
      const sx = w.windX * 0.05;
      const sz = w.windZ * 0.05;
      const p = this.rainPos;
      for (let i = 0; i < n; i++) {
        const k = i * 6;
        let y = p[k + 1]! - fall;
        let x = p[k]! + w.windX * dt * 0.6;
        let z = p[k + 2]! + w.windZ * dt * 0.6;
        if (y < -1) {
          y += 30;
          x = (Math.random() - 0.5) * 50;
          z = (Math.random() - 0.5) * 50;
        }
        if (x > 25) x -= 50;
        else if (x < -25) x += 50;
        if (z > 25) z -= 50;
        else if (z < -25) z += 50;
        p[k] = x;
        p[k + 1] = y;
        p[k + 2] = z;
        p[k + 3] = x - sx;
        p[k + 4] = y + 0.75;
        p[k + 5] = z - sz;
      }
      this.rain.geometry.attributes.position!.needsUpdate = true;
      this.rain.position.set(c.x, 0, c.z);
      this.rainMat.color.setHex(w.night > 0.5 ? 0xffe2b0 : 0xaebccc);
      this.rainMat.opacity = 0.3 + 0.3 * w.night + 0.15 * w.rain;
    }

    this.snow.visible = w.snow > 0.02;
    if (this.snow.visible) {
      const n = Math.round(this.snowCount * Math.min(1, w.snow));
      this.snow.geometry.setDrawRange(0, n);
      const p = this.snowPos;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        let y = p[k + 1]! - (1.1 + (i % 5) * 0.12) * dt;
        let x = p[k]! + (w.windX * 0.25 + Math.sin(time * 0.8 + i) * 0.4) * dt;
        let z = p[k + 2]! + (w.windZ * 0.25 + Math.cos(time * 0.7 + i) * 0.4) * dt;
        if (y < 0) y += 25;
        if (x > 25) x -= 50;
        else if (x < -25) x += 50;
        if (z > 25) z -= 50;
        else if (z < -25) z += 50;
        p[k] = x;
        p[k + 1] = y;
        p[k + 2] = z;
      }
      this.snow.geometry.attributes.position!.needsUpdate = true;
      this.snow.position.set(c.x, 0, c.z);
    }

    this.dust.visible = w.dust > 0.05;
    if (this.dust.visible) {
      (this.dust.material as THREE.PointsMaterial).opacity = 0.55 * w.dust;
      const p = this.dustPos;
      for (let i = 0; i < p.length; i += 3) {
        p[i] = p[i]! + (Math.sin(time * 0.3 + i) * 0.15 + w.windX * 0.05) * dt;
        p[i + 1] = p[i + 1]! + Math.cos(time * 0.4 + i) * 0.05 * dt;
        p[i + 2] = p[i + 2]! + w.windZ * 0.05 * dt;
        if (p[i]! > 20) p[i]! -= 40;
        else if (p[i]! < -20) p[i]! += 40;
        if (p[i + 2]! > 20) p[i + 2]! -= 40;
        else if (p[i + 2]! < -20) p[i + 2]! += 40;
      }
      this.dust.geometry.attributes.position!.needsUpdate = true;
      this.dust.position.set(c.x, 0, c.z);
    }
  }
}
