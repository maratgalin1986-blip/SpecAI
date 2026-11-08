// Sends «Заявки рядом за неделю» from the weekly cron (api/cron/weekly), after
// its own work and within a time budget. The pure rules are in newsletter.ts.
import { prisma } from '@specai/database';
import { isEmailConfigured, sendEmail, type SendEmailInput, type SendEmailResult } from './email';
import { getEmailBaseUrl } from './emailTemplates';
import { distanceKm, orderPoint } from './geo';
import {
  buildNewsEmail,
  countNear,
  distinctMachines,
  NEWS_WINDOW_MS,
  newsBody,
  newsRecipientsWhere,
  newsSubscribersWhere,
  unsubscribeToken,
  type NationwideStats,
  type NewsContent,
} from './newsletter';
import { isRealEmail, type CategoryRow } from './notifications/routing';
import { incomingOrdersWhere, matchIncoming } from './providerFeed';
import { loadProviderForMatch } from './providerFeedData';

/** Letters per run: Resend's free plan allows 100 a day, the rest is for the day's own mail. */
export const NEWS_MAX_PER_RUN = 60;
/** Subscribers read from the database at a time (the least recently mailed first). */
export const NEWS_PAGE = 100;
/** Pages looked at per run at most. */
const NEWS_MAX_PAGES = 10;
/** Resend allows 2 requests a second; one letter at a time, no faster than this. */
export const NEWS_SEND_GAP_MS = 600;
/** A send that has not answered by then counts as failed (the function must end within maxDuration). */
export const NEWS_SEND_TIMEOUT_MS = 8_000;
/** Stop after this many failures in a row (a wrong key, a blocked domain, a quota, the database). */
export const NEWS_MAX_FAILURES = 3;
/** Rows loaded for the counters (provider bases, line rows, a company's candidate orders). */
const ROWS = 2000;

export interface NewsletterResult {
  sent: number;
  skipped: number;
  failed: number;
  stopped?: 'deadline' | 'limit' | 'errors' | 'not-configured';
}

export interface NewsletterOptions {
  now?: Date;
  /** Epoch ms after which no new letter starts. */
  deadline?: number;
  send?: (input: SendEmailInput) => Promise<SendEmailResult>;
  sleep?: (ms: number) => Promise<void>;
}

let loggedNotConfigured = false;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Recipient = Awaited<ReturnType<typeof loadPage>>[number];

