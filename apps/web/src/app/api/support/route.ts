import { NextResponse } from 'next/server';
import { loadSupportSettings, publicSupport } from '@/lib/supportSettings';

export const dynamic = 'force-dynamic';

/**
 * The requisites for «Поддержать ИИСтройка24» (owner, 2026-10-17). Public on
 * purpose: the owner publishes them himself, and the card shows to guests too
 * (the footer link). Nothing here when the offer is off or the card is not
 * valid. Not indexed: /api/ is closed in robots.txt, plus X-Robots-Tag.
 */
export async function GET() {
  const body = await loadSupportSettings()
    .then(publicSupport)
    // An old database without the table (before db push) or a short outage:
    // the offer simply does not show.
    .catch(() => ({ enabled: false as const }));
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}
