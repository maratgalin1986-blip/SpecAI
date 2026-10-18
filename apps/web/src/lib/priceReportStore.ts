// The server side of the price survey (lib/priceReports.ts): who the reporter
// is (a keyed hash — the IP, the Telegram chat or the account never stored as
// such), the database limit, the save and the answer with the colleagues'
// prices (lib/priceIndex.ts, the reporter's own answer left out).
import { prisma } from '@specai/database';
import { categoryName } from '@specai/shared';
import { lookupPrice, lookupText, type PriceLookup } from './priceIndex';
import { loadPriceIndex } from './priceIndexData';
import { companyReporter } from './reporterHash';
import {
  ADMIN_PRICE_REPORT_SELECT,
  PRICE_SURVEY_DB_LIMIT,
  reporterKey,
  type AdminPriceReport,
  type PriceReportSource,
} from './priceReports';

export { reporterHash } from './reporterHash';

/** Too many answers from this reporter in the last hour (all server instances). */
export async function reporterLimited(hash: string, now: Date = new Date()): Promise<boolean> {
  const count = await prisma.priceReport.count({
    where: { reporterHash: hash, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
  });
  return count >= PRICE_SURVEY_DB_LIMIT;
}

export interface SurveyAnswer {
  /** The sentence shown back (lib/priceIndex.ts lookupText). */
  text: string;
  /** Only the aggregate: no names, ids or single prices of anyone. */
  index: PriceLookup | null;
}

/**
 * The colleagues' prices for a category and city, without the reporter's own
 * answers and, for a signed-in provider, without his company's machines.
 */
export async function surveyAnswer(
  categorySlug: string,
  place: { city: string; region: string | null },
  hash: string,
  companyId?: string | null,
  networkHash?: string | null,
): Promise<SurveyAnswer> {
  // The cached index is enough: the reporter's own answers are left out anyway.
  const { points } = await loadPriceIndex();
  const exclude = [reporterKey({ id: '', reporterHash: hash, networkHash })];
  if (networkHash) exclude.push(reporterKey({ id: '', reporterHash: hash }));
  if (companyId) exclude.push(companyReporter(companyId));
  const index = lookupPrice(points, categorySlug, place, exclude);
  return { text: lookupText(index, categoryName(categorySlug)), index };
}

export async function savePriceReport(
  data: {
    categorySlug: string;
    city: string;
    region: string | null;
    hourlyRate: number;
    companyName?: string | null;
    contactName?: string | null;
    phone?: string | null;
    wantsOrders?: boolean;
    consentAt?: Date | null;
    surveyKey?: string | null;
  },
  source: PriceReportSource,
  hash: string,
  networkHash: string | null = null,
) {
  return prisma.priceReport.create({
    data: { ...data, source, reporterHash: hash, networkHash },
    select: { id: true, createdAt: true },
  });
}

/** /admin «Опрос цен»: the latest answers and the week's count. */
export async function loadAdminPriceReports(take = 30, now: Date = new Date()) {
  const [reports, week, total] = await Promise.all([
    prisma.priceReport.findMany({
      select: ADMIN_PRICE_REPORT_SELECT,
      orderBy: { createdAt: 'desc' },
      take,
    }) as Promise<AdminPriceReport[]>,
    prisma.priceReport.count({
      where: { createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
    }),
    prisma.priceReport.count(),
  ]);
  return { reports, week, total };
}
