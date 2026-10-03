// The film look of /stroyka: sky reflections for the PBR materials and a
// post-processing chain (MSAA, a soft bloom on lamps and beacons, a warm
// film grade with vignette and grain). Phones skip the bloom and the grade
// and render straight to the screen; the reflections are cheap and stay.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const ENV_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// The same gradient as the visible sky (atmosphere.ts), for reflections.
const ENV_FRAGMENT = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float glow;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(horizon, zenith, pow(h, 0.5));
  if (d.y < 0.0) col = mix(horizon * 0.55, vec3(0.32, 0.27, 0.22), clamp(-d.y * 3.0, 0.0, 1.0));
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(s, 8.0) * 0.6 + pow(s, 200.0) * 6.0) * glow;
  gl_FragColor = vec4(col, 1.0);
}`;

/** Film grade: gentle S-curve, warm highlights and cool shadows, vignette, grain. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    vignette: { value: 0.38 },
    grain: { value: 0.035 },
    // The sun on screen (0…1) and the flare strength; aspect for round shapes.
    sunPos: { value: new THREE.Vector2(0.5, 0.5) },
    flare: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignette;
    uniform float grain;
    uniform vec2 sunPos;
    uniform float flare;
    uniform float aspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // Teal-and-orange split toning, kept subtle.
      col = mix(col, col * vec3(0.94, 1.0, 1.07), (1.0 - smoothstep(0.0, 0.5, l)) * 0.35);
      col = mix(col, col * vec3(1.06, 1.0, 0.92), smoothstep(0.4, 1.2, l) * 0.35);
      // Vignette.
      vec2 q = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.25, 0.85, length(q * vec2(1.1, 1.0)));
      // Film grain, stronger in the shadows.
      float g = hash(vUv * 1000.0 + fract(time) * 31.0) - 0.5;
      col += g * grain * (1.2 - l);
      // Lens flare: a soft glow round the sun and ghosts along the lens axis.
      if (flare > 0.001) {
        vec2 asp = vec2(aspect, 1.0);
        float d = length((vUv - sunPos) * asp);
        col += vec3(1.0, 0.85, 0.6) * flare * (0.35 * exp(-d * 6.0) + 0.12 * exp(-d * 1.6));
        vec2 axis = vec2(0.5) - sunPos;
        for (int i = 1; i <= 4; i++) {
          float f = float(i);
          vec2 ghost = sunPos + axis * (0.45 * f);
          float g = length((vUv - ghost) * asp);
          float size = 0.03 + 0.025 * f;
          vec3 tint = i == 2 ? vec3(0.5, 0.8, 1.0) : vec3(1.0, 0.7, 0.4);
          col += tint * flare * 0.08 * smoothstep(size, size * 0.4, g);
        }
      }
      gl_FragColor = vec4(col, c.a);
    }`,
};

export class Cinema {
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envAt = -99;
  private envKey = '';
  private skyUniforms: Record<string, THREE.IUniform>;
  private skyKey() {
    const u = this.skyUniforms;
    const c = (v: THREE.Color) =>
      `${Math.round(v.r * 20)},${Math.round(v.g * 20)},${Math.round(v.b * 20)}`;
    const d = u.sunDir!.value as THREE.Vector3;
    return `${c(u.zenith!.value)}|${c(u.horizon!.value)}|${Math.round(d.x * 10)},${Math.round(d.y * 10)},${Math.round(d.z * 10)}|${Math.round((u.glow!.value as number) * 10)}`;
  }
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    skyUniforms: Record<string, THREE.IUniform>,
    private full: boolean,
  ) {
    // Soft shadows cost a lot on phones: plain PCF there.
    this.renderer.shadowMap.type = full ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMappingExposure = 1.05;
    this.skyUniforms = skyUniforms;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: ENV_VERTEX,
        fragmentShader: ENV_FRAGMENT,
        uniforms: skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.envScene.add(sphere);
    if (!full) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  /** Re-captures the sky for reflections every few seconds (sky changes slowly). */
  updateEnvironment(time: number, force = false) {
    if (!force && time - this.envAt < 4) return;
    // Re-captured only when the sky visibly changed (or every 60 s): a PMREM
    // pass is 6 renders plus blur, too much to repeat for nothing on a phone.
    const key = this.skyKey();
    if (!force && key === this.envKey && time - this.envAt < 60) return;
    this.envKey = key;
    this.envAt = time;
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.9;
    old?.dispose();
  }

  render(time: number) {
    if (!this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.grade!.uniforms.time!.value = time;
    this.composer.render();
  }

  /** Sun position in the frame and how strong its flare is (0 hides it). */
  setSun(x: number, y: number, strength: number, aspect: number) {
    if (!this.grade) return;
    this.grade.uniforms.sunPos!.value.set(x, y);
    this.grade.uniforms.flare!.value = strength;
    this.grade.uniforms.aspect!.value = aspect;
  }

  /** The opening shot: deeper vignette, more contrast and grain (k 0…1). */
  setIntro(k: number) {
    if (!this.grade) return;
    this.grade.uniforms.vignette!.value = 0.38 + 0.25 * k;
    this.grade.uniforms.grain!.value = 0.035 + 0.025 * k;
  }

  /** Night needs a stronger bloom on floodlights, day a faint one. */
  setNight(k: number) {
    if (this.bloom) this.bloom.strength = 0.25 + 0.55 * k;
  }

  resize(w: number, h: number, pixelRatio: number) {
    if (!this.composer) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  dispose() {
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.bloom?.dispose();
    this.composer?.renderTarget1.dispose();
    this.composer?.renderTarget2.dispose();
    this.composer?.dispose();
    this.envScene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
