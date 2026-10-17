'use client';

// Shared Leaflet setup for the providers map and the base picker: the library
// is loaded on demand in the browser (it touches `window`), tiles come through
// the site's cached OSM proxy (/api/tiles) with the OpenStreetMap credit, and
// the view stays over Russia, where the proxy serves tiles. Without a point of
// its own a map opens on the whole country (RUSSIA_VIEW) and moves to the
// visitor's town only when the browser already has their permission.

import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
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

/**
 * Moves a map to the visitor's town when the browser already lets the site
 * know the position (nothing is asked here: the «Моё местоположение» buttons
 * ask). The position itself is not sent anywhere; an address search sends
 * only the map's centre, rounded (nearParam).
 */
export function centreOnVisitor(map: LeafletMap, zoom = 11): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions) return;
  // Once the visitor taps, drags or searches, the map is theirs: a position
  // arriving later does not move it away from their point.
  const start = map.getCenter();
  const startZoom = map.getZoom();
  let touched = false;
  map.once('mousedown dragstart keydown', () => {
    touched = true;
  });
  const untouched = () => !touched && map.getZoom() === startZoom && map.getCenter().equals(start);
  navigator.permissions
    .query({ name: 'geolocation' })
    .then((permission) => {
      if (permission.state !== 'granted') return;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          try {
            if (!untouched()) return;
            map.setView([position.coords.latitude, position.coords.longitude], zoom);
          } catch {
            // The map was closed meanwhile.
          }
        },
        () => undefined,
        { maximumAge: 10 * 60_000, timeout: 10_000 },
      );
    })
    .catch(() => undefined);
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
