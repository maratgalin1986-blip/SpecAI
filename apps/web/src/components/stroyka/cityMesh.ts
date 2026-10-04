// The real city of Набережные Челны around the site, in blocks: OSM building
// footprints extruded by their levels, roads with lane dashes, parks, water
// and construction areas (shown neutrally, never as our projects).
// Data © участники OpenStreetMap (ODbL).
import * as THREE from 'three';
import { centroid, footprintRuns, points, type CityData, type Pt } from '@/lib/stroyka/city';
import { PLAIN_BOX, Voxels } from './kit';
import { onOuterPlot } from '@/lib/stroyka/plots';

// Facade tints of a Soviet and post-Soviet city: grey and cream panels,
// sand-yellow plaster, red and buff brick, blue-grey and green-grey panels.
const FACADES = [
  0xcfc8bd, 0xd9d2c3, 0xbfc5cc, 0xe0d6c4, 0xb9b2a6, 0xc8bba8, 0xa9b4bf, 0xd8c08e, 0xb0745a,
  0xc49a74, 0x9fb0bd, 0xa7b29b, 0xe2cfa8, 0x8f9aa6,
];
/** Roof units, lift rooms and parapets: grey metal and dark concrete. */
const ROOF_PARTS = [0x6b7078, 0x5a5f66, 0x7d8189, 0x4b5057];
const ROAD_WIDTH = [4, 7, 10, 14];
const AREA_COLOR: Record<string, number> = {
  park: 0x4f7a34,
  pitch: 0x3f8a3a,
  forest: 0x355e2a,
  water: 0x3b6e99,
  construction: 0xb59a6a,
};

const SITE = { x: 72, zMin: -76, zMax: 84 };

/**
 * Real-looking facades for the city blocks, drawn in the shader from the
 * world position (no textures): floors of 3 m with windows, glass that
 * reflects the sky by day, a random share of windows lit at night, darker
 * flat roofs, a plinth. `uniforms.cityNight` is set by the engine.
 */
export function facadeMaterial() {
  const uniforms = { cityNight: { value: 0 }, cityShare: { value: 0.38 } };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cityNight = uniforms.cityNight;
    shader.uniforms.cityShare = uniforms.cityShare;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCityPos;\nvarying vec3 vCityNormal;',
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        mat4 cityM = modelMatrix;
        #ifdef USE_INSTANCING
          cityM = modelMatrix * instanceMatrix;
        #endif
        vCityPos = (cityM * vec4(transformed, 1.0)).xyz;
        vCityNormal = normalize(mat3(cityM) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCityPos;
        varying vec3 vCityNormal;
        uniform float cityNight;
        uniform float cityShare;
        float cityHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float cityWin;
        float cityLit;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        cityWin = 0.0;
        cityLit = 0.0;
        vec3 cn = normalize(vCityNormal);
        if (cn.y > 0.6) {
          // Flat roofs: dark bitumen and gravel, a little cool.
          diffuseColor.rgb = diffuseColor.rgb * vec3(0.3, 0.31, 0.33) + vec3(0.02);
        } else if (abs(cn.y) < 0.4) {
          vec2 tan2 = normalize(vec2(-cn.z, cn.x));
          float u = dot(vCityPos.xz, tan2) / 1.7;
          float v = vCityPos.y / 3.0;
          vec2 cell = floor(vec2(u, v));
          vec2 f = fract(vec2(u, v));
          float frame = step(0.17, f.x) * step(f.x, 0.83) * step(0.28, f.y) * step(f.y, 0.86);
          cityWin = frame * step(1.0, v); // no windows on the plinth
          float variant = cityHash(cell + floor(vCityPos.xz / 40.0));
          // Dark blue-grey glass with curtains here and there: windows read by day.
          vec3 glass = mix(vec3(0.035, 0.05, 0.075), vec3(0.11, 0.13, 0.15), variant);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, cityWin);
          // Plaster and panels weathered a little: not paper-white in the sun.
          diffuseColor.rgb *= 0.82;
          // Plinth and floor slabs a shade darker.
          diffuseColor.rgb *= mix(0.78, 1.0, step(1.0, v)) * (1.0 - 0.08 * step(f.y, 0.06));
          cityLit = cityWin * step(variant, cityShare) * cityNight;
        }`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.22, cityWin);
        metalnessFactor = mix(metalnessFactor, 0.25, cityWin);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * cityLit * 1.4;`,
      );
  };
  material.customProgramCacheKey = () => 'city-facade';
  return { material, uniforms };
}

