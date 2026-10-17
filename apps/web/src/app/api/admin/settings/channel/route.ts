import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { pickChannelChat } from '@/lib/channelTarget';

export const dynamic = 'force-dynamic';

/** «Сводка заявок сюда» in /admin → «Чаты с ботом»: `{ chatId }`, or `{ chatId: null }` to stop. */
export async function PUT(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  // Previews share production's database: the pick is made on the live site only.
  if (process.env.VERCEL_ENV === 'preview') {
    return NextResponse.json({ error: 'Выбор чата — только на основном сайте' }, { status: 409 });
  }
  const body = (await request.json().catch(() => null)) as { chatId?: unknown } | null;
  if (!body || !('chatId' in body)) {
    return NextResponse.json({ error: 'Неверный чат' }, { status: 400 });
  }
  const result = await pickChannelChat(body.chatId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ chatId: result.chatId }, { headers: { 'Cache-Control': 'no-store' } });
}
