import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/requestUser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Текущий пользователь по Bearer-токену (или веб-сессии). */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
