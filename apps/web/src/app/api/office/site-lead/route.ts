import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { sendEmail } from '@/lib/email';
import { clientIp } from '@/lib/loginErrors';
import { notifyTelegram } from '@/lib/notify';
import { acceptSiteLead, SITE_LEAD_ERRORS } from '@/lib/office/siteLeads';
import { checkRateLimit } from '@/lib/rateLimit';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';

/** Тело формы — несколько коротких полей; больше этого не читаем. */
const MAX_BODY_LENGTH = 16_000;

/**
 * Заявка посетителя с опубликованного клиентского сайта «Сайты под ключ» (S4): публичный адрес
 * без входа (REVIEW.md §2, список исключений) — у посетителя чужого сайта нет аккаунта на
 * площадке. Ловушка для ботов, лимит по IP и не больше 50 заявок в сутки на сайт; заявка
 * уходит письмом компании и строкой владельцу. Ответ — только `{ ok: true }` или `{ error }`,
 * без id и данных компании. Вся логика — lib/office/siteLeads.ts.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text().catch(() => '');
  if (raw.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: SITE_LEAD_ERRORS.invalid }, { status: 400 });
  }
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  const outcome = await acceptSiteLead(
    {
      body,
      ip: clientIp(request),
      host: request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    },
    {
      db: prisma,
      sendEmail,
      notify: notifyTelegram,
      now: () => new Date(),
      rateLimit: checkRateLimit,
      baseUrl: siteUrl(),
    },
  );

  return NextResponse.json(outcome.body, {
    status: outcome.status,
    headers: {
      'Cache-Control': 'no-store',
      ...(outcome.retryAfterSec ? { 'Retry-After': String(outcome.retryAfterSec) } : {}),
    },
  });
}
