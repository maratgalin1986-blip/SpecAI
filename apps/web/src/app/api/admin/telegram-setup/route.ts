import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { connectBot } from '@/lib/telegramSetup';

// Points the Telegram bot's webhook at this site (one click in /admin).
export async function POST(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const result = await connectBot(new URL(request.url).origin, true);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
