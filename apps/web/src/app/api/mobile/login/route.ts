import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithCredentials } from '@/lib/credentials';
import { signMobileToken } from '@/lib/mobileAuth';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Вход для мобильного приложения: та же проверка e-mail/пароля, что и на сайте,
 * но вместо cookie-сессии выдаётся JWT на 30 дней для заголовка Authorization.
 */
export async function POST(request: NextRequest) {
  const rate = checkRateLimit(`mobile:login:ip:${clientIp(request)}`, RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа, попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const user = await authenticateWithCredentials(body);
  if (!user) {
    return NextResponse.json({ error: 'Неверный e-mail или пароль' }, { status: 401 });
  }

  const token = await signMobileToken({ userId: user.id, role: user.role });

  return NextResponse.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
