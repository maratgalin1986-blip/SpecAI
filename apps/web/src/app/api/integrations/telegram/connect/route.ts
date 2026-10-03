import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { clientIpFrom } from '@/lib/loginErrors';
import { siteUrl } from '@/lib/siteUrl';
import { connectBot } from '@/lib/telegramSetup';

export const dynamic = 'force-dynamic';

// Keeps the bot connected to the production site without a login: it only
// points the bot at this site's own webhook (never at a caller-given URL),
// does nothing when it is already set, and runs on production only, so a
// preview deployment can never take the bot over. Called hourly by
// .github/workflows/bot-reminders.yml.
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: false, error: 'production only' }, { status: 403 });
  }
  const rate = checkRateLimit(`tg-connect:${clientIpFrom((n) => request.headers.get(n))}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.ok) return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 });
  const result = await connectBot(siteUrl());
  if (!result.ok)
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({
    ok: true,
    bot: result.bot,
    already: result.already,
    miniApp: result.miniApp,
  });
}
