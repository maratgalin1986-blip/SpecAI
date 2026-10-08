import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import authMiddleware from 'next-auth/middleware';
import { AB_KEY } from '@/lib/ab';
import { REFERRAL_COOKIE, REFERRAL_MAX_AGE, normalizeReferralCode } from '@/lib/referral';

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
  // «Пригласи коллегу»: any page opened with ?ref=<code> remembers the inviter
  // for the sign-up (the first inviter wins).
  const ref = normalizeReferralCode(request.nextUrl.searchParams.get('ref'));
  if (ref && !request.cookies.get(REFERRAL_COOKIE)) {
    response.cookies.set(REFERRAL_COOKIE, ref, {
      path: '/',
      maxAge: REFERRAL_MAX_AGE,
      sameSite: 'lax',
      httpOnly: true,
    });
  }
  return response;
}

export const config = {
  // Pages only: not API, Next internals, or files with an extension.
  matcher: ['/((?!api/|_next/|.*\\..*).*)'],
};
