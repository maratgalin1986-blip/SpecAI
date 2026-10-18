import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { setChatSilent } from '@/lib/groupBot';

export const dynamic = 'force-dynamic';

/**
 * «Тихий режим» in /admin → «Чаты с ботом»: `{ chatId, silent: true }` — the
 * bot only collects orders and posts nothing; `silent: false` — it answers
 * under orders. Admin only; never from a preview (it shares production's
 * database).
 */
export async function PUT(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  if (process.env.VERCEL_ENV === 'preview') {
    return NextResponse.json(
      { error: 'Режим чата меняется только на основном сайте' },
      { status: 409 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    chatId?: unknown;
    silent?: unknown;
  } | null;
  const result = await setChatSilent(body?.chatId, body?.silent);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(
    { chatId: result.chatId, silent: result.silent },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
