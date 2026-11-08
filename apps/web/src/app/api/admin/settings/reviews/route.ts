import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import {
  loadReviewLinks,
  parseReviewLinksUpdate,
  saveReviewLinks,
  type ReviewLinks,
} from '@/lib/reviewLinks';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function view(links: ReviewLinks) {
  return { reviews: links };
}

/** «Отзывы о площадке» in the admin menu: links to the 2ГИС and Яндекс Карты cards. */
export async function GET() {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  return NextResponse.json(view(await loadReviewLinks()), { headers: NO_STORE });
}

export async function PUT(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const parsed = parseReviewLinksUpdate(
    await request.json().catch(() => null),
    await loadReviewLinks(),
  );
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return NextResponse.json(view(await saveReviewLinks(parsed.value)), { headers: NO_STORE });
}
