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
  // Bots that fill the honeypot get a fake success before validation, so they
  // cannot tell the trap from a real form.
  if (body && typeof body === 'object' && typeof body.website === 'string' && body.website) {
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

  const lead = {
    name: parsed.data.name,
    phone: parsed.data.phone,
    message: parsed.data.message || null,
    source: parsed.data.source || null,
  };
  const lines = [
    `Имя: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    lead.message ? `Сообщение: ${lead.message}` : null,
    lead.source ? `Откуда: ${lead.source}` : null,
  ];

  try {
    await prisma.lead.create({ data: { ...lead, ymClientId: parsed.data.ymClientId ?? null } });
  } catch (error) {
    // The database is down: the lead must still reach the owner.
    console.error('[leads] failed to save lead', error);
    const delivered = await notifyTelegram(
      [`⚠️ Заявка на звонок — БАЗА НЕДОСТУПНА, заявка только здесь`, ...lines]
        .filter(Boolean)
        .join('\n'),
    );
    if (delivered) return NextResponse.json({ ok: true }, { status: 202 });
    return NextResponse.json(
      { error: `Не удалось отправить заявку. Позвоните нам: ${SITE.phone}` },
      { status: 503 },
    );
  }

  await notifyTelegram(
    [`📞 Новая заявка на звонок — ${SITE.name}`, ...lines].filter(Boolean).join('\n'),
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
