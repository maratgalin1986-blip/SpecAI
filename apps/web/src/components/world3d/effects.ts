// Look and show of the 3D city (owner, 2026-11-10: «поправь графику … кругом
// должно быть шоу и эффекты»): the evening sky, window lights, soft contact
// shadows, wet asphalt, lamp posts, flashing beacons, headlights, smoke and
// dust, welding sparks, pulsing «на линии» rings and sweeping searchlights.
// Everything is drawn from code (canvas gradients and a few shaders): no
// texture files, no extra dependency, a handful of draw calls.
import * as THREE from 'three';

// ---------------------------------------------------------------- textures

function canvasTexture(
  size: number,
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
  srgb = true,
) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d')!, size);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A soft round fade: white in the middle, transparent at the edge. */
export function glowTexture() {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** A thin bright ring that fades outwards (the pulse under a machine on the line). */
function ringTexture() {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    g.addColorStop(0.82, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Grass: fine mottling in many greens, tiled. */
function grassTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#8aa863';
    ctx.fillRect(0, 0, s, s);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 2600; i++) {
      const light = 40 + rnd() * 26;
      ctx.fillStyle = `hsla(${78 + rnd() * 26},${32 + rnd() * 22}%,${light}%,${0.1 + rnd() * 0.22})`;
      const r = 1 + rnd() * 5;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Wet asphalt: speckle for the colour, puddly variation for the roughness. */
export function asphaltTextures() {
  const map = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(0, 0, s, s);
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 3200; i++) {
      const v = 40 + rnd() * 50;
      ctx.fillStyle = `rgba(${v},${v + 2},${v + 8},${0.12 + rnd() * 0.25})`;
      ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  });
  const rough = canvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(0, 0, s, s);
      let seed = 17;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      // Wet patches: dark (low roughness) blobs.
      for (let i = 0; i < 14; i++) {
        const x = rnd() * s;
        const y = rnd() * s;
        const r = 18 + rnd() * 46;
        for (const dx of [-s, 0, s])
          for (const dy of [-s, 0, s]) {
            const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
            g.addColorStop(0, 'rgba(20,20,20,0.85)');
            g.addColorStop(1, 'rgba(20,20,20,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
          }
      }
    },
    false,
  );
  for (const t of [map, rough]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  return { map, rough };
}

/** The site's ground: trodden earth with damp patches, stones and the ruts of tyres. */
export function dirtTexture() {
  const t = canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#8a6239';
    ctx.fillRect(0, 0, s, s);
    let seed = 29;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    // Damp and dry patches, wrapped round the edges so the tile repeats cleanly.
    for (let i = 0; i < 60; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 24 + rnd() * 80;
      const dark = rnd() < 0.6;
      for (const dx of [-s, 0, s])
        for (const dy of [-s, 0, s]) {
          const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          g.addColorStop(0, dark ? 'rgba(52,33,18,0.5)' : 'rgba(190,148,96,0.42)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
    }
    // Ruts: pairs of dark tracks with a pale ridge pressed up beside each.
    for (const [y, bend] of [
      [120, 26],
      [156, 26],
      [352, -34],
      [388, -34],
    ] as const) {
      for (const [dy, style, width] of [
        [0, 'rgba(40,26,15,0.55)', 13],
        [9, 'rgba(196,156,104,0.4)', 4],
      ] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(0, y + dy);
        ctx.bezierCurveTo(s * 0.3, y + dy + bend, s * 0.7, y + dy - bend, s, y + dy);
        ctx.stroke();
      }
    }
    // Grit and stones.
    for (let i = 0; i < 5200; i++) {
      const v = 50 + rnd() * 110;
      ctx.fillStyle = `rgba(${v + 34},${v + 4},${v - 28},${0.14 + rnd() * 0.3})`;
      ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2.4, 1 + rnd() * 2.4);
    }
    for (let i = 0; i < 130; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const r = 1.6 + rnd() * 3;
      ctx.fillStyle = 'rgba(40,28,18,0.5)';
      ctx.beginPath();
      ctx.ellipse(x + 1, y + 1.4, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      const grey = 150 + rnd() * 60;
      ctx.fillStyle = `rgba(${grey + 12},${grey},${grey - 16},0.9)`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Profiled steel sheet of the site fence: vertical ribs, a kick board and a top rail. */
export function fenceTexture() {
  const t = canvasTexture(64, (ctx, s) => {
    for (let x = 0; x < s; x++) {
      const k = 0.5 + 0.5 * Math.sin((x / s) * Math.PI * 8);
      const v = 120 + k * 110;
      ctx.fillStyle = `rgb(${Math.round(v * 0.3)},${Math.round(v * 0.42)},${Math.round(v * 0.6)})`;
      ctx.fillRect(x, 0, 1, s);
    }
    ctx.fillStyle = '#ffcf5a';
    ctx.fillRect(0, 0, s, 5);
    ctx.fillStyle = 'rgba(30,30,30,0.55)';
    ctx.fillRect(0, s - 6, s, 6);
  });
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- film grade

/**
 * The film look, for free: three.js tone-maps every pixel in the material's own
 * shader, so the grade rides there instead of in a full-screen pass (which a
 * phone would pay for on every frame). ACES, then a soft S-curve, a little more
 * colour, teal in the shadows and warmth in the highlights.
 */
const GRADE = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
	color = ACESFilmicToneMapping( color );
	float w3dLuma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = mix( vec3( w3dLuma ), color, 1.14 );
	color = mix( color, color * color * ( 3.0 - 2.0 * color ), 0.34 );
	color += ( 1.0 - smoothstep( 0.0, 0.42, w3dLuma ) ) * vec3( -0.014, 0.004, 0.022 );
	color *= mix( vec3( 1.0 ), vec3( 1.05, 1.0, 0.92 ), smoothstep( 0.35, 1.0, w3dLuma ) );
	return clamp( color, 0.0, 1.0 );
}`;

/** Installs the grade as three.js' custom tone mapping (once; only this scene uses three.js). */
export function installFilmGrade(renderer: THREE.WebGLRenderer) {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (chunk.includes(stub))
    THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(stub, GRADE);
  renderer.toneMapping = THREE.ShaderChunk.tonemapping_pars_fragment.includes('w3dLuma')
    ? THREE.CustomToneMapping
    : THREE.ACESFilmicToneMapping;
}

export function makeGrassMaterial() {
  const map = grassTexture();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(36, 36);
  map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
}

// ---------------------------------------------------------------- sky

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 sunDir;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    // Evening: deep blue overhead, peach and gold at the horizon.
    vec3 zenith = vec3(0.045, 0.14, 0.40);
    vec3 mid = vec3(0.20, 0.38, 0.66);
    vec3 horizon = vec3(1.0, 0.62, 0.34);
    vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
    c = mix(c, zenith, smoothstep(0.22, 0.95, h));
    float s = max(dot(d, sunDir), 0.0);
    c += vec3(1.0, 0.45, 0.16) * pow(s, 5.0) * 0.55;
    c += vec3(1.0, 0.8, 0.5) * pow(s, 60.0) * 0.9;
    c += vec3(1.0, 0.95, 0.8) * pow(s, 900.0) * 6.0;
    // Streaky evening clouds, lit from below by the sun.
    vec2 cp = d.xz / (d.y + 0.32) * 1.7;
    float cl = vnoise(cp * 1.3) * 0.6 + vnoise(cp * 3.1 + 7.0) * 0.4;
    cl = smoothstep(0.52, 0.86, cl) * smoothstep(0.02, 0.22, h) * (1.0 - smoothstep(0.55, 0.9, h));
    vec3 cloud = mix(vec3(1.0, 0.55, 0.32), vec3(0.95, 0.72, 0.7), h * 1.5) * (0.55 + 0.7 * s);
    c = mix(c, cloud, cl * 0.7);
    // Below the horizon (seen only from the PMREM pass): ground bounce.
    c = mix(c, vec3(0.20, 0.17, 0.13), smoothstep(0.0, -0.3, d.y));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function skyMaterial(sun: THREE.Vector3) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: sun.clone().normalize() } },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
  });
}

// ---------------------------------------------------------------- windows

/**
 * Windows drawn in the shader: dark glass in a grid on the walls, a share of
 * them lit warm (it is evening). Works on the instanced blocks of any size and
 * costs no texture.
 */
export function lightWindows(material: THREE.MeshStandardMaterial, lit = 0.45) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWinPos;\nvarying vec3 vWinN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 winW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          winW = instanceMatrix * winW;
        #endif
        vWinPos = (modelMatrix * winW).xyz;
        vWinN = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWinPos;
        varying vec3 vWinN;
        float winHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float wall = step(abs(vWinN.y), 0.5);
        float along = abs(vWinN.x) > 0.5 ? vWinPos.z : vWinPos.x;
        vec2 cell = vec2(along / 1.9, vWinPos.y / 2.5);
        vec2 id = floor(cell);
        vec2 f = fract(cell);
        float pane = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.78) * wall * step(1.4, vWinPos.y);
        float on = step(1.0 - ${lit.toFixed(2)}, winHash(id + floor(vWinPos.xz * 0.37)));
        vec3 glass = vec3(0.07, 0.11, 0.17);
        // Floor slabs as thin bands, a plinth, and shade gathering towards the ground.
        float band = (1.0 - step(0.06, f.y)) * wall;
        diffuseColor.rgb *= 1.0 - band * 0.22;
        diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 5.0, vWinPos.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.2, 0.22), (1.0 - step(1.1, vWinPos.y)) * wall * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, pane * 0.85);
        totalEmissiveRadiance += pane * on * vec3(1.0, 0.66, 0.30) * (0.7 + 0.6 * winHash(id * 3.7));`,
      );
  };
  material.customProgramCacheKey = () => `windows2-${lit}`;
  return material;
}

// ---------------------------------------------------------------- contact shadows

let blobTex: THREE.Texture | null = null;
/** Soft dark blob shadow texture, shared. */
export function blobTexture() {
  if (!blobTex) {
    blobTex = canvasTexture(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.9)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
  }
  return blobTex;
}

export function resetBlobTexture() {
  blobTex = null;
}

/** A flat soft shadow under an object: grounds it on any device, shadow maps or not. */
export function blobShadow(w: number, d: number, opacity: number, y = 0.06) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({
      map: blobTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      fog: true,
      color: 0x120c08,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = 1;
  return mesh;
}

// ---------------------------------------------------------------- sprites (smoke, glows, sparks)

const SPRITE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(0.5, -mv.z), 0.0, 96.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPRITE_FRAGMENT = /* glsl */ `
  varying vec4 vColor;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r = length(q) * 2.0;
    float a = smoothstep(1.0, 0.0, r);
    a *= a;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
    if (gl_FragColor.a < 0.004) discard;
  }
`;

/**
 * A fixed pool of soft round particles drawn as one Points object: per-particle
 * size, colour and opacity, normal or additive blending.
 */
export class Sprites {
  readonly points: THREE.Points;
  private position: Float32Array;
  private size: Float32Array;
  private color: Float32Array;
  private material: THREE.ShaderMaterial;
  constructor(
    readonly count: number,
    additive: boolean,
  ) {
    this.position = new Float32Array(count * 3).fill(-999);
    this.size = new Float32Array(count);
    this.color = new Float32Array(count * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute(
      'aColor',
      new THREE.BufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage),
    );
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: SPRITE_VERTEX,
      fragmentShader: SPRITE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }
  /** Pixels per world unit at distance 1 (viewport height / (2 tan(fov / 2))). */
  setScale(pixelsPerUnit: number) {
    this.material.uniforms.uScale!.value = pixelsPerUnit;
  }
  set(
    i: number,
    x: number,
    y: number,
    z: number,
    size: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) {
    const p = i * 3;
    this.position[p] = x;
    this.position[p + 1] = y;
    this.position[p + 2] = z;
    this.size[i] = size;
    const c = i * 4;
    this.color[c] = r;
    this.color[c + 1] = g;
    this.color[c + 2] = b;
    this.color[c + 3] = a;
  }
  hide(i: number) {
    this.color[i * 4 + 3] = 0;
    this.position[i * 3 + 1] = -999;
  }
  commit() {
    const a = this.points.geometry.attributes;
    a.position!.needsUpdate = true;
    a.aSize!.needsUpdate = true;
    a.aColor!.needsUpdate = true;
  }
  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/** Rising smoke and dust puffs: they grow, drift and fade. */
export class Smoke {
  readonly sprites: Sprites;
  private life: Float32Array;
  private age: Float32Array;
  private vel: Float32Array;
  private base: Float32Array;
  private tint: Float32Array;
  private next = 0;
  constructor(count: number) {
    this.sprites = new Sprites(count, false);
    this.life = new Float32Array(count);
    this.age = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.base = new Float32Array(count * 2);
    this.tint = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) this.sprites.hide(i);
  }
  emit(
    x: number,
    y: number,
    z: number,
    o: {
      rise: number;
      drift: [number, number];
      size: number;
      life: number;
      color: [number, number, number];
      alpha: number;
    },
  ) {
    const k = this.next;
    this.next = (this.next + 1) % this.life.length;
    this.life[k] = o.life * (0.8 + Math.random() * 0.4);
    this.age[k] = 0;
    this.sprites.set(k, x, y, z, 0, ...o.color, 0);
    this.vel[k * 3] = o.drift[0] + (Math.random() - 0.5) * 0.35;
    this.vel[k * 3 + 1] = o.rise * (0.8 + Math.random() * 0.4);
    this.vel[k * 3 + 2] = o.drift[1] + (Math.random() - 0.5) * 0.35;
    this.base[k * 2] = o.size;
    this.base[k * 2 + 1] = o.alpha;
    this.tint[k * 4] = o.color[0];
    this.tint[k * 4 + 1] = o.color[1];
    this.tint[k * 4 + 2] = o.color[2];
  }
  update(dt: number) {
    const pos = this.sprites.points.geometry.attributes.position!.array as Float32Array;
    for (let k = 0; k < this.life.length; k++) {
      if (this.life[k]! <= 0) continue;
      this.age[k]! += dt;
      const t = this.age[k]! / this.life[k]!;
      if (t >= 1) {
        this.life[k] = 0;
        this.sprites.hide(k);
        continue;
      }
      const x = pos[k * 3]! + this.vel[k * 3]! * dt;
      const y = pos[k * 3 + 1]! + this.vel[k * 3 + 1]! * dt;
      const z = pos[k * 3 + 2]! + this.vel[k * 3 + 2]! * dt;
      this.vel[k * 3 + 1]! *= 1 - 0.25 * dt;
      // Quick fade in, long fade out; the puff swells as it rises.
      const fade = Math.min(1, t * 8) * (1 - t) * (1 - t);
      this.sprites.set(
        k,
        x,
        y,
        z,
        this.base[k * 2]! * (0.5 + t * 2.4),
        this.tint[k * 4]!,
        this.tint[k * 4 + 1]!,
        this.tint[k * 4 + 2]!,
        this.base[k * 2 + 1]! * fade,
      );
    }
    this.sprites.commit();
  }
}

/** Welding sparks: a burst of hot points that fall and cool. */
export class Sparks {
  readonly sprites: Sprites;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  constructor(count: number) {
    this.sprites = new Sprites(count, true);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    for (let i = 0; i < count; i++) this.sprites.hide(i);
  }
  burst(x: number, y: number, z: number, n: number) {
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % this.life.length;
      this.life[k] = 0.5 + Math.random() * 0.6;
      this.vel[k * 3] = (Math.random() - 0.5) * 3.2;
      this.vel[k * 3 + 1] = 1 + Math.random() * 2.6;
      this.vel[k * 3 + 2] = (Math.random() - 0.5) * 3.2;
      this.sprites.set(k, x, y, z, 0.16, 1, 0.78, 0.4, 1);
    }
  }
  update(dt: number) {
    const pos = this.sprites.points.geometry.attributes.position!.array as Float32Array;
    for (let k = 0; k < this.life.length; k++) {
      if (this.life[k]! <= 0) continue;
      this.life[k]! -= dt;
      if (this.life[k]! <= 0) {
        this.sprites.hide(k);
        continue;
      }
      this.vel[k * 3 + 1]! -= 9 * dt;
      const y = Math.max(0.05, pos[k * 3 + 1]! + this.vel[k * 3 + 1]! * dt);
      this.sprites.set(
        k,
        pos[k * 3]! + this.vel[k * 3]! * dt,
        y,
        pos[k * 3 + 2]! + this.vel[k * 3 + 2]! * dt,
        0.2,
        1,
        0.55 + this.life[k]! * 0.4,
        0.2,
        Math.min(1, this.life[k]! * 2.4),
      );
    }
    this.sprites.commit();
  }
}

// ---------------------------------------------------------------- rings and beams

/** «На линии»: green rings pulsing out from under each machine (one draw call). */
export class PulseRings {
  readonly mesh: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  private col = new THREE.Color();
  constructor(readonly count: number) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: ringTexture(),
        color: 0x34d399,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
      count,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) this.setRing(i, 0, 0, 0, 0);
  }
  /** phase 0..1 (looping), size is the full width of the ring at phase 1. */
  setRing(i: number, x: number, z: number, size: number, phase: number) {
    const s = size * (0.35 + phase * 0.65);
    this.m4.compose(new THREE.Vector3(x, 0.09, z), this.q, new THREE.Vector3(s, s, s));
    this.mesh.setMatrixAt(i, this.m4);
    const k = Math.sin(Math.PI * Math.min(1, phase)) ** 1.3 * 0.9;
    this.mesh.setColorAt(i, this.col.setRGB(k, k, k));
  }
  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

function beamTexture() {
  return canvasTexture(
    64,
    (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, 0, s);
      // v = 0 is the far end of the beam, v = 1 the lamp.
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0.8)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    },
    false,
  );
}

/** A searchlight beam: a translucent cone from the lamp up into the evening sky. */
export function makeBeam(color: number, length = 46, radius = 3.4) {
  const geo = new THREE.CylinderGeometry(radius, 0.12, length, 20, 1, true).translate(
    0,
    length / 2,
    0,
  );
  const mat = new THREE.MeshBasicMaterial({
    map: beamTexture(),
    color,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 7;
  mesh.frustumCulled = false;
  return mesh;
}

/** A forward pool of headlight on the road, lying flat in front of a vehicle. */
export function makeLightPool(color: number, w: number, d: number, opacity: number) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  return mesh;
}

/** Frees every texture and material of an object tree built with the helpers above. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.Points).isPoints) return;
    const mat = mesh.material as THREE.Material | THREE.Material[];
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      const map = (m as THREE.MeshBasicMaterial).map;
      map?.dispose();
    }
  });
}
