import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { checkRateLimit } from '@/lib/rateLimit';
import { sendVerificationEmail } from '@/lib/verificationEmail';
import { SITE } from '@/lib/site';

const RATE_LIMIT = { limit: 5, windowMs: 60 * 60_000 };

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const rate = checkRateLimit(`send-verification:${user.id}`, RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов, попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  const result = await sendVerificationEmail(user);
  if (result.skipped) {
    // E-mail is not configured: say so instead of pretending the letter went out.
    return NextResponse.json(
      { error: `Отправка писем временно недоступна. Позвоните нам: ${SITE.phone}` },
      { status: 503 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ error: 'Не удалось отправить письмо' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
