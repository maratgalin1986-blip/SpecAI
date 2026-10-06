import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import authMiddleware from 'next-auth/middleware';
import { AB_KEY } from '@/lib/ab';

type AuthMiddleware = (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response | undefined>;

// /dashboard needs a signed-in user (next-auth). The A/B variant («кино или
// спокойно») no longer is a cookie set before consent: it lives in localStorage
// (lib/ab.ts); a stale `sp_ab` cookie from earlier visits is removed here.
export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  let response: NextResponse | undefined;
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const result = await (authMiddleware as unknown as AuthMiddleware)(request, event);
    if (result) response = result as NextResponse;
  }
  response ??= NextResponse.next();

  if (request.cookies.has(AB_KEY)) response.cookies.delete(AB_KEY);
  return response;
}

export const config = {
  // Pages only: not API, Next internals, or files with an extension.
  matcher: ['/((?!api/|_next/|.*\\..*).*)'],
};
