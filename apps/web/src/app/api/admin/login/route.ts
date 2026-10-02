import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminSessionValue, checkAdminPassword } from '@/lib/admin';
import { ADMIN_LOGIN_LIMIT, clientIpFrom } from '@/lib/loginErrors';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  // One shared password: limit guesses per IP (the delay below does not stop
  // parallel requests).
  const ip = clientIpFrom((name) => request.headers.get(name));
  const rate = checkRateLimit(`admin-login:${ip}`, ADMIN_LOGIN_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Подождите 15 минут и попробуйте снова' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';
  const session = adminSessionValue();
  if (!session || !checkAdminPassword(password)) {
    // Slow down password guessing.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
