// «Пригласи друга»: the new-order alert for the providers without the bonus,
// 5 minutes after the ones holding it (lib/notifications/notifyUser.ts set
// Order.othersNotifyAt). Vercel Hobby allows no frequent cron, so the flush
// rides on frequent requests — the app's «на линии» reports (PUT /api/line),
// the provider feed, Telegram updates — plus GET /api/cron/notices every
// 5 minutes (.github/workflows/order-notices.yml) and the daily cron. When
// nothing is due it costs one indexed query.
import { prisma } from '@specai/database';
import { matchOrderRecipients, notifyUsers, orderNewEvent } from '@/lib/notifications/notifyUser';

/** Orders handled per call at most, oldest first. */
export const FLUSH_BATCH = 20;

export interface FlushResult {
  /** Orders whose delayed alert was due and claimed by this call. */
  due: number;
  /** Of them, sent to the rest of the providers. */
  sent: number;
  /** Of them, no longer open: nobody is told. */
  skipped: number;
}

/**
 * Sends every due delayed alert once. Each order is claimed first
 * (othersNotifiedAt set only while still empty), so two calls at the same
 * moment never both send it; an order that is no longer OPEN is claimed and
 * skipped. The recipients are matched again now, with the same rule as the
 * first alert, minus the ones told early and minus the customer.
 */
export async function flushDeferredOrderNotices(
  now: Date = new Date(),
  limit: number = FLUSH_BATCH,
): Promise<FlushResult> {
  const result: FlushResult = { due: 0, sent: 0, skipped: 0 };
  const due = await prisma.order.findMany({
    where: { othersNotifiedAt: null, othersNotifyAt: { lte: now } },
    select: { id: true },
    orderBy: { othersNotifyAt: 'asc' },
    take: Math.max(1, Math.min(limit, FLUSH_BATCH)),
  });
  for (const { id } of due) {
    const claim = await prisma.order.updateMany({
      where: { id, othersNotifiedAt: null },
      data: { othersNotifiedAt: now },
    });
    if (claim.count === 0) continue; // another call took it
    result.due += 1;
    let matched: Awaited<ReturnType<typeof matchOrderRecipients>>;
    try {
      matched = await matchOrderRecipients(id, now);
    } catch (error) {
      // Nothing was sent yet: give the order back, the next tick retries it.
      console.error(`[notify] delayed alert for order ${id}: matching failed`, error);
      await prisma.order
        .updateMany({ where: { id, othersNotifiedAt: now }, data: { othersNotifiedAt: null } })
        .catch(() => undefined);
      result.due -= 1;
      continue;
    }
    if (!matched) {
      result.skipped += 1;
      continue;
    }
    const { order, recipients } = matched;
    const told = new Set([...order.earlyNotifiedUserIds, order.customerId]);
    const rest = recipients.map((item) => item.userId).filter((userId) => !told.has(userId));
    // notifyUsers never throws (each delivery catches its own errors), and
    // the claim stays: an alert is never sent twice.
    await notifyUsers(rest, orderNewEvent(order));
    result.sent += 1;
  }
  return result;
}

/** Orders a user-facing request (a phone report, the feed, a bot update) sends at most. */
export const REQUEST_TICK_LIMIT = 1;

/**
 * For the routes the flush rides on: never throws, never fails the caller.
 * Requests of people take one due order at a time, so a phone report never
 * waits on a long batch; the cron endpoint takes the full batch.
 */
export async function tickDeferredOrderNotices(
  source: string,
  limit: number = REQUEST_TICK_LIMIT,
): Promise<FlushResult | null> {
  try {
    return await flushDeferredOrderNotices(new Date(), limit);
  } catch (error) {
    console.error(`[notify] delayed alerts (${source}) failed`, error);
    return null;
  }
}
