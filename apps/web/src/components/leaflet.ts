'use client';

// Shared Leaflet setup for the providers map and the base picker: the library
// is loaded on demand in the browser (it touches `window`), tiles come through
// the site's cached OSM proxy (/api/tiles) with the OpenStreetMap credit, and
// the view stays around Tatarstan and its neighbours, where the proxy serves
// tiles.

import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { SERVICE_AREA, TILE_MIN_ZOOM } from '@/lib/geo';

export type LeafletModule = typeof Leaflet;

export const CHELNY = { lat: 55.7436, lon: 52.3959 } as const;

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
  const map = L.map(element, {
    center: options.center ?? [CHELNY.lat, CHELNY.lon],
    zoom: options.zoom ?? 9,
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
