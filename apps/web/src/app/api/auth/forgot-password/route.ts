import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { checkRateLimit } from '@/lib/rateLimit';
import { createToken } from '@/lib/tokens';
import { sendEmail } from '@/lib/email';
import { getEmailBaseUrl, passwordReset } from '@/lib/emailTemplates';

const RATE_LIMIT = { limit: 5, windowMs: 60 * 60_000 };
const TOKEN_TTL_MINUTES = 60;

const schema = z.object({ email: z.string().trim().email().max(254) });

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Укажите корректный e-mail' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const rate = checkRateLimit(`forgot-password:${email}:${clientIp(request)}`, RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов, попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  // Всегда 200: не раскрываем, существует ли аккаунт с таким e-mail.
  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true },
    });
    if (user) {
      const token = await createToken(user.id, 'PASSWORD_RESET', TOKEN_TTL_MINUTES);
      const resetUrl = `${getEmailBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      await sendEmail({ to: user.email, ...passwordReset({ resetUrl }) });
    }
  } catch (error) {
    console.error('[auth] forgot-password failed', error);
  }

  return NextResponse.json({ ok: true });
}
