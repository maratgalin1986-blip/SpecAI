import { NextRequest, NextResponse } from 'next/server';
import { sendDueReminders } from '@/lib/botDrafts';
import { checkRateLimit } from '@/lib/rateLimit';
import { cronAllowed } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';
// A GET handler: without this Next keeps outgoing sends (Telegram, push,
// e-mail) in its Data Cache and never repeats an identical one.
export const fetchCache = 'force-no-store';

// The bot funnel's single reminder (lib/botDrafts.ts). Called hourly by
// .github/workflows/bot-reminders.yml (with the CRON_SECRET repository
// secret) and on every bot update. Idempotent: it only sends reminders that
// are due, each at most once. Only requests carrying CRON_SECRET are
// accepted (lib/cronAuth.ts).
export async function GET(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const rate = checkRateLimit('bot-reminders', { limit: 10, windowMs: 60_000 });
  if (!rate.ok) return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  const sent = await sendDueReminders();
  return NextResponse.json({ ok: true, sent });
}
