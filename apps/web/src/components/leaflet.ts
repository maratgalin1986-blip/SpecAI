'use client';

// Shared Leaflet setup for the providers map and the base picker: the library
// is loaded on demand in the browser (it touches `window`), tiles come through
// the site's cached OSM proxy (/api/tiles) with the OpenStreetMap credit, and
// the view stays over Russia, where the proxy serves tiles. Without a point of
// its own a map opens on the whole country (RUSSIA_VIEW) and moves to the
// visitor, with a «Вы здесь» dot, once their position is known (showVisitor).

import 'leaflet/dist/leaflet.css';
import './mapLabels.css';
import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { mapVisitorFix, type VisitorFix } from '@/components/visitorPosition';
import { RUSSIA_VIEW, SERVICE_AREA, TILE_MIN_ZOOM } from '@/lib/geo';

export type LeafletModule = typeof Leaflet;

let loading: Promise<LeafletModule> | null = null;

export function loadLeaflet(): Promise<LeafletModule> {
  loading ??= import('leaflet').then((module) => (module.default ?? module) as LeafletModule);
  return loading;
}

/** A map in `element` with the OSM layer through /api/tiles. */
export function createBaseMap(
  L: LeafletModule,
  element: HTMLElement,
  options: { center?: [number, number]; zoom?: number } = {},
) {
  const bounds = L.latLngBounds(
    [SERVICE_AREA.south, SERVICE_AREA.west],
    [SERVICE_AREA.north, SERVICE_AREA.east],
  );
  // The country fits a desktop at z4; a phone shows its European part at z3.
  const overviewZoom = element.clientWidth >= 700 ? RUSSIA_VIEW.zoom + 1 : RUSSIA_VIEW.zoom;
  const map = L.map(element, {
    center: options.center ?? [RUSSIA_VIEW.lat, RUSSIA_VIEW.lon],
    zoom: options.zoom ?? overviewZoom,
    minZoom: TILE_MIN_ZOOM,
    maxZoom: 18,
    maxBounds: bounds.pad(0.05),
    maxBoundsViscosity: 0.8,
    zoomControl: true,
    attributionControl: true,
  });
  map.attributionControl.setPrefix(false);
  L.tileLayer('/api/tiles/{z}/{x}/{y}', {
    minZoom: TILE_MIN_ZOOM,
    maxZoom: 18,
    bounds,
    // No outbound links on the site: the licence page is linked from /credits.
    attribution: '<a href="/credits">© участники OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

/** The «Вы здесь» dot: blue with a soft halo, unlike the pins of providers and the work site. */
export function visitorIcon(L: LeafletModule) {
  return L.divIcon({
    className: 'visitor-dot',
    html: '<span aria-label="Вы здесь" style="display:block;width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 8px rgba(37,99,235,.22),0 1px 4px rgba(15,23,42,.45)"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * «Вы здесь» on a map (owner, 2026-10-18): the visitor's own position as a
 * blue dot (components/visitorPosition.ts — asked at most once a session,
 * silently nothing after a «no»), refreshed every minute while the page is
 * open and visible. With `centreZoom` the map also moves there — only if the
 * visitor has not touched it yet: once they tap, drag or search, the map is
 * theirs. The map never waits for the position, and the dot lets taps through
 * to the map. The position is not sent anywhere from here; an address search
 * sends only the map's centre, rounded (nearParam).
 */
export function showVisitor(
  L: LeafletModule,
  map: LeafletMap,
  options: { centreZoom?: number } = {},
): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  let stopped = false;
  let dot: Marker | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  map.once('unload', () => {
    stopped = true;
    if (timer) clearInterval(timer);
  });
  const start = map.getCenter();
  const startZoom = map.getZoom();
  let touched = false;
  map.once('mousedown dragstart keydown', () => {
    touched = true;
  });
  const untouched = () => !touched && map.getZoom() === startZoom && map.getCenter().equals(start);
  const draw = (fix: VisitorFix) => {
    if (stopped) return;
    try {
      if (!dot) {
        dot = L.marker([fix.lat, fix.lon], {
          icon: visitorIcon(L),
          interactive: false,
          keyboard: false,
          zIndexOffset: -500,
          title: 'Вы здесь',
        }).addTo(map);
      } else {
        dot.setLatLng([fix.lat, fix.lon]);
      }
    } catch {
      // The map was closed meanwhile.
    }
  };
  void mapVisitorFix().then((fix) => {
    if (!fix || stopped) return;
    draw(fix);
    if (options.centreZoom && untouched()) {
      try {
        map.setView([fix.lat, fix.lon], options.centreZoom);
      } catch {
        // The map was closed meanwhile.
      }
    }
    timer = setInterval(() => {
      if (stopped || document.hidden) return;
      void mapVisitorFix(60_000).then((next) => next && draw(next));
    }, 60_000);
  });
}

/**
 * «&near=lat,lon» for /api/geocode when the map shows a town (zoom 9 and
 * closer): a bare street is then looked up there first. Empty on the country
 * overview, where the search covers all of Russia.
 */
export function nearParam(map: LeafletMap | null): string {
  if (!map || map.getZoom() < 9) return '';
  const centre = map.getCenter();
  return `&near=${centre.lat.toFixed(2)},${centre.lng.toFixed(2)}`;
}

/** Text for innerHTML of a marker (names come from users). */
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );
}

const MACHINE_SVG =
  '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17h11V11H8l-2 3H3z"/><path d="M14 13h3l3-6"/><path d="M20 7l1 4h-3"/><circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/></svg>';

/** A round marker: the provider's photo or the machine icon. */
export function pinIcon(
  L: LeafletModule,
  pin: { imageUrl: string | null; isHouse?: boolean; selected?: boolean },
  size = 52,
) {
  const ring = pin.isHouse ? '#f59e0b' : '#0f172a';
  const inner = pin.imageUrl
    ? `<img src="${escapeHtml(pin.imageUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:9999px;display:block" loading="lazy" referrerpolicy="no-referrer"/>`
    : `<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;border-radius:9999px;background:${pin.isHouse ? '#f59e0b' : '#1e293b'};color:${pin.isHouse ? '#0f172a' : '#fbbf24'}">${MACHINE_SVG}</span>`;
  const scale = pin.selected ? 1.15 : 1;
  const px = Math.round(size * scale);
  return L.divIcon({
    className: 'provider-pin',
    html: `<div style="width:${px}px;height:${px}px;border-radius:9999px;border:3px solid ${ring};background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.35);overflow:hidden">${inner}</div><div style="width:0;height:0;margin:-2px auto 0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${ring}"></div>`,
    iconSize: [px, px + 9],
    iconAnchor: [px / 2, px + 9],
  });
}

/**
 * Label ranks: when two labels would overlap, the lower rank stays —
 * СпецПласт16 first (the owner's rule), then machines on the line, then
 * provider bases, then the platform's «приём заявок» points.
 */
export const LABEL_RANK = { house: 0, live: 1, provider: 2, intake: 3 } as const;
export type LabelRank = (typeof LABEL_RANK)[keyof typeof LABEL_RANK];

/** Below this zoom (the whole country, a region) labels hide; a city shows them all. */
export const LABELS_MIN_ZOOM = 8;

/**
 * A permanent label above a marker (owner, 2026-10-18: «надписи над их
 * иконками», not only on tap). `html` must be escaped by the caller;
 * `iconHeight` is how far the icon reaches above its point.
 */
export function labelAbove(marker: Marker, html: string, rank: LabelRank, iconHeight: number) {
  return marker.bindTooltip(html, {
    permanent: true,
    direction: 'top',
    offset: [0, -iconHeight],
    opacity: 1,
    className: `map-label map-label-r${rank}`,
  });
}

function overlaps(a: DOMRect, b: DOMRect) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Keeps the labels of a map readable: all hidden below LABELS_MIN_ZOOM, and
 * a label that would cover one of a higher rank hidden until the map moves
 * (its pin still opens on tap). Returns the function to run after new labels.
 */
export function declutterLabels(map: LeafletMap): () => void {
  const run = () => {
    let container: HTMLElement;
    try {
      container = map.getContainer();
    } catch {
      return;
    }
    const off = map.getZoom() < LABELS_MIN_ZOOM;
    container.classList.toggle('labels-off', off);
    if (off) return;
    const rankOf = (el: HTMLElement) => Number(/map-label-r(\d)/.exec(el.className)?.[1] ?? 9);
    const labels = Array.from(container.querySelectorAll<HTMLElement>('.map-label')).sort(
      (a, b) => rankOf(a) - rankOf(b),
    );
    // Write, read all, write: one layout for the whole pass, not one per label.
    // Labels off the screen are not compared.
    for (const label of labels) label.classList.remove('label-clash');
    const view = container.getBoundingClientRect();
    const boxes = labels.map((label) => label.getBoundingClientRect());
    const placed: DOMRect[] = [];
    const clashing: HTMLElement[] = [];
    labels.forEach((label, index) => {
      const box = boxes[index]!;
      if (!overlaps(view, box)) return;
      if (placed.some((other) => overlaps(other, box))) clashing.push(label);
      else placed.push(box);
    });
    for (const label of clashing) label.classList.add('label-clash');
  };
  map.on('zoomend moveend', run);
  return () => requestAnimationFrame(run);
}

/** A «приём заявок» point of the platform: not a machine, not a company. */
export function intakeIcon(L: LeafletModule) {
  return L.divIcon({
    className: 'intake-pin',
    html: '<span style="display:flex;width:32px;height:32px;align-items:center;justify-content:center;border-radius:9999px;background:#fffbeb;border:2px dashed #b45309;font-size:16px;box-shadow:0 2px 8px rgba(15,23,42,.25)">📝</span>',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}
