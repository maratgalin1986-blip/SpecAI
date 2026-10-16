import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithCredentials } from '@/lib/credentials';
import { signMobileToken } from '@/lib/mobileAuth';
import { isRateLimited, recordAttempt, resetRateLimit } from '@/lib/rateLimit';
import { LoginError, WRONG_CREDENTIALS_MESSAGE, loginFailure, clientIp } from '@/lib/loginErrors';

export const runtime = 'nodejs';

/** Неудачные входы с одного адреса за минуту (успешные не считаются). */
const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * Вход для мобильного приложения: та же проверка e-mail/пароля, что и на сайте,
 * но вместо cookie-сессии выдаётся JWT на 30 дней для заголовка Authorization.
 */
export async function POST(request: NextRequest) {
  const rateKey = `mobile:login:ip:${clientIp(request)}`;
  const rate = isRateLimited(rateKey, RATE_LIMIT);
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
    recordAttempt(rateKey, RATE_LIMIT);
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  let user: Awaited<ReturnType<typeof authenticateWithCredentials>>;
  try {
    user = await authenticateWithCredentials(body);
  } catch (error) {
    // Лимит попыток на e-mail → 429, база недоступна → 503 «Сервис временно недоступен».
    if (!(error instanceof LoginError)) throw error;
    const failure = loginFailure(error);
    return NextResponse.json(
      { error: failure.message },
      {
        status: failure.status,
        headers: error.retryAfterSec ? { 'Retry-After': String(error.retryAfterSec) } : undefined,
      },
    );
  }
  if (!user) {
    recordAttempt(rateKey, RATE_LIMIT);
    return NextResponse.json({ error: WRONG_CREDENTIALS_MESSAGE }, { status: 401 });
  }
  resetRateLimit(rateKey);

  const token = await signMobileToken({ userId: user.id, role: user.role });

  return NextResponse.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
