import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createLeadSchema } from '@specai/shared';
import { notifyTelegram } from '@/lib/notify';
import { checkRateLimit } from '@/lib/rateLimit';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

// Best-effort flood protection (per server instance).
const LEAD_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Проверьте имя, телефон и согласие на обработку данных' },
      { status: 400 },
    );
  }

  // Bots that fill the honeypot get a fake success.
  if (parsed.data.website) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`leads:${ip}`, LEAD_RATE_LIMIT).ok) {
    return NextResponse.json(
      { error: `Слишком много заявок. Позвоните нам: ${SITE.phone}` },
      { status: 429 },
    );
  }

  const lead = await prisma.lead.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      message: parsed.data.message || null,
      source: parsed.data.source || null,
    },
  });

  await notifyTelegram(
    [
      `📞 Новая заявка на звонок — ${SITE.name}`,
      `Имя: ${lead.name}`,
      `Телефон: ${lead.phone}`,
      lead.message ? `Сообщение: ${lead.message}` : null,
      lead.source ? `Откуда: ${lead.source}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
