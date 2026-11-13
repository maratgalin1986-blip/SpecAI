'use client';

// The customers' map layer (/map, owner 2026-10-18 and 2026-11-08: «все всех
// всегда должны видеть на карте в режиме офлайн и навсегда»): every provider
// with machinery and a point, whether on the line or not — a dimmed pin when
// offline, a green ring when on the line —, with a permanent label over it;
// the machines on the line for a signed-in visitor (GET /api/line/nearby is
// for accounts only; a guest simply does not get them); customers with an
// open order as «Заказчик рядом» pins; and the platform's «приём заявок»
// points in big cities with nobody near (lib/intakePoints.ts). The pins come
// for the viewport (GET /api/providers/map?bbox=…, the nearest 300) and are
// fetched again when the map moves. A tap on a pin centres the map on it and
// tells the page who is around (`onSelect`, lib/mapNearby.ts). Nothing here
// is invented: every pin is a row of the database or a city of the shared
// list labelled as the platform.

import type { LatLngBounds, LayerGroup, Map as LeafletMap, Marker } from 'leaflet';
import {
  LABEL_RANK,
  customerIcon,
  declutterLabels,
  declutterPins,
  escapeHtml,
  intakeIcon,
  labelAbove,
  pinIcon,
  type LeafletModule,
} from '@/components/leaflet';
import { clearOf, type IntakePoint } from '@/lib/intakePoints';
import type { CustomerMapPin } from '@/lib/mapCustomers';
import {
  customerLabel,
  groupLive,
  liveGroupLabel,
  liveLabel,
  providerLabel,
  type MapLabel,
} from '@/lib/mapLabels';
import {
  nearbyAround,
  nearbyKey,
  nearbySummary,
  type NearbyItem,
  type NearbyPoint,
} from '@/lib/mapNearby';
import { MAP_PINS_LIMIT, type ProviderMapPin } from '@/lib/providerMap';
import { SITE } from '@/lib/site';

interface LiveRow {
  id: string;
  lat: number;
  lon: number;
  bubble: string;
  note: string | null;
  /** Fresh GPS: the pin is where the machine is now; else it stands at its base. */
  live?: boolean;
  busyToday?: boolean;
  company: { isHouse: boolean };
  equipment: { id: string; category: string | null; name: string } | null;
}

/** What the page learns when a pin is tapped. */
export interface MapSelection {
  /** The tapped pin as a list item (distance 0). */
  focus: NearbyPoint;
  /** «рядом: 3 экскаватора, 2 самосвала, 1 заказчик». */
  summary: string;
  items: NearbyItem[];
}

/** Zoom the map goes to when a pin is tapped from far away. */
const FOCUS_ZOOM = 11;
/** The map does not fetch again for a move shorter than this (ms). */
const MOVE_DEBOUNCE_MS = 400;
/** A card opens clear of the zoom control in the map's corner (a phone-width map). */
const POPUP = {
  autoPanPaddingTopLeft: [64, 12] as [number, number],
  autoPanPaddingBottomRight: [12, 12] as [number, number],
};

