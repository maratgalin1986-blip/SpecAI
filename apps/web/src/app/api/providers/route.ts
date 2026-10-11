import { NextRequest, NextResponse } from 'next/server';
import { parseProviderQuery } from '@/lib/providerCards';
import { loadProviderCards } from '@/lib/providerCardsData';

// Public: the list of provider companies (/providers, the app's «Исполнители»
// screen) — name, «Проверен», rating, completed bookings, base city, fleet
// summary, a few machine photos and the delivery radius. No phones, e-mails
// or street addresses: contacts open after a confirmed booking (CLAUDE.md).
//
// GET /api/providers?group=&city=&sort=rating|fleet|newest

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = parseProviderQuery({
    group: searchParams.get('group'),
    city: searchParams.get('city'),
    sort: searchParams.get('sort'),
  });
  const list = await loadProviderCards(query);
  if (list.failed) {
    return NextResponse.json({ error: 'Список исполнителей временно недоступен' }, { status: 503 });
  }
  return NextResponse.json(
    { providers: list.cards, total: list.total, groups: list.groups, cities: list.cities },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
