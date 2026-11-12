import type { PrismaClient } from '@specai/database';
import { customerRates } from './equipmentCatalog';
import { HOUSE_COMPANY_ID } from './fleet';
import { houseFreeNow } from './houseLine';
import { loadHouseLine } from './houseLineData';
import { isOnLine, PRESENCE_FRESH_MS } from './linePresence';
import { toCustomerPins, type CustomerMapPin } from './mapCustomers';
import {
  bboxCentre,
  inBbox,
  MAP_CUSTOMERS_LIMIT,
  MAP_PINS_LIMIT,
  nearestPins,
  toMapPins,
  type MapBbox,
  type ProviderMapPin,
  type ProviderMapRow,
} from './providerMap';

/** How many machines of a company the pin reads: enough for its types and the cheapest shift. */
const PIN_MACHINES_SCAN = 24;
/** How many companies one request reads before the nearest `limit` are kept. */
const COMPANY_SCAN = 2000;
/** How many open orders one request reads before the nearest are kept. */
const ORDER_SCAN = 600;
const DAY_MS = 24 * 60 * 60_000;

export interface MapPinsQuery {
  /** The map's viewport; without it the whole country. */
  bbox?: MapBbox | null;
  /** What the nearest pins are measured from; the box's centre by default. */
  around?: { lat: number; lon: number } | null;
  limit?: number;
  customersLimit?: number;
  now?: Date;
}

export interface MapPins {
  providers: ProviderMapPin[];
  customers: CustomerMapPin[];
}

/** The SQL box for a company's base; nothing without a viewport. */
function baseBox(bbox: MapBbox | null) {
  return bbox
    ? {
        baseLat: { not: null, gte: bbox.south, lte: bbox.north },
        baseLon: { not: null, gte: bbox.west, lte: bbox.east },
      }
    : { baseLat: { not: null }, baseLon: { not: null } };
}

/**
 * The customers' map, from the database (owner, 2026-11-08: everyone sees
 * everyone, offline too, for good). Providers: every provider company with
 * published machinery and a point (its base, else a machine's own point)
 * whose «Показывать меня на карте» is on; the nearest `limit` to the box's
 * centre. Each carries its machinery types, its city, the cheapest shift
 * price (customer rates) and — while its «Показывать телефон на карте» is
 * on — its contact phone; toMapPins copies the fields one by one. `onLine`
 * marks a company with a machine on the line now (lib/linePresence.ts).
 * Customers: open orders with a place, as pins rounded to a kilometre
 * (lib/mapCustomers.ts). Machinery that is written off (RETIRED) is not
 * counted.
 */
export async function loadMapPins(
  prisma: PrismaClient,
  query: MapPinsQuery = {},
): Promise<MapPins> {
  const now = query.now ?? new Date();
  const bbox = query.bbox ?? null;
  const around = query.around ?? (bbox ? bboxCentre(bbox) : null);
  const limit = Math.max(1, Math.min(MAP_PINS_LIMIT, query.limit ?? MAP_PINS_LIMIT));
  const customersLimit = Math.max(
    0,
    Math.min(MAP_CUSTOMERS_LIMIT, query.customersLimit ?? MAP_CUSTOMERS_LIMIT),
  );
  const published = { status: { not: 'RETIRED' as const } };
  const companies = await prisma.company.findMany({
    where: {
      isProvider: true,
      equipment: { some: published },
      AND: [
        // The provider's own switch; null (older rows) is on.
        { OR: [{ showOnMap: null }, { showOnMap: true }] },
        {
          OR: [
            baseBox(bbox),
            // No base of its own: a machine's point serves (providerMapPoint).
            {
              baseLat: null,
              equipment: {
                some: {
                  ...published,
                  location: {
                    latitude: { not: null, ...(bbox ? { gte: bbox.south, lte: bbox.north } : {}) },
                    longitude: { not: null, ...(bbox ? { gte: bbox.west, lte: bbox.east } : {}) },
                  },
                },
              },
            },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      isProvider: true,
      baseLat: true,
      baseLon: true,
      baseAddress: true,
      phone: true,
      pinImageUrl: true,
      pinNote: true,
      showOnMap: true,
      showPhoneOnMap: true,
      _count: { select: { equipment: { where: published } } },
      equipment: {
        where: published,
        select: {
          name: true,
          companyId: true,
          hourlyRate: true,
          dailyRate: true,
          category: { select: { name: true } },
          location: { select: { latitude: true, longitude: true } },
        },
        orderBy: { name: 'asc' },
        take: PIN_MACHINES_SCAN,
      },
    },
    // The biggest fleets first when the scan is cut.
    orderBy: { equipment: { _count: 'desc' } },
    take: COMPANY_SCAN,
  });

  const rows: ProviderMapRow[] = companies.map(({ _count, equipment, ...company }) => ({
    ...company,
    equipmentCount: _count.equipment,
    machines: equipment.map((machine) => ({
      name: machine.name,
      category: machine.category?.name ?? null,
      // The customer's price: the house fleet never below the price list.
      dailyRate: customerRates({
        ...machine,
        categoryName: machine.category?.name ?? '',
      }).dailyRate,
      location: machine.location,
    })),
  }));
  const pins = nearestPins(toMapPins(rows), around, limit);

  // «На линии» now: a live GPS session or a standing line (lib/lineStanding.ts).
  const ids = pins.filter((pin) => !pin.onLine).map((pin) => pin.id);
  if (ids.length) {
    const presences = await prisma.linePresence.findMany({
      where: {
        companyId: { in: ids },
        OR: [
          { online: true, updatedAt: { gte: new Date(now.getTime() - PRESENCE_FRESH_MS) } },
          { standingForever: true },
          { standingUntil: { gt: now } },
        ],
      },
      select: {
        companyId: true,
        online: true,
        updatedAt: true,
        onlineSince: true,
        timeZone: true,
        standingUntil: true,
        standingForever: true,
        gpsAt: true,
        equipment: { select: { status: true } },
      },
      take: 2000,
    });
    const onLine = new Set(
      presences
        .filter((row) => row.equipment?.status === 'AVAILABLE' && isOnLine(row, now))
        .map((row) => row.companyId),
    );
    for (const pin of pins) if (onLine.has(pin.id)) pin.onLine = true;
  }
  // СпецПласт16 is always on the line while it has a free machine today
  // (owner, 2026-11-11, lib/houseLine.ts).
  const housePin = pins.find((pin) => pin.id === HOUSE_COMPANY_ID && !pin.onLine);
  if (housePin && houseFreeNow(await loadHouseLine(prisma, now)).length > 0) {
    housePin.onLine = true;
  }

  let customers: CustomerMapPin[] = [];
  if (customersLimit > 0) {
    const orders = await prisma.order.findMany({
      where: {
        status: 'OPEN',
        // The board's rule: an order whose dates have passed is not shown.
        desiredEndDate: { gte: new Date(now.getTime() - DAY_MS) },
        location: { isNot: null },
      },
      select: {
        id: true,
        contactName: true,
        category: { select: { name: true } },
        customer: { select: { name: true } },
        location: { select: { latitude: true, longitude: true, city: true, addressLine: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: ORDER_SCAN,
    });
    const all = toCustomerPins(orders);
    // An order known by its city only is placed at the city's centre, which the
    // SQL box cannot see; the box is applied here instead.
    customers = nearestPins(
      bbox ? all.filter((pin) => inBbox(pin, bbox)) : all,
      around,
      customersLimit,
    );
  }

  return { providers: pins, customers };
}
