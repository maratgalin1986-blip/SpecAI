import { NextRequest, NextResponse } from 'next/server';
import { sendDueReminders } from '@/lib/botDrafts';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// The bot funnel's single reminder (lib/botDrafts.ts). Called hourly by
// .github/workflows/bot-reminders.yml and on every bot update. Safe to call
// without a secret: it only sends reminders that are due, each at most once,
// so extra calls change nothing. With CRON_SECRET set in Vercel, only
// requests carrying it are accepted.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const rate = checkRateLimit('bot-reminders', { limit: 10, windowMs: 60_000 });
  if (!rate.ok) return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  const sent = await sendDueReminders();
  return NextResponse.json({ ok: true, sent });
}
