import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson } from '@/lib/apiInput';
import { isExpoPushToken } from '@/lib/notifications/adapters';

export const dynamic = 'force-dynamic';

const MAX_DEVICES = 10;

function readToken(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const token = (body as Record<string, unknown>).token;
  return isExpoPushToken(token) ? token : null;
}

/**
 * Приложение регистрирует Expo push-токен устройства (Bearer):
 * { token: "ExponentPushToken[…]", platform?: "ios" | "android" }.
 * Токен, ранее принадлежавший другому аккаунту на этом устройстве, переходит к текущему.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const token = readToken(body);
  if (!token) return NextResponse.json({ error: 'Неверный push-токен' }, { status: 400 });
  const rawPlatform = (body as Record<string, unknown>).platform;
  const platform =
    typeof rawPlatform === 'string' && /^(ios|android|web)$/.test(rawPlatform) ? rawPlatform : null;

  await prisma.pushToken.upsert({
    where: { token },
    update: { userId: user.id, platform },
    create: { token, userId: user.id, platform },
  });
  // Keep the newest devices only.
  const stale = await prisma.pushToken.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    skip: MAX_DEVICES,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.pushToken.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  }
  return NextResponse.json({ ok: true });
}

/** Выход из аккаунта в приложении: { token } больше не получает уведомления. */
export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  const token = readToken(await readJson(request));
  if (!token) return NextResponse.json({ error: 'Неверный push-токен' }, { status: 400 });
  await prisma.pushToken.deleteMany({ where: { token, userId: user.id } });
  return NextResponse.json({ ok: true });
}
