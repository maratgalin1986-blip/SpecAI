import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminSessionValue, checkAdminPassword } from '@/lib/admin';

export async function POST(request: NextRequest) {
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
