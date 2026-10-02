import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/requestUser';
import { checkRateLimit } from '@/lib/rateLimit';
import { notifyUser } from '@/lib/notifications/notifyUser';
import { CHANNEL_LABELS, type Channel } from '@/lib/notifications/routing';

export const dynamic = 'force-dynamic';

/** «Проверить»: тестовое уведомление во все выбранные каналы, с итогом по каждому. */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  const rate = checkRateLimit(`notify-test:${user.id}`, { limit: 3, windowMs: 10 * 60_000 });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Проверять можно не чаще 3 раз за 10 минут' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }
  const report = await notifyUser(user.id, { type: 'test' });
  const results = Object.entries(report).map(([channel, result]) => ({
    channel,
    label: CHANNEL_LABELS[channel as Channel],
    ok: Boolean(result?.ok),
  }));
  return NextResponse.json({
    results,
    message:
      results.length === 0
        ? 'Нет ни одного подключённого канала'
        : results.map((r) => `${r.label}: ${r.ok ? 'отправлено' : 'ошибка'}`).join(', '),
  });
}
