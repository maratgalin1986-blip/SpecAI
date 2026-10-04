// The film look of /stroyka: sky reflections for the PBR materials and a
// post-processing chain — ambient occlusion in corners and under machines
// (GTAO, half resolution), MSAA, a soft bloom on lamps and beacons, and a
// film grade (filmic contrast, split toning, lens fringing, vignette, grain).
// Phones keep only the grade: one cheap full-screen pass, no AO or bloom.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SKY_PHOTO_GLSL } from './atmosphere';

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
${SKY_PHOTO_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(horizon, zenith, pow(h, 0.5));
  col = skyPhoto(d, col);
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
    // Lens fringing at the frame edges (0 on phones).
    fringe: { value: 0 },
    // Light shafts from the sun through cranes, dust and rain (computers).
    rays: { value: 0 },
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
    uniform float fringe;
    uniform float rays;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      // Lens fringing: red and blue slightly apart, only towards the corners
      // (none in the middle third of the frame).
      if (fringe > 0.0) {
        vec2 q0 = vUv - 0.5;
        float r2 = dot(q0, q0);
        vec2 off = q0 * fringe * r2 * 4.0 * smoothstep(0.03, 0.2, r2);
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.b = texture2D(tDiffuse, vUv - off).b;
      }
      // God rays: march toward the sun and gather the bright sky behind the
      // cranes and the frame, so its light streams around them.
      if (rays > 0.001 && flare > 0.001) {
        vec2 stepUv = (sunPos - vUv) / 24.0;
        vec2 uv = vUv;
        float decay = 1.0;
        vec3 shaft = vec3(0.0);
        for (int i = 0; i < 24; i++) {
          uv += stepUv;
          vec3 s = texture2D(tDiffuse, uv).rgb;
          shaft += max(s - 0.72, 0.0) * decay;
          decay *= 0.93;
        }
        col += shaft * vec3(1.0, 0.86, 0.62) * rays * flare * 0.22;
      }
      // Filmic contrast on a compressed copy (x / (1 + x)), so the HDR
      // highlights survive into the tone mapping instead of clipping at 1.
      col = max(col, 0.0);
      vec3 x = col / (1.0 + col);
      x = mix(x, x * x * (3.0 - 2.0 * x), 0.3);
      col = x / max(1.0 - x, 0.002);
      float l = dot(x, vec3(0.2126, 0.7152, 0.0722)) * 2.0;
      col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 1.08);
      // Teal-and-orange split toning, kept subtle.
      col = mix(col, col * vec3(0.94, 1.0, 1.07), (1.0 - smoothstep(0.0, 0.5, l)) * 0.35);
      col = mix(col, col * vec3(1.06, 1.0, 0.92), smoothstep(0.4, 1.2, l) * 0.35);
      // Vignette.
      vec2 q = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.25, 0.85, length(q * vec2(1.1, 1.0)));
      // Film grain: per pixel (fine, not blotchy), multiplicative so it sits
      // in the image, strongest in the mid-shadows and nearly gone in the
      // bright sky and highlights.
      float g = hash(gl_FragCoord.xy + fract(time * 7.0) * 113.0) +
        hash(gl_FragCoord.xy * 1.37 + fract(time * 5.0) * 71.0) - 1.0;
      float grainW = (1.0 - smoothstep(0.15, 0.85, l)) * (0.35 + 0.65 * smoothstep(0.0, 0.12, l));
      col *= 1.0 + g * grain * 2.2 * grainW;
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
          col += tint * flare * 0.08 * (1.0 - smoothstep(size * 0.4, size, g));
        }
      }
      gl_FragColor = vec4(col, c.a);
    }`,
};

/** Lens fringing strength on computers. */
const FRINGE = 0.002;

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
    const photo = `${Math.round((u.photoAmount!.value as number) * 10)}:${Math.round((u.photoMix!.value as number) * 4)}:${(u.photoA!.value as THREE.Texture).id}`;
    return `${c(u.zenith!.value)}|${c(u.horizon!.value)}|${Math.round(d.x * 10)},${Math.round(d.y * 10)},${Math.round(d.z * 10)}|${Math.round((u.glow!.value as number) * 10)}|${photo}`;
  }
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private gtao: GTAOPass | null = null;

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
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: full ? 4 : 0,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    if (full) {
      // Contact shadows where walls meet the ground and under the machines;
      // at half resolution, it is the most expensive pass.
      const gtao = new GTAOPass(scene, camera, size.x / 2, size.y / 2);
      const setSize = gtao.setSize.bind(gtao);
      gtao.setSize = (w: number, h: number) => setSize(Math.ceil(w / 2), Math.ceil(h / 2));
      gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 1.5, samples: 12 });
      gtao.updatePdMaterial({ radius: 6, samples: 12, rings: 2 });
      gtao.blendIntensity = 0.85;
      this.gtao = gtao;
      this.composer.addPass(gtao);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.5, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.fringe!.value = full ? FRINGE : 0;
    this.grade.uniforms.rays!.value = full ? 1 : 0;
    // Phones: a lighter grain, the screen is small.
    if (!full) this.grade.uniforms.grain!.value = 0.025;
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  /** Debug (window.__stroyka.fx): the AO and the lens effects on or off. */
  setFx(on: boolean) {
    if (this.gtao) this.gtao.enabled = on;
    if (this.grade) {
      this.grade.uniforms.fringe!.value = on && this.full ? FRINGE : 0;
      this.grade.uniforms.rays!.value = on && this.full ? 1 : 0;
    }
  }

  /** The machine is too slow: drop the ambient occlusion. False if already off. */
  lowerQuality() {
    if (this.gtao?.enabled) {
      this.gtao.enabled = false;
      return true;
    }
    if (this.grade && (this.grade.uniforms.rays!.value as number) > 0) {
      this.grade.uniforms.rays!.value = 0;
      return true;
    }
    return false;
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
    this.grade!.uniforms.time!.value = time;
    this.composer!.render();
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
    const grain = this.full ? 0.035 : 0.025;
    this.grade.uniforms.vignette!.value = 0.38 + 0.25 * k;
    this.grade.uniforms.grain!.value = grain + 0.025 * k;
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
    this.gtao?.dispose();
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
