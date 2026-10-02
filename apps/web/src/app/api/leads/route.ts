import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createLeadSchema } from '@specai/shared';
import { acceptLead } from '@/lib/leadIntake';
import { notifyTelegram } from '@/lib/notify';
import { checkRateLimit } from '@/lib/rateLimit';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

// Best-effort flood protection (per server instance).
const LEAD_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { website?: unknown } | null;
  // Bots that fill the honeypot get a fake success. Checked before the schema,
  // which rejects a filled field with 400 and would tell the bot it was caught.
  if (typeof body?.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Проверьте имя, телефон и согласие на обработку данных' },
      { status: 400 },
    );
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`leads:${ip}`, LEAD_RATE_LIMIT).ok) {
    return NextResponse.json(
      { error: `Слишком много заявок. Позвоните нам: ${SITE.phone}` },
      { status: 429 },
    );
  }

  const outcome = await acceptLead(
    {
      name: parsed.data.name,
      phone: parsed.data.phone,
      message: parsed.data.message || null,
      source: parsed.data.source || null,
    },
    {
      save: (data) => prisma.lead.create({ data }),
      notify: notifyTelegram,
      siteName: SITE.name,
      onSaveError: (error) => console.error('Lead was not saved to the database', error),
    },
  );

  if (outcome === 'lost') {
    return NextResponse.json(
      { error: `Не удалось отправить заявку. Позвоните нам: ${SITE.phone}` },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
