// «Спрос рядом»: the database side of lib/demandNudge.ts — the daily
// «Сегодня N заявок рядом — выйдите на линию» from api/cron/notices
// (time-budgeted, once a Moscow day per user, 09:00–20:00) and the switch in
// «Уведомления». Only PROVIDER_ADMIN users of provider companies with
// machinery, never СпецПласт16's own fleet (the owner sees every order).
import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import { countNearbyOrders, demandNudgeDue, inDemandWindow, mskDayStart } from './demandNudge';
import { orderPoint } from './geo';
import { isOnLine, PRESENCE_FRESH_MS } from './linePresence';
import { notifyUser } from './notifications/notifyUser';
import { acceptedCategoryIds, type OrderForMatch } from './notifications/routing';
import type { DeliveryReport } from './notifications/deliver';

/** Today's open orders read per run at most (the newest). */
export const DEMAND_ORDERS_TAKE = 500;
/** Provider companies read per run at most. */
export const DEMAND_COMPANIES_TAKE = 1000;
/** Messages per run at most (Telegram allows ~30 a second; push is batched by Expo). */
export const DEMAND_MAX_PER_RUN = 300;
/** Sent at once: each one is a few HTTP calls (Telegram, Expo). */
const DEMAND_BATCH = 10;
/** A message not delivered by then counts as failed: the cron must end within maxDuration. */
export const DEMAND_SEND_TIMEOUT_MS = 8_000;

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export type DemandNudgeResult =
  /** Outside 09:00–20:00 Moscow time: nothing is read or sent. */
  | { skipped: 'window' }
  | {
      /** Today's open orders considered. */
      orders: number;
      sent: number;
      /** Due a message but on the line, switched off, already told today or unreachable. */
      skipped: number;
      failed: number;
      stopped?: 'deadline' | 'limit';
    };

export interface DemandNudgeOptions {
  now?: Date;
  /** Epoch ms after which no new message starts. */
  deadline?: number;
  notify?: (userId: string, count: number) => Promise<DeliveryReport>;
  /** Messages per run (DEMAND_MAX_PER_RUN; smaller in tests). */
  maxPerRun?: number;
}

/**
 * Claims today's message for the user: demandNudgeSentAt moves to `now` only
 * if the user did not switch the message off and was not told since 00:00
 * Moscow time. A user without a settings row gets one (the defaults); a
 * second run creating it at the same time loses on the unique userId. A
 * repeated cron call therefore never sends a second message the same day.
 */
export async function claimDemandNudge(userId: string, now: Date): Promise<boolean> {
  const dayStart = mskDayStart(now);
  const updated = await prisma.notificationSettings.updateMany({
    where: {
      userId,
      demandNudge: true,
      OR: [{ demandNudgeSentAt: null }, { demandNudgeSentAt: { lt: dayStart } }],
    },
    data: { demandNudgeSentAt: now },
  });
  if (updated.count === 1) return true;
  const exists = await prisma.notificationSettings.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (exists) return false;
  return prisma.notificationSettings
    .create({ data: { userId, demandNudgeSentAt: now } })
    .then(() => true)
    .catch(() => false);
}

/** Gives the day back when nothing could be delivered because of errors. */
async function releaseDemandNudge(userId: string, now: Date, previous: Date | null) {
  await prisma.notificationSettings
    .updateMany({
      where: { userId, demandNudgeSentAt: now },
      data: { demandNudgeSentAt: previous },
    })
    .catch((error: unknown) => console.error('[demand-nudge] could not release', error));
}

/**
 * The daily «Сегодня N заявок рядом» from api/cron/notices. N is the number
 * of today's OPEN orders (since 00:00 Moscow) that the company would be
 * alerted about (providerMatchesOrder, as matchOrderRecipients does), minus
 * the ones its own managers placed. N = 0 sends nothing; a manager who is on
 * the line now is not told. Stops starting new messages at `deadline` and
 * after DEMAND_MAX_PER_RUN; the next call goes on with those not told yet
 * (the claimed ones drop out).
 */
