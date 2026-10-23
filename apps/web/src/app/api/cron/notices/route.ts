import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/loginErrors';
import { checkRateLimit } from '@/lib/rateLimit';
import { flushDeferredOrderNotices } from '@/lib/deferredOrderNotices';
import { sendDemandNudges, type DemandNudgeResult } from '@/lib/demandNudgeData';

export const dynamic = 'force-dynamic';
// A GET handler: without this Next keeps outgoing sends (Telegram, push,
// e-mail) in its Data Cache and never repeats an identical one.
export const fetchCache = 'force-no-store';
// Up to 20 due orders, each to every matching provider, then «Спрос рядом».
export const maxDuration = 60;

/** «Спрос рядом» gets this long after the delayed alerts, and never past this mark. */
const DEMAND_BUDGET_MS = 20_000;
const DEMAND_LATEST_MS = 45_000;

/** Counts only: whatever else a future version returns never leaks out. */
function demandCounts(result: DemandNudgeResult) {
  if (!('orders' in result)) return { skipped: result.skipped };
  const { orders, sent, skipped, failed, stopped } = result;
  return { orders, sent, skipped, failed, ...(stopped ? { stopped } : {}) };
}

// «Пригласи друга»: sends the new-order alerts that waited 5 minutes for the
// providers without the bonus (lib/deferredOrderNotices.ts). Called every
// 5 minutes by .github/workflows/order-notices.yml. Public and safe: it only
// sends alerts already due, each once, so extra calls change nothing; the
// answer is counts only. Then the daily «Спрос рядом» (lib/demandNudgeData.ts:
// 09:00–20:00 Moscow, once a day per provider manager), with its own time
// budget and its own error handling, so it never holds back the alerts.
// Production only, so a preview deployment never sends anything;
// rate-limited by IP.
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: false, error: 'production only' }, { status: 403 });
  }
  const rate = checkRateLimit(`order-notices:${clientIp(request)}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.ok) return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 });
  const started = Date.now();
  let flushed: { due: number; sent: number; skipped: number };
  try {
    const { due, sent, skipped } = await flushDeferredOrderNotices();
    flushed = { due, sent, skipped };
  } catch (error) {
    console.error('[cron/notices] flush failed', error);
    return NextResponse.json({ ok: false, error: 'failed' }, { status: 500 });
  }
  let demand: ReturnType<typeof demandCounts> | null = null;
  try {
    const deadline = Math.min(Date.now() + DEMAND_BUDGET_MS, started + DEMAND_LATEST_MS);
    demand = demandCounts(await sendDemandNudges({ deadline }));
  } catch (error) {
    console.error('[cron/notices] demand nudge failed', error);
  }
  return NextResponse.json({ ok: true, ...flushed, demand });
}
