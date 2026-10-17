import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/loginErrors';
import { checkRateLimit } from '@/lib/rateLimit';
import { flushDeferredOrderNotices } from '@/lib/deferredOrderNotices';

export const dynamic = 'force-dynamic';
// A GET handler: without this Next keeps outgoing sends (Telegram, push,
// e-mail) in its Data Cache and never repeats an identical one.
export const fetchCache = 'force-no-store';
// Up to 20 due orders, each to every matching provider.
export const maxDuration = 60;

// «Пригласи друга»: sends the new-order alerts that waited 5 minutes for the
// providers without the bonus (lib/deferredOrderNotices.ts). Called every
// 5 minutes by .github/workflows/order-notices.yml. Public and safe: it only
// sends alerts already due, each once, so extra calls change nothing; the
// answer is counts only. Production only, so a preview deployment never
// sends anything; rate-limited by IP.
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: false, error: 'production only' }, { status: 403 });
  }
  const rate = checkRateLimit(`order-notices:${clientIp(request)}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.ok) return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 });
  try {
    const { due, sent, skipped } = await flushDeferredOrderNotices();
    return NextResponse.json({ ok: true, due, sent, skipped });
  } catch (error) {
    console.error('[cron/notices] flush failed', error);
    return NextResponse.json({ ok: false, error: 'failed' }, { status: 500 });
  }
}
