import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import authMiddleware from 'next-auth/middleware';
import { AB_COOKIE, AB_MAX_AGE, parseAbVariant, pickVariant } from '@/lib/ab';

type AuthMiddleware = (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response | undefined>;

// Two jobs: /dashboard needs a signed-in user (next-auth), and every page
// visitor gets the `sp_ab` A/B cookie («кино или спокойно», docs/marketing.md).
// `?ab=cine|calm` forces a variant for testing.
export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  let response: NextResponse | undefined;
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const result = await (authMiddleware as unknown as AuthMiddleware)(request, event);
    if (result) response = result as NextResponse;
  }
  response ??= NextResponse.next();

  const forced = parseAbVariant(request.nextUrl.searchParams.get('ab'));
  const current = parseAbVariant(request.cookies.get(AB_COOKIE)?.value);
  const variant = forced ?? current ?? pickVariant();
  if (variant !== current) {
    response.cookies.set(AB_COOKIE, variant, {
      path: '/',
      maxAge: AB_MAX_AGE,
      sameSite: 'lax',
    });
  }
  return response;
}

export const config = {
  // Pages only: not API, Next internals, or files with an extension.
  matcher: ['/((?!api/|_next/|.*\\..*).*)'],
};
