// «Цены на рынке»: the live data of lib/priceIndex.ts — other providers'
// published machines and the survey answers of the last half year. Read once
// for a few minutes per server instance (the pages revalidate hourly).
import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import { cityByName, findCityInText, RUSSIAN_CITIES, type RussianCity } from '@specai/shared';
import { kmBetween } from './cities';
import { buildPriceIndex, type PriceIndex, type PricePoint } from './priceIndex';
import { reporterKey } from './priceReports';
import { companyReporter } from './reporterHash';
import { SHIFT_HOURS } from './prices';

/** A provider's base this close to a city's centre counts as in that city. */
export const HOME_CITY_KM = 40;
/** Survey answers older than this no longer count. */
export const REPORT_MAX_AGE_DAYS = 180;
const ROWS = 5000;

type Amount = number | string | { toString(): string } | null | undefined;
const toNumber = (value: Amount): number | null => {
  if (value === null || value === undefined) return null;
  const number = Number(value.toString());
  return Number.isFinite(number) && number > 0 ? number : null;
};

/** The hourly price a customer sees for another provider's machine (customerRates' rule). */
export function hourlyOf(item: { hourlyRate?: Amount; dailyRate?: Amount }): number | null {
  const hour = toNumber(item.hourlyRate);
  if (hour !== null) return hour;
  const shift = toNumber(item.dailyRate);
  return shift !== null ? shift / SHIFT_HOURS : null;
}

/**
 * The city a provider's machine works from: the nearest known city within
 * HOME_CITY_KM of the company's base (or the machine's own point), else the
 * city its location or the company's base address names. Null when unknown —
 * the machine then counts only Russia-wide.
 */
export function homeCity(row: {
  company?: { baseLat: number | null; baseLon: number | null; baseAddress?: string | null } | null;
  location?: { city?: string | null; latitude?: number | null; longitude?: number | null } | null;
}): RussianCity | null {
  const point =
    row.company?.baseLat != null && row.company.baseLon != null
      ? { lat: row.company.baseLat, lon: row.company.baseLon }
      : row.location?.latitude != null && row.location.longitude != null
        ? { lat: row.location.latitude, lon: row.location.longitude }
        : null;
  if (point) {
    let best: { city: RussianCity; km: number } | null = null;
    for (const city of RUSSIAN_CITIES) {
      const km = kmBetween(point, city);
      if (km <= HOME_CITY_KM && (!best || km < best.km)) best = { city, km };
    }
    if (best) return best.city;
  }
  return (
    cityByName(row.location?.city) ??
    findCityInText(row.company?.baseAddress, { address: true })?.city ??
    null
  );
}

export interface LoadedIndex {
  points: PricePoint[];
  index: PriceIndex;
  updatedAt: Date;
  /** False when the database could not be read (the page says so, no numbers). */
  loaded: boolean;
}

async function queryPoints(now: Date): Promise<PricePoint[]> {
  const since = new Date(now.getTime() - REPORT_MAX_AGE_DAYS * 86_400_000);
  const [machines, reports] = await Promise.all([
    prisma.equipment.findMany({
      where: {
        company: { isProvider: true },
        companyId: { not: HOUSE_COMPANY_ID },
        status: { not: 'RETIRED' },
      },
      select: {
        companyId: true,
        hourlyRate: true,
        dailyRate: true,
        category: { select: { slug: true } },
        company: { select: { baseLat: true, baseLon: true, baseAddress: true } },
        location: { select: { city: true, latitude: true, longitude: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: ROWS,
    }),
    prisma.priceReport.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        categorySlug: true,
        city: true,
        region: true,
        hourlyRate: true,
        reporterHash: true,
        networkHash: true,
      },
      orderBy: { createdAt: 'desc' },
      take: ROWS,
    }),
  ]);
  const points: PricePoint[] = [];
  for (const machine of machines) {
    const hourly = hourlyOf(machine);
    if (hourly === null) continue;
    const city = homeCity(machine);
    points.push({
      categorySlug: machine.category.slug,
      reporter: companyReporter(machine.companyId),
      hourly,
      city: city?.name ?? null,
      region: city?.region ?? null,
    });
  }
  // One answer per participant, kind of machinery and city: the newest
  // (the rows come newest first).
  const seen = new Set<string>();
  for (const report of reports) {
    // A group reply without a known machine type or an hourly price (a shift
    // price only) is the owner's data, not a number of the index.
    if (!report.categorySlug || report.hourlyRate === null) continue;
    const reporter = reporterKey(report);
    const dedupe = `${reporter}|${report.categorySlug}|${report.city}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    points.push({
      categorySlug: report.categorySlug,
      reporter,
      hourly: report.hourlyRate,
      city: report.city,
      region: report.region,
    });
  }
  return points;
}

const MEMO_MS = 5 * 60_000;
let memo: { at: number; value: Promise<LoadedIndex> } | null = null;

/** For tests: read the database again. */
export function resetPriceIndexMemo() {
  memo = null;
}

/** The index from the live data; never throws (without a database: no numbers, `loaded: false`). */
export function loadPriceIndex(options: { fresh?: boolean } = {}): Promise<LoadedIndex> {
  if (!options.fresh && memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  const now = new Date();
  const value = queryPoints(now)
    .then((points) => ({ points, index: buildPriceIndex(points), updatedAt: now, loaded: true }))
    .catch((error: unknown) => {
      console.error('[price-index] could not load', error);
      return { points: [], index: buildPriceIndex([]), updatedAt: now, loaded: false };
    });
  memo = { at: Date.now(), value };
  // A failed read is not kept.
  void value.then((result) => {
    if (!result.loaded && memo?.value === value) memo = null;
  });
  return value;
}
