import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { checkRateLimit } from '@/lib/rateLimit';
import { isEmailConfigured } from '@/lib/email';
import { DAY_MS, revealDecision, revealNote } from '@/lib/chatOrders';

export const dynamic = 'force-dynamic';

/**
 * «Показать телефон» на заявке из открытого чата: только для исполнителя,
 * каждый показ записывается (кто, когда), не больше
 * CHAT_PHONE_REVEALS_PER_DAY разных заявок в сутки на компанию.
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

  const [order, account] = await Promise.all([
    prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true, source: true, status: true, contactPhone: true, contactName: true },
    }),
    user
      ? prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } })
      : Promise.resolve(null),
  ]);

  const since = new Date(Date.now() - DAY_MS);
  const companyId = user?.companyId ?? null;
  const [alreadyRevealed, revealedToday] =
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
        ])
      : [null, []];

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
    revealsToday: revealedToday.length,
    requireVerifiedEmail: isEmailConfigured(),
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  // Every reveal is logged, repeats too (they just do not count toward the limit).
  await prisma.contactReveal.create({
    data: { orderId: order!.id, userId: user!.id, companyId },
  });
  return NextResponse.json({
    phone: order!.contactPhone,
    name: order!.contactName,
    note: revealNote(order!.source),
  });
}
