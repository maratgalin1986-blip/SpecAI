import { prisma } from '@specai/database';
import { lineRenewToken, verifyLineRenewToken } from './lineRenew';
import { RENEW_OFFER_AHEAD_MS, renewedUntil, renewOfferDue, standingActive } from './lineStanding';
import { notifyUser } from './notifications/notifyUser';

/** Offers per cron run at most. */
export const RENEW_OFFERS_TAKE = 500;

/**
 * The daily cron (api/cron/daily, 19:00 Moscow): every standing line that
 * ends within RENEW_OFFER_AHEAD_MS gets «Продлить на 5 рабочих дней?» once per
 * period (renewOfferAt), through the provider's own channels.
 */
export async function sendLineRenewOffers(
  now: Date = new Date(),
): Promise<{ due: number; sent: number }> {
  const rows = await prisma.linePresence.findMany({
    where: {
      standingForever: false,
      standingUntil: { gt: now, lte: new Date(now.getTime() + RENEW_OFFER_AHEAD_MS) },
    },
    select: {
      id: true,
      userId: true,
      standingUntil: true,
      standingSince: true,
      renewOfferAt: true,
      timeZone: true,
      equipment: { select: { name: true } },
    },
    orderBy: { standingUntil: 'asc' },
    take: RENEW_OFFERS_TAKE,
  });
  const due = rows.filter((row) => renewOfferDue(row, now));
  let sent = 0;
  for (const row of due) {
    const until = row.standingUntil as Date;
    const token = lineRenewToken(row.id, until);
    if (!token) break; // No NEXTAUTH_SECRET: no link can be signed.
    // Claimed first, so a retried cron never sends twice.
    const claimed = await prisma.linePresence.updateMany({
      where: { id: row.id, standingUntil: until, renewOfferAt: row.renewOfferAt },
      data: { renewOfferAt: now },
    });
    if (claimed.count === 0) continue;
    await notifyUser(row.userId, {
      type: 'line.renew',
      until,
      timeZone: row.timeZone,
      equipmentName: row.equipment?.name ?? 'Ваша машина',
      token,
    });
    sent += 1;
  }
  return { due: due.length, sent };
}

export type RenewResult =
  | { ok: true; until: Date; timeZone: string | null; already: boolean; forever?: boolean }
  | { ok: false; reason: 'invalid' | 'gone' };

/**
 * One tap on the link: the period the token was signed for gets 5 more
 * working days after its end. A second tap (or a period already renewed)
 * answers with the current end and changes nothing.
 */
export async function renewLineByToken(
  token: unknown,
  now: Date = new Date(),
): Promise<RenewResult> {
  const parsed = verifyLineRenewToken(token);
  if (!parsed) return { ok: false, reason: 'invalid' };
  const row = await prisma.linePresence.findUnique({
    where: { id: parsed.presenceId },
    select: {
      id: true,
      standingUntil: true,
      standingForever: true,
      timeZone: true,
      equipmentId: true,
    },
  });
  if (!row || !row.equipmentId) return { ok: false, reason: 'gone' };
  const current = row.standingUntil?.getTime() ?? null;
  if (
    row.standingForever ||
    (current !== null && current !== parsed.untilMs && standingActive(row, now))
  ) {
    // Already renewed (or switched to «пока не отключу»): nothing to do.
    return {
      ok: true,
      until: row.standingUntil ?? new Date(parsed.untilMs),
      timeZone: row.timeZone,
      already: true,
      forever: row.standingForever,
    };
  }
  if (current !== parsed.untilMs) {
    // The provider switched the line off since: the link does not bring it back.
    return { ok: false, reason: 'gone' };
  }
  const until = renewedUntil(row, now, row.timeZone);
  const updated = await prisma.linePresence.updateMany({
    where: { id: row.id, standingUntil: row.standingUntil },
    data: { standingUntil: until, standingSince: now, renewOfferAt: null },
  });
  return { ok: true, until, timeZone: row.timeZone, already: updated.count === 0 };
}
