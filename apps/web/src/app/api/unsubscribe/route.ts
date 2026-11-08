import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { clientIp } from '@/lib/loginErrors';
import { newsUpdate } from '@/lib/newsConsent';
import { verifyUnsubscribeToken } from '@/lib/newsletter';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * One-click unsubscribe from «Заявки рядом за неделю». A public address
 * (REVIEW.md, §2): the person is identified by the signed link from their
 * letter (lib/newsletter.ts, an HMAC of their id), not by a session. Mail
 * clients POST `List-Unsubscribe=One-Click` here (RFC 8058); the /unsubscribe
 * page POSTs after the confirm button. The answer carries no id or e-mail.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? (await tokenFromBody(request));
  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    // Only bad tokens count: one-click POSTs come from a few mail-provider
    // servers, and a valid signed link must always work.
    if (!checkRateLimit(`unsubscribe:${clientIp(request)}`, { limit: 30, windowMs: 60_000 }).ok) {
      return NextResponse.json(
        { error: 'Слишком часто, попробуйте через минуту' },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: 'Ссылка для отписки недействительна. Отпишитесь в настройках уведомлений.' },
      { status: 400 },
    );
  }
  // Already unsubscribed (or the account is gone): still a success for the mail client.
  await prisma.user.updateMany({
    where: { id: userId, newsUnsubscribedAt: null },
    data: newsUpdate(false),
  });
  return NextResponse.json({ ok: true });
}

/** A link opened in the browser shows the confirm page; a GET never unsubscribes (link scanners). */
export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const target = new URL('/unsubscribe', request.nextUrl.origin);
  if (token) target.searchParams.set('t', token);
  return NextResponse.redirect(target, 303);
}

async function tokenFromBody(request: NextRequest): Promise<string | null> {
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const body = (await request.json()) as { t?: unknown } | null;
      return typeof body?.t === 'string' ? body.t : null;
    }
    if (type.includes('form')) {
      const value = (await request.formData()).get('t');
      return typeof value === 'string' ? value : null;
    }
  } catch {
    return null;
  }
  return null;
}
