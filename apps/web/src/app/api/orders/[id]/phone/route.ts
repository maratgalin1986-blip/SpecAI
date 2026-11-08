import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { checkRateLimit } from '@/lib/rateLimit';
import { isHouseManager } from '@/lib/fleet';
import { isEmailConfigured } from '@/lib/email';
import { notifyTelegram } from '@/lib/notify';
import {
  DAY_MS,
  HOUR_MS,
  companyRevealLimit,
  revealAlertText,
  revealDecision,
  revealNote,
} from '@/lib/chatOrders';

export const dynamic = 'force-dynamic';

/**
 * «Показать телефон» на заявке из открытого чата: только для исполнителя,
 * каждый показ записывается (кто, когда), не больше companyRevealLimit разных
 * заявок в сутки на компанию (5 — новой или непроверенной) и
 * CHAT_PHONE_REVEALS_PER_USER_PER_DAY на сотрудника; больше
 * REVEAL_ALERT_PER_HOUR показов за час — тревога владельцу в Telegram.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getRequestUser(request);
  // Bursts from one account (a script) are cut before any database work.
  if (user) {
    const burst = checkRateLimit(`phone-reveal:${user.id}`, { limit: 10, windowMs: 60_000 });
    if (!burst.ok) {
      return NextResponse.json(
        { error: 'Слишком часто. Попробуйте через минуту' },
        { status: 429, headers: { 'Retry-After': String(burst.retryAfterSec) } },
      );
    }
  }

  const companyId = user?.companyId ?? null;
  const [order, account, company] = await Promise.all([
    prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true, source: true, status: true, contactPhone: true, contactName: true },
    }),
    user
      ? prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } })
      : Promise.resolve(null),
    companyId
      ? prisma.company.findUnique({
          where: { id: companyId },
          select: { name: true, verified: true, createdAt: true },
        })
      : Promise.resolve(null),
  ]);

  const now = Date.now();
  const since = new Date(now - DAY_MS);
  const [alreadyRevealed, revealedToday, revealedTodayByUser, revealedThisHour] =
    user && companyId && order
      ? await Promise.all([
          prisma.contactReveal.findFirst({
            where: { orderId: order.id, companyId },
            select: { id: true },
          }),
          prisma.contactReveal.findMany({
            where: { companyId, createdAt: { gte: since } },
            distinct: ['orderId'],
            select: { orderId: true },
          }),
          prisma.contactReveal.findMany({
            where: { userId: user.id, createdAt: { gte: since } },
            distinct: ['orderId'],
            select: { orderId: true },
          }),
          prisma.contactReveal.count({
            where: { companyId, createdAt: { gte: new Date(now - HOUR_MS) } },
          }),
        ])
      : [null, [], [], 0];

  const house = isHouseManager(user);
  const decision = revealDecision({
    viewer: user
      ? {
          userId: user.id,
          role: user.role,
          companyId,
          emailVerified: Boolean(account?.emailVerified),
        }
      : null,
    order,
    alreadyRevealed: Boolean(alreadyRevealed),
    // The house fleet works guest and chat leads itself: logged, not limited.
    revealsToday: house ? 0 : revealedToday.length,
    revealsTodayByUser: house ? 0 : revealedTodayByUser.length,
    companyLimit: companyRevealLimit(company, new Date(now)),
    requireVerifiedEmail: isEmailConfigured(),
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  // Every reveal is logged, repeats too (they just do not count toward the limit).
  await prisma.contactReveal.create({
    data: { orderId: order!.id, userId: user!.id, companyId },
  });
  // A harvesting pace from one company: the owner hears of it once per hour.
  const alert =
    !house && companyId
      ? revealAlertText({
          companyName: company?.name ?? companyId,
          companyId,
          hourCount: revealedThisHour + 1,
        })
      : null;
  if (alert) {
    void notifyTelegram(alert).catch((error) =>
      console.error('[phone] reveal alert failed', error),
    );
  }
  return NextResponse.json({
    phone: order!.contactPhone,
    name: order!.contactName,
    note: revealNote(order!.source),
  });
}
