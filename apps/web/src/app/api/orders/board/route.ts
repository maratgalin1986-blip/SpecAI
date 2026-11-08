import { NextRequest, NextResponse } from 'next/server';
import { parseBoardQuery } from '@/lib/orderBoard';
import { loadOrderBoard } from '@/lib/orderBoardData';

// Public: the board of open orders (/orders) for guests, the app and search
// engines — safe fields only (lib/orderBoard.ts): the customer as «Анна П.»,
// contacts and links hidden in the text, no account ids. Bidding needs a
// provider account (GET /api/orders?open=1 and /orders/[id]).
//
// GET /api/orders/board?page=&group=&city=&when=today|tomorrow|soon&sort=newest|soonest

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = parseBoardQuery({
    page: searchParams.get('page'),
    group: searchParams.get('group'),
    city: searchParams.get('city'),
    when: searchParams.get('when'),
    sort: searchParams.get('sort'),
  });
  const board = await loadOrderBoard(query);
  return NextResponse.json(
    {
      orders: board.items.map((item) => item.card),
      total: board.total,
      page: board.page,
      totalPages: board.totalPages,
      groups: board.groups.map((group) => ({ id: group.id, label: group.label })),
      cities: board.cities,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
