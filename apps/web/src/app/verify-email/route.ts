import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Ссылка из письма ведёт сюда; сама проверка — в /api/auth/verify-email. */
export function GET(request: NextRequest) {
  const url = new URL('/api/auth/verify-email', request.nextUrl.origin);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url);
}
