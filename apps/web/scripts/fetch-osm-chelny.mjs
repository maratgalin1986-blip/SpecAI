#!/usr/bin/env node
/* global setTimeout, fetch, AbortSignal, console, process */
// Fetches a ~2×2 km piece of Набережные Челны (Новый город) from OpenStreetMap
// via Overpass and writes a compact JSON for the /stroyka voxel city:
//   node apps/web/scripts/fetch-osm-chelny.mjs
// Data © участники OpenStreetMap, licence ODbL (https://www.openstreetmap.org/copyright).
// Run at development time only; the site serves the committed JSON.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = { lat: 55.743, lon: 52.398 };
const HALF_KM = 1.0;
const TILES = 2; // TILES × TILES small queries
const MIRRORS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'SpecPlast16-stroyka/1.0 (+https://spec-ai-web.vercel.app; specplast16@mail.ru)';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/stroyka/chelny-osm.json');

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const dLat = (HALF_KM * 1000) / M_PER_DEG_LAT;
const dLon = (HALF_KM * 1000) / M_PER_DEG_LON;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One small query per category and tile: the public mirrors fail on big unions.
const CATEGORIES = [
  (b) => `way["building"]${b};`,
  (b) =>
    `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|pedestrian)$"]${b};`,
  (
    b,
  ) => `(way["landuse"~"^(grass|construction|forest|meadow|recreation_ground|village_green)$"]${b};
  way["leisure"~"^(park|garden|pitch|playground)$"]${b};
  way["natural"~"^(water|wood|scrub)$"]${b};);`,
];

function query(category, s, w, n, e) {
  return `[out:json][timeout:90];${CATEGORIES[category](`(${s},${w},${n},${e})`)}out geom;`;
}

async function fetchTile(q, expectData = false) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const url = MIRRORS[attempt % 3 === 2 ? 1 + (attempt % 2) : 0];
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(q)}`,
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`${url} → ${response.status}`);
      const json = await response.json();
      // A timed-out query still answers 200 with a remark and no elements.
      if (json.remark) throw new Error(json.remark.slice(0, 80));
      if (expectData && !(json.elements ?? []).length) throw new Error('empty answer');
      return json;
    } catch (error) {
      const wait = Math.min(60_000, 3000 * 2 ** attempt);
      console.warn(`attempt ${attempt + 1} failed: ${error.message}; retry in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error('All Overpass mirrors failed');
}

const toXZ = (p) => [
  Math.round((p.lon - ORIGIN.lon) * M_PER_DEG_LON * 2) / 2,
  Math.round(-(p.lat - ORIGIN.lat) * M_PER_DEG_LAT * 2) / 2,
];

// Douglas–Peucker on [x, z] points.
function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  const [ax, az] = points[0];
  const [bx, bz] = points[points.length - 1];
  let index = 0;
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, pz] = points[i];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const d = Math.abs((bx - ax) * (az - pz) - (ax - px) * (bz - az)) / len;
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

function levelsOf(tags) {
  const levels = Number.parseFloat(tags['building:levels']);
  if (Number.isFinite(levels) && levels > 0) return Math.min(30, Math.round(levels));
  const height = Number.parseFloat(tags.height);
  if (Number.isFinite(height) && height > 0)
    return Math.max(1, Math.min(30, Math.round(height / 3)));
  const b = tags.building;
  if (/garage|garages|shed|kiosk|roof|hut|service/.test(b)) return 1;
  if (/house|detached|cabin/.test(b)) return 2;
  if (/industrial|warehouse|retail|commercial|supermarket/.test(b)) return 2;
  return 5; // typical Chelny panel block
}

const ROAD_CLASS = {
  motorway: 3,
  trunk: 3,
  primary: 3,
  secondary: 2,
  tertiary: 2,
  residential: 1,
  unclassified: 1,
  living_street: 1,
  pedestrian: 0,
  service: 0,
};

function areaKind(tags) {
  if (tags.landuse === 'construction' || tags.building === 'construction') return 'construction';
  if (tags.natural === 'water') return 'water';
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'forest';
  if (tags.leisure === 'pitch' || tags.leisure === 'playground') return 'pitch';
  return 'park';
}

async function main() {
  const seen = new Set();
  const buildings = [];
  const roads = [];
  const areas = [];
  for (let i = 0; i < TILES; i++) {
    for (let j = 0; j < TILES; j++) {
      const s = ORIGIN.lat - dLat + (2 * dLat * i) / TILES;
      const n = ORIGIN.lat - dLat + (2 * dLat * (i + 1)) / TILES;
      const w = ORIGIN.lon - dLon + (2 * dLon * j) / TILES;
      const e = ORIGIN.lon - dLon + (2 * dLon * (j + 1)) / TILES;
      for (let c = 0; c < CATEGORIES.length; c++) {
        console.log(`tile ${i},${j} category ${c}`);
        const json = await fetchTile(
          query(c, s.toFixed(5), w.toFixed(5), n.toFixed(5), e.toFixed(5)),
          c < 2,
        );
        for (const el of json.elements ?? []) {
          if (el.type !== 'way' || !el.geometry || seen.has(el.id)) continue;
          seen.add(el.id);
          const tags = el.tags ?? {};
          const pts = el.geometry.map(toXZ);
          if (tags.building && tags.building !== 'construction') {
            const ring = simplify(pts, 0.8).slice(0, -1);
            if (ring.length >= 3) buildings.push([levelsOf(tags), ...ring.flat()]);
          } else if (tags.highway) {
            const cls = ROAD_CLASS[tags.highway] ?? 0;
            const line = simplify(pts, 1.5);
            roads.push([cls, ...line.flat()]);
          } else {
            const ring = simplify(pts, 2).slice(0, -1);
            if (ring.length >= 3) areas.push([areaKind(tags), ...ring.flat()]);
          }
        }
        await sleep(1500);
      }
    }
  }
  const data = {
    attribution: '© участники OpenStreetMap, ODbL',
    source: 'https://www.openstreetmap.org/copyright',
    origin: [ORIGIN.lat, ORIGIN.lon],
    halfSize: HALF_KM * 1000,
    fetched: new Date().toISOString().slice(0, 10),
    b: buildings,
    r: roads,
    a: areas,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data));
  console.log(
    `buildings ${buildings.length}, roads ${roads.length}, areas ${areas.length} → ${OUT}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
