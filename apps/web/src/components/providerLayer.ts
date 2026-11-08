'use client';

// The customers' map layer (/map, owner 2026-10-18): every provider's base
// with a permanent label over its pin — СпецПласт16 first and in its colour —,
// the machines on the line for a signed-in visitor (GET /api/line/nearby is
// for accounts only; a guest simply does not get them), and the platform's
// «приём заявок» points in big cities with nobody near (lib/intakePoints.ts).
// Nothing here is invented: every pin is a row of the database or a city of
// the shared list labelled as the platform.

import type { Map as LeafletMap } from 'leaflet';
import {
  LABEL_RANK,
  declutterLabels,
  escapeHtml,
  intakeIcon,
  labelAbove,
  pinIcon,
  type LeafletModule,
} from '@/components/leaflet';
import { clearOf, type IntakePoint } from '@/lib/intakePoints';
import { liveLabel, providerLabel, type MapLabel } from '@/lib/mapLabels';

interface ProviderPinRow {
  id: string;
  name: string;
  lat: number;
  lon: number;
  note: string | null;
  imageUrl: string | null;
  equipmentCount: number;
  isHouse: boolean;
  catalogUrl: string;
}

interface LiveRow {
  lat: number;
  lon: number;
  bubble: string;
  note: string | null;
  company: { isHouse: boolean };
  equipment: { id: string } | null;
}

function labelHtml({ title, sub }: MapLabel) {
  return `<b>${escapeHtml(title)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

const LIVE_SVG =
  '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17h11V11H8l-2 3H3z"/><path d="M14 13h3l3-6"/><circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/></svg>';

function liveIcon(L: LeafletModule, house: boolean) {
  const ring = house ? '#f59e0b' : '#16a34a';
  return L.divIcon({
    className: 'live-pin',
    html: `<span style="display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:9999px;background:${ring};color:#fff;border:3px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.35)">${LIVE_SVG}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

/**
 * Draws the layer on `map` once the data is in; `alive` says whether the map
 * is still open by then. Failures leave the map as it is.
 */
export async function drawProviderLayer(
  L: LeafletModule,
  map: LeafletMap,
  alive: () => boolean,
): Promise<void> {
  const [pins, line] = await Promise.all([
    json<{ providers?: ProviderPinRow[]; intake?: IntakePoint[] }>('/api/providers/map'),
    json<{ machines?: LiveRow[] }>('/api/line/nearby'),
  ]);
  if (!alive()) return;
  const refresh = declutterLabels(map);
  const providers = pins?.providers ?? [];
  const live = line?.machines ?? [];

  // Others first, so СпецПласт16's pin is drawn on top.
  for (const pin of [...providers].reverse()) {
    const size = pin.isHouse ? 44 : 38;
    const marker = L.marker([pin.lat, pin.lon], {
      icon: pinIcon(L, { imageUrl: pin.imageUrl, isHouse: pin.isHouse }, size),
      title: pin.name,
      zIndexOffset: pin.isHouse ? 800 : 0,
    });
    const label = providerLabel(pin);
    const popup = document.createElement('div');
    popup.innerHTML =
      labelHtml(label) +
      (pin.note ? `<p style="margin:4px 0 0">${escapeHtml(pin.note)}</p>` : '') +
      `<p style="margin:6px 0 0"><a href="${escapeHtml(pin.catalogUrl)}">Техника исполнителя →</a></p>`;
    marker.bindPopup(popup);
    labelAbove(
      marker,
      labelHtml(label),
      pin.isHouse ? LABEL_RANK.house : LABEL_RANK.provider,
      size + 9,
    );
    marker.addTo(map);
  }

  for (const machine of live) {
    const marker = L.marker([machine.lat, machine.lon], {
      icon: liveIcon(L, machine.company.isHouse),
      zIndexOffset: 1200,
    });
    const label = liveLabel(machine);
    if (machine.equipment) {
      marker.bindPopup(
        labelHtml(label) +
          (machine.note ? `<p style="margin:4px 0 0">${escapeHtml(machine.note)}</p>` : '') +
          `<p style="margin:6px 0 0"><a href="/equipment/${encodeURIComponent(machine.equipment.id)}">Открыть машину →</a></p>`,
      );
    }
    labelAbove(
      marker,
      labelHtml(label),
      machine.company.isHouse ? LABEL_RANK.house : LABEL_RANK.live,
      17,
    );
    marker.addTo(map);
  }

  // The platform's points only where no machine on the line is near either.
  for (const point of clearOf(pins?.intake ?? [], live)) {
    const marker = L.marker([point.lat, point.lon], {
      icon: intakeIcon(L),
      title: `${point.title}. ${point.text}`,
      zIndexOffset: -200,
    });
    // A tap opens a card with the link, never leaves the page by itself: the
    // map's own form below may already hold a name and a phone.
    marker.bindPopup(
      labelHtml({ title: point.title, sub: point.text }) +
        `<p style="margin:6px 0 0"><a href="${escapeHtml(point.href)}">Оставить заявку — ${escapeHtml(point.city)} →</a></p>`,
    );
    labelAbove(marker, labelHtml({ title: point.title, sub: point.text }), LABEL_RANK.intake, 16);
    marker.addTo(map);
  }
  refresh();
}