export async function sendDemandNudges(
  options: DemandNudgeOptions = {},
): Promise<DemandNudgeResult> {
  const now = options.now ?? new Date();
  if (!inDemandWindow(now)) return { skipped: 'window' };
  const deadline = options.deadline ?? now.getTime() + 20_000;
  const notify =
    options.notify ??
    ((userId: string, count: number) => notifyUser(userId, { type: 'demand.today', count }));
  const maxPerRun = options.maxPerRun ?? DEMAND_MAX_PER_RUN;

  const orderRows = await prisma.order.findMany({
    where: { status: 'OPEN', createdAt: { gte: mskDayStart(now) } },
    select: {
      categoryId: true,
      customer: { select: { companyId: true } },
      location: { select: { latitude: true, longitude: true, city: true, addressLine: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: DEMAND_ORDERS_TAKE,
  });
  const result = { orders: orderRows.length, sent: 0, skipped: 0, failed: 0 };
  if (orderRows.length === 0) return result;
  if (Date.now() >= deadline) return { ...result, stopped: 'deadline' };

  const [companies, categoryRows] = await Promise.all([
    prisma.company.findMany({
      where: {
        isProvider: true,
        id: { not: HOUSE_COMPANY_ID },
        equipment: { some: { status: { not: 'RETIRED' } } },
      },
      select: {
        id: true,
        baseLat: true,
        baseLon: true,
        baseAddress: true,
        deliveryRadiusKm: true,
        equipment: {
          where: { status: { not: 'RETIRED' } },
          select: { categoryId: true },
          distinct: ['categoryId'],
        },
        users: {
          where: { role: 'PROVIDER_ADMIN' },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 20,
        },
      },
      orderBy: { id: 'asc' },
      take: DEMAND_COMPANIES_TAKE,
    }),
    prisma.equipmentCategory.findMany({
      select: { id: true, slug: true, parentId: true },
      orderBy: { id: 'asc' },
      take: 1000,
    }),
  ]);

  // The same target as the new-order alert (notifyUser.ts matchOrderRecipients).
  const orders = orderRows.map((order) => {
    const point = orderPoint(order.location);
    const target: OrderForMatch = {
      categoryId: order.categoryId,
      categoryIds: acceptedCategoryIds(order.categoryId, categoryRows),
      lat: point?.lat,
      lon: point?.lon,
      city: order.location?.city || null,
    };
    return { target, customerCompanyId: order.customer?.companyId ?? null };
  });

  const counts = new Map<string, number>();
  for (const company of companies) {
    if (company.users.length === 0) continue;
    const count = countNearbyOrders(
      {
        categoryIds: company.equipment.map((item) => item.categoryId),
        baseLat: company.baseLat,
        baseLon: company.baseLon,
        radiusKm: company.deliveryRadiusKm,
        baseAddress: company.baseAddress,
      },
      // Its own managers' orders are not demand for it.
      orders.filter((order) => order.customerCompanyId !== company.id).map((o) => o.target),
    );
    if (count === 0) continue;
    for (const user of company.users) if (!counts.has(user.id)) counts.set(user.id, count);
  }
  const userIds = [...counts.keys()];
  if (userIds.length === 0) return result;

  const [presence, settings] = await Promise.all([
    prisma.linePresence.findMany({
      where: {
        userId: { in: userIds },
        online: true,
        updatedAt: { gte: new Date(now.getTime() - PRESENCE_FRESH_MS) },
      },
      select: { userId: true, online: true, updatedAt: true, onlineSince: true, timeZone: true },
      orderBy: { userId: 'asc' },
      take: userIds.length,
    }),
    prisma.notificationSettings.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, demandNudge: true, demandNudgeSentAt: true },
      orderBy: { userId: 'asc' },
      take: userIds.length,
    }),
  ]);
  const onLine = new Set(presence.filter((row) => isOnLine(row, now)).map((row) => row.userId));
  const byUser = new Map(settings.map((row) => [row.userId, row]));
  const due = userIds.filter((userId) => {
    const row = byUser.get(userId);
    return (
      !onLine.has(userId) &&
      row?.demandNudge !== false &&
      demandNudgeDue(row?.demandNudgeSentAt, now)
    );
  });
  result.skipped += userIds.length - due.length;

  for (let i = 0; i < due.length;) {
    if (Date.now() >= deadline) return { ...result, stopped: 'deadline' };
    if (result.sent >= maxPerRun) return { ...result, stopped: 'limit' };
    const batch = due.slice(i, i + Math.min(DEMAND_BATCH, maxPerRun - result.sent));
    i += batch.length;
    const outcomes = await Promise.all(
      batch.map(async (userId) => {
        try {
          if (!(await claimDemandNudge(userId, now))) return 'skipped' as const;
          const report = await withTimeout(
            notify(userId, counts.get(userId)!),
            DEMAND_SEND_TIMEOUT_MS,
          );
          // No answer in time: it may still arrive, so the day stays claimed.
          if (report === 'timeout') return 'failed' as const;
          const results = Object.values(report);
          if (results.some((item) => item?.ok)) return 'sent' as const;
          // Neither the app nor Telegram is set up: the day stays claimed,
          // there is nothing to retry.
          if (results.length === 0) return 'skipped' as const;
          await releaseDemandNudge(userId, now, byUser.get(userId)?.demandNudgeSentAt ?? null);
          return 'failed' as const;
        } catch (error) {
          console.error('[demand-nudge] failed for one provider', error);
          return 'failed' as const;
        }
      }),
    );
    for (const outcome of outcomes) result[outcome] += 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

/** The daily message is on unless the user switched it off. */
export async function demandNudgeEnabled(userId: string): Promise<boolean> {
  const row = await prisma.notificationSettings.findUnique({
    where: { userId },
    select: { demandNudge: true },
  });
  return row?.demandNudge ?? true;
}

export async function setDemandNudge(userId: string, enabled: boolean): Promise<void> {
  await prisma.notificationSettings.upsert({
    where: { userId },
    update: { demandNudge: enabled },
    create: { userId, demandNudge: enabled },
  });
}