function loadPage(now: Date, passed: string[]) {
  return prisma.user.findMany({
    where: {
      ...newsRecipientsWhere(now),
      // Looked at in this run and left alone (nothing to say, a failure):
      // the next page must not start with them again.
      ...(passed.length ? { id: { notIn: passed } } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      companyId: true,
      lastNewsAt: true,
      company: { select: { isProvider: true } },
    },
    orderBy: [{ lastNewsAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    take: NEWS_PAGE,
  });
}

export async function sendWeeklyNewsletter(
  options: NewsletterOptions = {},
): Promise<NewsletterResult> {
  const now = options.now ?? new Date();
  const deadline = options.deadline ?? now.getTime() + 40_000;
  const send = options.send ?? sendEmail;
  const sleep = options.sleep ?? realSleep;
  const result: NewsletterResult = { sent: 0, skipped: 0, failed: 0 };

  // Without Resend (or without the secret that signs the unsubscribe link)
  // nothing is sent and nobody is marked as mailed.
  if (!isEmailConfigured() || !unsubscribeToken('probe')) {
    if (!loggedNotConfigured) {
      console.info('[newsletter] skipped: RESEND_API_KEY/EMAIL_FROM or NEXTAUTH_SECRET is not set');
      loggedNotConfigured = true;
    }
    return { ...result, stopped: 'not-configured' };
  }

  const baseUrl = getEmailBaseUrl();
  const providerCache = new Map<string, Promise<NewsContent>>();
  const passed: string[] = [];
  let counters: Counters | null = null;
  let lastSend = 0;
  let failuresInRow = 0;

  for (let page = 0; page < NEWS_MAX_PAGES; page += 1) {
    const recipients = await loadPage(now, passed);
    if (recipients.length === 0) return result;
    counters ??= await loadCounters(now);
    const lastPoints = await loadLastOrderPoints(recipients);

    for (const user of recipients) {
      if (Date.now() >= deadline) return { ...result, stopped: 'deadline' };
      if (result.sent >= NEWS_MAX_PER_RUN) return { ...result, stopped: 'limit' };

      let outcome: 'sent' | 'skipped' | 'failed' | 'not-configured';
      try {
        outcome = await mailOne(user, {
          now,
          baseUrl,
          counters,
          lastPoints,
          providerCache,
          send,
          pace: async () => {
            const wait = lastSend + NEWS_SEND_GAP_MS - Date.now();
            if (wait > 0) await sleep(wait);
            lastSend = Date.now();
          },
        });
      } catch (error) {
        // One subscriber's database hiccup must not cost everyone after them.
        console.error('[newsletter] failed for one subscriber', error);
        outcome = 'failed';
      }

      if (outcome === 'sent') {
        result.sent += 1;
        failuresInRow = 0;
        continue;
      }
      passed.push(user.id);
      if (outcome === 'skipped') {
        result.skipped += 1;
        continue;
      }
      result.failed += 1;
      if (outcome === 'not-configured') return { ...result, stopped: 'not-configured' };
      failuresInRow += 1;
      if (failuresInRow >= NEWS_MAX_FAILURES) {
        console.error('[newsletter] stopped after repeated errors');
        return { ...result, stopped: 'errors' };
      }
    }
    if (recipients.length < NEWS_PAGE) return result;
  }
  return result;
}

interface MailContext {
  now: Date;
  baseUrl: string;
  counters: Counters;
  lastPoints: Map<string, { lat: number; lon: number }>;
  providerCache: Map<string, Promise<NewsContent>>;
  send: (input: SendEmailInput) => Promise<SendEmailResult>;
  pace: () => Promise<void>;
}

async function mailOne(
  user: Recipient,
  context: MailContext,
): Promise<'sent' | 'skipped' | 'failed' | 'not-configured'> {
  const token = unsubscribeToken(user.id);
  if (!token || !isRealEmail(user.email)) return 'skipped';

  let content: NewsContent;
  if (user.role === 'PROVIDER_ADMIN' && user.companyId && user.company?.isProvider) {
    const companyId = user.companyId;
    let cached = context.providerCache.get(companyId);
    if (!cached) {
      cached = providerContent(companyId, context.now, context.counters);
      // A failed load is not cached: the next manager of the company tries again.
      cached.catch(() => context.providerCache.delete(companyId));
      context.providerCache.set(companyId, cached);
    }
    content = await cached;
  } else {
    const point = context.lastPoints.get(user.id) ?? null;
    content = {
      kind: 'customer',
      near: point
        ? {
            providers: countNear(point, context.counters.providerBases, distanceKm),
            machinesOnLine: countNear(point, context.counters.machinesOnLine, distanceKm),
          }
        : null,
    };
  }
  const body = newsBody(content, context.counters.nationwide);
  if (!body) return 'skipped';

  // Claim the week for this user first: a second run at the same time (or a
  // retry) finds lastNewsAt fresh and skips them.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, ...newsRecipientsWhere(context.now) },
    data: { lastNewsAt: context.now },
  });
  if (claimed.count !== 1) return 'skipped';

  await context.pace();
  const letter = buildNewsEmail({ name: user.name, body, baseUrl: context.baseUrl, token });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), NEWS_SEND_TIMEOUT_MS);
  });
  const sending = context
    .send({ to: user.email, ...letter })
    .catch((error: unknown): SendEmailResult => ({
      skipped: false,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  const sent = await Promise.race([sending, timeout]).finally(() => clearTimeout(timer));
  // No answer in time: the letter may still go out, so the week stays
  // claimed (never two letters); the run just counts it as a failure.
  if (sent === 'timeout') {
    console.error('[newsletter] send timed out');
    return 'failed';
  }
  if (!sent.skipped && sent.ok) return 'sent';

  // Not sent: give the week back so the next run tries again.
  await prisma.user
    .updateMany({
      where: { id: user.id, lastNewsAt: context.now },
      data: { lastNewsAt: user.lastNewsAt },
    })
    .catch((error: unknown) => console.error('[newsletter] could not release', error));
  if (sent.skipped) return 'not-configured';
  console.error('[newsletter] send failed', { error: sent.error });
  return 'failed';
}

interface Counters {
  nationwide: NationwideStats;
  categoryRows: CategoryRow[];
  providerBases: { lat: number; lon: number }[];
  machinesOnLine: { lat: number; lon: number }[];
}

/** Everything shared by all letters of the run, loaded once. */
async function loadCounters(now: Date): Promise<Counters> {
  const weekAgo = new Date(now.getTime() - NEWS_WINDOW_MS);
  const withMachines = { equipment: { some: { status: { not: 'RETIRED' as const } } } };
  const [newOrders, providers, bases, line, categoryRows] = await Promise.all([
    prisma.order.count({
      where: { createdAt: { gte: weekAgo }, status: { in: ['OPEN', 'MATCHED'] } },
    }),
    prisma.company.count({ where: { isProvider: true, ...withMachines } }),
    prisma.company.findMany({
      where: { isProvider: true, baseLat: { not: null }, baseLon: { not: null }, ...withMachines },
      select: { baseLat: true, baseLon: true },
      orderBy: { createdAt: 'desc' },
      take: ROWS,
    }),
    // On the line this week: went online in it, or still online and reporting.
    prisma.linePresence.findMany({
      where: {
        OR: [{ onlineSince: { gte: weekAgo } }, { online: true, updatedAt: { gte: weekAgo } }],
      },
      select: { userId: true, equipmentId: true, lat: true, lon: true },
      orderBy: { updatedAt: 'desc' },
      take: ROWS,
    }),
    prisma.equipmentCategory.findMany({ select: { id: true, slug: true, parentId: true } }),
  ]);
  const machines = distinctMachines(line);
  return {
    nationwide: { newOrders, providers, machinesOnLine: machines.length },
    categoryRows,
    providerBases: bases.map((row) => ({ lat: row.baseLat as number, lon: row.baseLon as number })),
    machinesOnLine: machines.map((row) => ({ lat: row.lat, lon: row.lon })),
  };
}

/**
 * Orders of the week the company's machinery can take within its radius and
 * that still wait for its price: the cabinet's «Входящие заявки» rule
 * (incomingOrdersWhere + matchIncoming), limited to the last 7 days.
 */
async function providerContent(
  companyId: string,
  now: Date,
  counters: Counters,
): Promise<NewsContent> {
  const provider = await loadProviderForMatch(companyId);
  if (provider.categoryIds.length === 0) {
    return { kind: 'provider', hasMachines: false, matched: 0 };
  }
  const candidates = await prisma.order.findMany({
    where: {
      ...incomingOrdersWhere(companyId, now),
      createdAt: { gte: new Date(now.getTime() - NEWS_WINDOW_MS) },
    },
    select: {
      categoryId: true,
      location: { select: { latitude: true, longitude: true, city: true, addressLine: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: ROWS,
  });
  const matched = matchIncoming(provider, counters.categoryRows, candidates).length;
  return { kind: 'provider', hasMachines: true, matched };
}

/** Where each customer of the page last ordered: the newest order with a place, two queries per page. */
async function loadLastOrderPoints(recipients: readonly Recipient[]) {
  const customers = recipients
    .filter((user) => !(user.role === 'PROVIDER_ADMIN' && user.company?.isProvider))
    .map((user) => user.id);
  const points = new Map<string, { lat: number; lon: number }>();
  if (customers.length === 0) return points;
  const where = { customerId: { in: customers }, locationId: { not: null } };
  const latest = await prisma.order.groupBy({
    by: ['customerId'],
    where,
    _max: { createdAt: true },
    orderBy: { customerId: 'asc' },
    take: customers.length,
  });
  const pairs = latest.flatMap((row) =>
    row._max.createdAt ? [{ customerId: row.customerId, createdAt: row._max.createdAt }] : [],
  );
  if (pairs.length === 0) return points;
  const orders = await prisma.order.findMany({
    where: { ...where, OR: pairs },
    select: {
      customerId: true,
      location: { select: { latitude: true, longitude: true, city: true, addressLine: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: pairs.length * 2,
  });
  for (const order of orders) {
    if (points.has(order.customerId)) continue;
    const point = orderPoint(order.location);
    if (point) points.set(order.customerId, point);
  }
  return points;
}

/** Owner's counters (/admin): subscribers now and letters sent in the last 7 days. */
export async function newsletterAdminCounts(now: Date = new Date()) {
  const [subscribers, sentWeek] = await Promise.all([
    prisma.user.count({ where: newsSubscribersWhere() }),
    prisma.user.count({
      where: { lastNewsAt: { gte: new Date(now.getTime() - NEWS_WINDOW_MS) } },
    }),
  ]);
  return { subscribers, sentWeek };
}
