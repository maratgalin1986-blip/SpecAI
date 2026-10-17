import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { referralLink } from '@/lib/referral';
import { ensureReferralCode } from '@/lib/referralStore';
import { siteUrl } from '@/lib/siteUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Текущий пользователь по Bearer-токену (или веб-сессии). Для заказчика и
 * исполнителя — ещё «Пригласи друга»: своя ссылка, сколько человек по ней
 * зарегистрировались и до какого момента действует бонус priorityUntil
 * (lib/referralPriority.ts). Только свои данные.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  const invites = user.role === 'CUSTOMER' || user.role === 'PROVIDER_ADMIN';
  const [details, code, invited] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerified: true, priorityUntil: true },
    }),
    invites ? ensureReferralCode(user.id).catch(() => null) : Promise.resolve(null),
    invites
      ? prisma.user.count({ where: { referredById: user.id } }).catch(() => null)
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: details?.emailVerified ?? null,
      priorityUntil: details?.priorityUntil ?? null,
      referralLink: code ? referralLink(siteUrl(), code) : null,
      invited,
    },
  });
}
