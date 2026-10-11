import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminRequest } from '@/lib/admin';
import { loadAdminFeed, markFeedRead } from '@/lib/adminFeedData';

const schema = z.union([
  z.object({ keys: z.array(z.string().min(1).max(200)).min(1).max(500) }),
  z.object({ all: z.literal(true) }),
]);

// /admin/feed: «Прочитано» for one or several events, or «Отметить всё
// прочитанным» for everything the feed shows right now.
export async function POST(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  const keys =
    'keys' in parsed.data
      ? parsed.data.keys
      : (await loadAdminFeed()).events.map((event) => event.key);
  const marked = await markFeedRead(keys);
  return NextResponse.json({ marked });
}
