import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@specai/database';
import { emailSchema } from '@specai/shared';
import { checkRateLimit } from '@/lib/rateLimit';
import { generateRawToken, hashToken } from '@/lib/tokens';
import { sendEmail } from '@/lib/email';
import { getEmailBaseUrl, passwordReset } from '@/lib/emailTemplates';

const RATE_LIMIT = { limit: 5, windowMs: 60 * 60_000 };
const IP_RATE_LIMIT = { limit: 20, windowMs: 60 * 60_000 };
const TOKEN_TTL_MINUTES = 60;

const schema = z.object({ email: emailSchema });

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function tooManyRequests(retryAfterSec: number) {
  return NextResponse.json(
    { error: 'Слишком много запросов, попробуйте позже' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Укажите корректный e-mail' }, { status: 400 });
  }

  const email = parsed.data.email;
  const ip = clientIp(request);
  const ipRate = checkRateLimit(`forgot-password:ip:${ip}`, IP_RATE_LIMIT);
  if (!ipRate.ok) return tooManyRequests(ipRate.retryAfterSec);
  const rate = checkRateLimit(`forgot-password:${email}:${ip}`, RATE_LIMIT);
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec);

  // Всегда 200 и одинаковая работа в обеих ветках: не раскрываем существование аккаунта
  // ни ответом, ни задержкой. Письмо уходит в фоне, ответ его не ждёт.
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    if (user) {
      await prisma.verificationToken.create({
        data: {
          token: tokenHash,
          type: 'PASSWORD_RESET',
          userId: user.id,
          expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
        },
      });
      const resetUrl = `${getEmailBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
      void sendEmail({ to: user.email, ...passwordReset({ resetUrl }) }).catch((error) => {
        console.error('[auth] forgot-password email failed', error);
      });
    }
  } catch (error) {
    console.error('[auth] forgot-password failed', error);
  }

  return NextResponse.json({ ok: true });
}
