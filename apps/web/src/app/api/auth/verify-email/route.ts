import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { authOptions } from '@/lib/auth';
import { consumeToken } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

const schema = z.object({ token: z.string().min(1).max(256) });

/**
 * Ссылка из письма (GET) ничего не подтверждает — почтовые сканеры переходят по ней
 * до пользователя. Просто ведём на страницу с кнопкой, которая делает POST.
 */
export function GET(request: NextRequest) {
  const url = new URL('/verify-email', request.nextUrl.origin);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url);
}

/** Подтверждает email по одноразовому токену. Ответ: { ok, redirectTo, message? }. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  const session = await getServerSession(authOptions);
  const target = session ? '/dashboard' : '/login';

  const userId = parsed.success ? await consumeToken(parsed.data.token, 'EMAIL_VERIFY') : null;
  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        redirectTo: `${target}?verified=0`,
        error: 'Ссылка недействительна или устарела',
      },
      { status: 400 },
    );
  }

  await prisma.user.updateMany({
    where: { id: userId, emailVerified: null },
    data: { emailVerified: new Date() },
  });

  // Токен принадлежит другому аккаунту, чем текущая сессия: не ведём в чужой кабинет.
  if (session && session.user.id !== userId) {
    return NextResponse.json({
      ok: true,
      redirectTo: '/login?verified=1',
      message: 'Email подтверждён для другого аккаунта, войдите в него',
    });
  }

  return NextResponse.json({ ok: true, redirectTo: `${target}?verified=1` });
}
