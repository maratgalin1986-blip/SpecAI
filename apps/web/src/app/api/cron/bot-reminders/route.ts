import { NextRequest, NextResponse } from 'next/server';
import { sendDueReminders } from '@/lib/botDrafts';

export const dynamic = 'force-dynamic';

// The bot funnel's single reminder (lib/botDrafts.ts). Called hourly by
// .github/workflows/bot-reminders.yml and on every bot update; with
// CRON_SECRET set in Vercel only requests carrying it are accepted.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const fromCron = request.headers.get('user-agent')?.startsWith('vercel-cron');
  if (secret ? auth !== `Bearer ${secret}` : !fromCron) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const sent = await sendDueReminders();
  return NextResponse.json({ ok: true, sent });
}