function labelHtml({ title, sub }: MapLabel) {
  return `<b>${escapeHtml(title)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
}

/** The same two lines at the head of a card, the small one under the bold one. */
function cardHeadHtml({ title, sub }: MapLabel) {
  return `<b>${escapeHtml(title)}</b>${
    sub ? `<small style="display:block;color:#475569">${escapeHtml(sub)}</small>` : ''
  }`;
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

/** «Экскаваторы, Самосвалы, ещё 2». */
export function machinesLine(pin: Pick<ProviderMapPin, 'machines' | 'machinesMore'>): string {
  const parts = [...pin.machines];
  if (pin.machinesMore > 0) parts.push(`ещё ${pin.machinesMore}`);
  return parts.join(', ');
}

/**
 * The card of a provider's pin: name, city and machinery, the cheapest
 * shift, «на линии» or not (never when it registered or was last seen), the
 * phone as a tap-to-call link while the provider shows it, else «Написать».
 */
export function providerPopupHtml(pin: ProviderMapPin): string {
  const label = providerLabel(pin);
  const lines: string[] = [cardHeadHtml(label)];
  const where = [pin.city, machinesLine(pin)].filter(Boolean).join(' · ');
  if (where) lines.push(`<p style="margin:4px 0 0">${escapeHtml(where)}</p>`);
  if (pin.priceText)
    lines.push(`<p style="margin:4px 0 0"><b>${escapeHtml(pin.priceText)}</b></p>`);
  if (pin.note) lines.push(`<p style="margin:4px 0 0">${escapeHtml(pin.note)}</p>`);
  lines.push(
    `<p style="margin:4px 0 0;color:${pin.onLine ? '#15803d' : '#64748b'}">${
      pin.onLine ? 'Сейчас на линии' : 'Не на линии — позвоните или напишите'
    }</p>`,
  );
  if (pin.phone && pin.phoneHref) {
    lines.push(
      `<p style="margin:6px 0 0"><a href="${escapeHtml(pin.phoneHref)}" style="font-weight:700">📞 ${escapeHtml(pin.phone)}</a></p>`,
    );
  } else {
    lines.push(
      `<p style="margin:6px 0 0"><a href="${escapeHtml(pin.orderUrl)}" style="font-weight:700">Написать — оставить заявку →</a></p>`,
    );
  }
  lines.push(
    `<p style="margin:6px 0 0"><a href="${escapeHtml(pin.catalogUrl)}">Техника исполнителя →</a></p>`,
  );
  return lines.join('');
}

/** The card of a customer's pin: the short name, the machinery wanted, the order. Never a phone or an address. */
export function customerPopupHtml(pin: CustomerMapPin): string {
  return (
    cardHeadHtml(customerLabel(pin)) +
    `<p style="margin:4px 0 0;color:#64748b">Место показано примерно, с точностью до километра.</p>` +
    `<p style="margin:6px 0 0"><a href="${escapeHtml(pin.orderUrl)}" style="font-weight:700">Открыть заявку →</a></p>`
  );
}

function providerPoint(pin: ProviderMapPin): NearbyPoint {
  const label = providerLabel(pin);
  const sub = [pin.city, machinesLine(pin), pin.priceText].filter(Boolean).join(' · ') || label.sub;
  return {
    kind: 'provider',
    id: pin.id,
    lat: pin.lat,
    lon: pin.lon,
    title: label.title,
    sub,
    href: pin.catalogUrl,
    types: pin.machines,
  };
}

function customerPoint(pin: CustomerMapPin): NearbyPoint {
  return {
    kind: 'customer',
    id: pin.id,
    lat: pin.lat,
    lon: pin.lon,
    title: pin.title,
    sub: pin.sub,
    href: pin.orderUrl,
    types: [],
  };
}

function livePoint(machine: LiveRow): NearbyPoint {
  const label = liveLabel(machine);
  return {
    kind: 'live',
    id: machine.id,
    lat: machine.lat,
    lon: machine.lon,
    title: label.title,
    sub: label.sub,
    href: machine.equipment ? `/equipment/${encodeURIComponent(machine.equipment.id)}` : '/map',
    types: machine.equipment ? [machine.equipment.category ?? machine.equipment.name] : [],
  };
}

function bboxParam(bounds: LatLngBounds): string {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return [sw.lat, sw.lng, ne.lat, ne.lng].map((value) => value.toFixed(3)).join(',');
}

/**
 * Draws the layer on `map` and keeps it current as the map moves; `alive`
 * says whether the map is still open. Failures leave the map as it is.
 * `onSelect` gets the tapped pin and who is around it.
 */
export async function drawProviderLayer(
  L: LeafletModule,
  map: LeafletMap,
  alive: () => boolean,
  options: {
    onSelect?: (selection: MapSelection) => void;
    /**
     * Whether the visitor has an account: the machines on the line are asked
     * for only then (the route answers a guest 401). Without it they are asked.
     */
    signedIn?: Promise<boolean>;
  } = {},
): Promise<void> {
  // Pins first (registered first, so they also run first on every move), then
  // the labels of the pins left on the screen.
  const refreshPins = declutterPins(map);
  const refreshLabels = declutterLabels(map);
  const refresh = () => {
    refreshPins();
    refreshLabels();
  };
  const pinsLayer: LayerGroup = L.layerGroup().addTo(map);
  let providers: ProviderMapPin[] = [];
  let customers: CustomerMapPin[] = [];
  let live: LiveRow[] = [];

  const allPoints = (): NearbyPoint[] => [
    ...providers.map(providerPoint),
    ...live.map(livePoint),
    ...customers.map(customerPoint),
  ];

  // Set below, once the loader exists: asks for the viewport's pins (debounced).
  let reloadViewport: () => void = () => {};

  const select = (focus: NearbyPoint) => {
    // «При выборе … видно вокруг него»: the map centres on the pin, the page lists the neighbours.
    try {
      map.setView([focus.lat, focus.lon], Math.max(map.getZoom(), FOCUS_ZOOM), { animate: true });
    } catch {
      return;
    }
    const items = nearbyAround(focus, allPoints(), { exclude: nearbyKey(focus) });
    options.onSelect?.({ focus, summary: nearbySummary(items), items });
    // The move above asks for the viewport too; asked here as well, so the
    // neighbours come even when the zoom animation's events run late.
    reloadViewport();
  };

  // Markers are kept by key between loads, so the pin a visitor just tapped
  // (and its open card) survives the reload the centring itself causes; a
  // provider whose line state changed gets a new key and a new pin.
  const markers = new Map<string, Marker>();
  const drawPins = () => {
    const wanted = new Set<string>();
    // The line over the rest, СпецПласт16 on top of all.
    const ordered = [...providers].sort(
      (a, b) => Number(a.isHouse) - Number(b.isHouse) || Number(a.onLine) - Number(b.onLine),
    );
    for (const pin of ordered) {
      const key = `provider:${pin.id}:${pin.onLine ? 1 : 0}`;
      wanted.add(key);
      if (markers.has(key)) continue;
      const size = pin.isHouse ? 44 : 38;
      const marker = L.marker([pin.lat, pin.lon], {
        icon: pinIcon(
          L,
          { imageUrl: pin.imageUrl, isHouse: pin.isHouse, dim: !pin.onLine, onLine: pin.onLine },
          size,
        ),
        title: pin.name,
        zIndexOffset: pin.isHouse ? 800 : pin.onLine ? 400 : 0,
      });
      marker.bindPopup(providerPopupHtml(pin), POPUP);
      labelAbove(
        marker,
        labelHtml(providerLabel(pin)),
        pin.isHouse ? LABEL_RANK.house : LABEL_RANK.provider,
        size + 9,
        pin.onLine || pin.isHouse ? '' : 'map-label-offline',
      );
      marker.on('click', () => select(providerPoint(pin)));
      marker.addTo(pinsLayer);
      markers.set(key, marker);
    }

    for (const pin of customers) {
      const key = `customer:${pin.id}`;
      wanted.add(key);
      if (markers.has(key)) continue;
      const marker = L.marker([pin.lat, pin.lon], {
        icon: customerIcon(L),
        title: `${pin.title}: ${pin.sub}`,
        zIndexOffset: -100,
      });
      marker.bindPopup(customerPopupHtml(pin), POPUP);
      labelAbove(marker, labelHtml(customerLabel(pin)), LABEL_RANK.customer, 15);
      marker.on('click', () => select(customerPoint(pin)));
      marker.addTo(pinsLayer);
      markers.set(key, marker);
    }

    for (const [key, marker] of markers) {
      if (wanted.has(key)) continue;
      pinsLayer.removeLayer(marker);
      markers.delete(key);
    }
    refresh();
  };

  const load = async (bounds: LatLngBounds | null) => {
    const query = bounds ? `?bbox=${bboxParam(bounds)}&limit=${MAP_PINS_LIMIT}` : '';
    const data = await json<{
      providers?: ProviderMapPin[];
      customers?: CustomerMapPin[];
      intake?: IntakePoint[];
    }>(`/api/providers/map${query}`);
    if (!alive() || !data) return null;
    providers = data.providers ?? [];
    customers = data.customers ?? [];
    return data;
  };

  const [first, line] = await Promise.all([
    load(null),
    (options.signedIn ?? Promise.resolve(true)).then((account) =>
      account ? json<{ machines?: LiveRow[] }>('/api/line/nearby') : null,
    ),
  ]);
  if (!alive()) return;
  live = line?.machines ?? [];
  drawPins();

  for (const group of groupLive(live)) {
    const machine = group[0]!;
    const marker = L.marker([machine.lat, machine.lon], {
      icon: liveIcon(L, machine.company.isHouse),
      zIndexOffset: 1200,
    });
    const label = group.length > 1 ? liveGroupLabel(group) : liveLabel(machine);
    if (group.length > 1) {
      // A fleet on the line at its base: one pin, every machine a link to its
      // page (the order form for that machine); СпецПласт16's with the site phone.
      marker.bindPopup(
        labelHtml(label) +
          group
            .filter((item) => item.equipment)
            .map((item) => {
              const line = liveLabel(item);
              return `<p style="margin:6px 0 0"><a href="/equipment/${encodeURIComponent(item.equipment!.id)}">${escapeHtml(line.title)} →</a>${
                item.busyToday ? ' <small style="color:#64748b">занята сегодня</small>' : ''
              }</p>`;
            })
            .join('') +
          (machine.company.isHouse
            ? `<p style="margin:8px 0 0"><a href="${escapeHtml(SITE.phoneHref)}">${escapeHtml(SITE.phone)}</a></p>`
            : ''),
        { ...POPUP, maxHeight: 260 },
      );
    } else if (machine.equipment) {
      marker.bindPopup(
        labelHtml(label) +
          (machine.note ? `<p style="margin:4px 0 0">${escapeHtml(machine.note)}</p>` : '') +
          `<p style="margin:6px 0 0"><a href="/equipment/${encodeURIComponent(machine.equipment.id)}">Открыть машину →</a></p>`,
        POPUP,
      );
    }
    labelAbove(
      marker,
      labelHtml(label),
      machine.company.isHouse ? LABEL_RANK.house : LABEL_RANK.live,
      17,
    );
    marker.on('click', () => select(livePoint(machine)));
    marker.addTo(map);
  }

  // The platform's points only where no machine on the line is near either.
  for (const point of clearOf(first?.intake ?? [], live)) {
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
      POPUP,
    );
    labelAbove(marker, labelHtml({ title: point.title, sub: point.text }), LABEL_RANK.intake, 16);
    marker.addTo(map);
  }
  refresh();

  // The whole country may be thousands of providers: the viewport's nearest
  // come as the map moves. The first answer (no box) is kept until then.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastKey = '';
  reloadViewport = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!alive()) return;
      let bounds: LatLngBounds;
      try {
        bounds = map.getBounds().pad(0.3);
      } catch {
        return;
      }
      const key = bboxParam(bounds);
      if (key === lastKey) return;
      lastKey = key;
      void load(bounds).then((data) => {
        if (data && alive()) drawPins();
      });
    }, MOVE_DEBOUNCE_MS);
  };
  map.on('moveend', reloadViewport);
  map.once('unload', () => {
    if (timer) clearTimeout(timer);
  });
}
