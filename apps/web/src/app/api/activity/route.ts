import { NextResponse } from 'next/server';
import { ACTIVITY_REVALIDATE_S } from '@/lib/activity';
import { loadActivity } from '@/lib/activityData';

export const dynamic = 'force-dynamic';

/**
 * «Сейчас на площадке»: today's counts by the Moscow day and the newest
 * anonymous events (lib/activity.ts). Public on purpose, like
 * /api/categories: the same aggregate for every visitor, with no names,
 * phones, addresses, prices of bids, user ids or company names other than
 * СпецПласт16 — so there is no user to check. Cached for a minute.
 */
export async function GET() {
  const activity = await loadActivity();
  if (!activity) {
    return NextResponse.json(
      { error: 'Сводка площадки сейчас недоступна, попробуйте позже' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json(activity, {
    headers: {
      'Cache-Control': `public, s-maxage=${ACTIVITY_REVALIDATE_S}, stale-while-revalidate=${ACTIVITY_REVALIDATE_S * 2}`,
    },
  });
}
