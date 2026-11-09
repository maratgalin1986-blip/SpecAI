import { NextRequest, NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/cronAuth';
import { officeTick } from '@/lib/office/tick';

export const dynamic = 'force-dynamic';
// A GET handler: without this Next keeps the Telegram send in its Data Cache.
export const fetchCache = 'force-no-store';
// Overpass answers in up to 25 s per step; the tick keeps a reserve for the
// outreach and the digest (lib/office/tick.ts).
export const maxDuration = 60;
/** Время всего тика с запасом до maxDuration на запись результата. */
const TICK_BUDGET_MS = 50_000;
/** Расписание GitHub срабатывает редко, поэтому один вызов делает до трёх шагов. */
const MAX_STEPS = 3;

/**
 * The office tick (.github/workflows/office.yml at :37 and bot-reminders.yml at
 * :17, spec §7): up to three steps of the plan (agent × niche × city), the
 * outreach to the new candidates, and — from 08:00 Moscow until the end of the
 * day, once a day — the owner's digest to Telegram. A second call within ten
 * minutes answers `skipped: 'busy'`. The same tick runs from the daily Vercel
 * cron as a safety net. The response carries only counts and status words: no
 * names, phones or tokens.
 */
export async function GET(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const result = await officeTick(new Date(), {
    budgetMs: TICK_BUDGET_MS,
    maxSteps: MAX_STEPS,
    digest: 'window',
  });
  return NextResponse.json(result);
}
