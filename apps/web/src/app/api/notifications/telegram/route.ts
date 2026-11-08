import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/requestUser';
import { checkRateLimit } from '@/lib/rateLimit';
import { startTelegramLink, unlinkTelegram } from '@/lib/notifications/telegramLink';

export const dynamic = 'force-dynamic';

/**
 * Одноразовая ссылка https://t.me/<бот>?start=<токен> (15 минут). Пользователь
 * открывает её и жмёт «Старт» — вебхук бота привязывает чат к аккаунту.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  const rate = checkRateLimit(`telegram-link:${user.id}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }
  const link = await startTelegramLink(user.id);
  if (!link) {
    return NextResponse.json(
      { error: 'Telegram-бот ещё не подключён на сервере' },
      { status: 503 },
    );
  }
  return NextResponse.json({ url: link.url, expiresAt: link.expiresAt.toISOString() });
}

/** Отвязать Telegram. */
export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  await unlinkTelegram(user.id);
  return NextResponse.json({ ok: true });
}