function excluded(x: number, z: number, pad = 0) {
  if (Math.abs(x) < SITE.x + pad && z > SITE.zMin - pad && z < SITE.zMax + pad) return true;
  // The district's plots (they are on free land; this only keeps it so).
  return onOuterPlot(x, z, pad);
}

export function buildCity(data: CityData, offset: Pt, mobile: boolean) {
  const group = new THREE.Group();
  const blocks = new Voxels();
  const lit = new Voxels();
  const flat = new Voxels();
  const cell = mobile ? 3 : 2;
  const maxDist = mobile ? 520 : 820;
  const budget = mobile ? 4500 : 11000;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // Buildings, nearest first, until the budget is used.
  const list = data.b
    .map((b) => {
      const pts = points(b).map(([x, z]) => [x + offset[0], z + offset[1]] as Pt);
      const c = centroid(pts);
      return { levels: Number(b[0]), pts, c, d: Math.hypot(c[0], c[1]) };
    })
    .filter((b) => b.d < maxDist && !excluded(b.c[0], b.c[1], 4))
    .sort((a, b) => a.d - b.d);
  for (const b of list) {
    if (blocks.count > budget) break;
    // One storey is what OSM says when it does not know: 1–3 storeys then;
    // every building a little taller or lower so the skyline is not flat.
    const levels = b.levels <= 1 ? 1 + Math.floor(rand() * 3) : b.levels;
    const h = Math.max(3, levels * 3 * (0.94 + rand() * 0.12));
    const color = FACADES[Math.floor(rand() * FACADES.length)]!;
    if (b.d > 380) {
      // Far away: one block for the whole footprint.
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of b.pts) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      blocks.add((minX + maxX) / 2, h / 2, (minZ + maxZ) / 2, color, maxX - minX, h, maxZ - minZ);
      continue;
    }
    const runs = footprintRuns(b.pts, cell);
    let widest = runs[0]!;
    for (const run of runs) {
      blocks.add((run[0] + run[1]) / 2, h / 2, run[2] + cell / 2, color, run[1] - run[0], h, cell);
      if (run[1] - run[0] > widest[1] - widest[0]) widest = run;
    }
    // Roof details in the same instanced mesh (no extra draw calls): a lift
    // room or vent units on the widest part, a dark parapet strip.
    const rw = widest[1] - widest[0];
    if (rw > 5 && h > 5) {
      const part = ROOF_PARTS[Math.floor(rand() * ROOF_PARTS.length)]!;
      const rx = widest[0] + rw * (0.25 + rand() * 0.5);
      const rz = widest[2] + cell / 2;
      blocks.add(rx, h + 1.1, rz, part, Math.min(4, rw * 0.3), 2.2, Math.max(cell, 2.4));
      if (rw > 14)
        blocks.add(rx + rw * 0.3 * (rand() < 0.5 ? -1 : 1), h + 0.6, rz, part, 1.6, 1.2, 1.6);
      blocks.add((widest[0] + widest[1]) / 2, h + 0.25, rz, 0x4b5057, rw, 0.5, 0.35);
    }
    // Lit windows at night: a few floors of the widest part glow.
    if (b.levels >= 2 && b.d < 460) {
      for (let k = 0; k < b.levels; k++) {
        if (rand() > 0.35) continue;
        lit.add(
          (widest[0] + widest[1]) / 2,
          k * 3 + 1.7,
          widest[2] + cell / 2,
          0xffc46b,
          widest[1] - widest[0] + 0.25,
          0.9,
          cell + 0.25,
        );
      }
    }
  }

  // Roads: dark strips, dashed lanes on the big ones.
  for (const r of data.r) {
    const cls = Number(r[0]);
    const pts = points(r).map(([x, z]) => [x + offset[0], z + offset[1]] as Pt);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5 || Math.hypot(mx, mz) > maxDist || excluded(mx, mz)) continue;
      const rot = -Math.atan2(bz - az, bx - ax);
      flat.add(
        mx,
        0.03 + cls * 0.002,
        mz,
        cls ? 0x34383e : 0x5b5f66,
        len + ROAD_WIDTH[cls]! * 0.5,
        0.06,
        ROAD_WIDTH[cls]!,
        rot,
      );
      if (cls >= 2 && !mobile) {
        const n = Math.floor(len / 9);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          flat.add(ax + (bx - ax) * t, 0.07, az + (bz - az) * t, 0xe5e7eb, 3, 0.02, 0.25, rot);
        }
      }
    }
  }

  // Parks, pitches, forest, water, construction areas.
  let biggestConstruction: { c: Pt; size: number } | null = null;
  for (const a of data.a) {
    const kind = String(a[0]);
    const pts = points(a).map(([x, z]) => [x + offset[0], z + offset[1]] as Pt);
    const c = centroid(pts);
    if (Math.hypot(c[0], c[1]) > maxDist || excluded(c[0], c[1])) continue;
    const runs = footprintRuns(pts, 8);
    for (const run of runs)
      flat.add(
        (run[0] + run[1]) / 2,
        0.02,
        run[2] + 4,
        AREA_COLOR[kind] ?? 0x4f7a34,
        run[1] - run[0],
        0.04,
        8,
      );
    if (kind === 'forest' || kind === 'park')
      for (const run of runs)
        if (rand() < 0.25) {
          const x = run[0] + rand() * (run[1] - run[0]);
          const z = run[2] + rand() * 8;
          blocks.add(x, 1, z, 0x5b3d22, 0.6, 2, 0.6);
          blocks.add(x, 2.8, z, 0x3f6a2a, 2.6, 2, 2.6);
        }
    if (kind === 'construction' && runs.length > (biggestConstruction?.size ?? 0))
      biggestConstruction = { c, size: runs.length };
  }
  // A neutral city crane over the biggest real construction area (no labels, no owners).
  if (biggestConstruction) {
    const [x, z] = biggestConstruction.c;
    blocks.add(x, 18, z, 0xd1a23a, 1.4, 36, 1.4);
    blocks.add(x + 9, 36.5, z, 0xd1a23a, 26, 1, 1);
    blocks.add(x - 5, 35.8, z, 0x374151, 3, 2, 2);
  }

  const facade = facadeMaterial();
  // Plain boxes (12 triangles): the bevelled block is ~25× more and is never
  // seen at city distance.
  const built = blocks.build(facade.material, {
    cast: false,
    receive: true,
    geometry: PLAIN_BOX,
  });
  const litBuilt = lit.build(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), {
    cast: false,
    receive: false,
    geometry: PLAIN_BOX,
  });
  const flatBuilt = flat.build(new THREE.MeshLambertMaterial({ color: 0xffffff }), {
    cast: false,
    receive: true,
    geometry: PLAIN_BOX,
  });
  group.add(built.mesh, litBuilt.mesh, flatBuilt.mesh);
  // The painted lit-window strips are replaced by the facade's own windows.
  litBuilt.mesh.visible = false;
  return {
    group,
    lit: litBuilt.mesh,
    facade: facade.uniforms,
    instances: blocks.count + flat.count + lit.count,
  };
}
