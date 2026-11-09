import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import authMiddleware from 'next-auth/middleware';
import { AB_KEY } from '@/lib/ab';
import { REFERRAL_COOKIE, REFERRAL_MAX_AGE, normalizeReferralCode } from '@/lib/referral';
import {
  CLIENT_DOMAIN_HEADER,
  clientSiteFor,
  clientSitePath,
  domainMapFetcher,
  domainMapOrigin,
  getDomainMap,
} from '@/lib/office/domainMap';
import { isPlatformHost } from '@/lib/office/domains';
import { legacyRedirectTarget } from '@/lib/siteUrl';

type AuthMiddleware = (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response | undefined>;

// /dashboard needs a signed-in user (next-auth). The A/B variant («кино или
// спокойно») no longer is a cookie set before consent: it lives in localStorage
// (lib/ab.ts); a stale `sp_ab` cookie from earlier visits is removed here.
export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  // The site moved to иистройка24.рф: pages of the old address follow it
  // (permanently, so search engines move too). The API stays for the app.
  const moved = legacyRedirectTarget(
    request.nextUrl.hostname,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    process.env.VERCEL_ENV,
  );
  if (moved) return NextResponse.redirect(moved, 308);

  // A client's own domain («Сайты под ключ», S7): any page of it shows the
  // client's site (/s/<slug>), and the page learns the host from the header to
  // put the domain into its canonical. Unknown hosts serve the platform as before.
  // The map comes from the platform's own address, never from the request's origin.
  const host = request.nextUrl.hostname;
  if (!isPlatformHost(host)) {
    const site = clientSiteFor(host, await getDomainMap(domainMapFetcher(domainMapOrigin())));
    if (site) {
      const headers = new Headers(request.headers);
      headers.set(CLIENT_DOMAIN_HEADER, site.host);
      const url = request.nextUrl.clone();
      url.pathname = clientSitePath(site.slug);
      return NextResponse.rewrite(url, { request: { headers } });
    }
  }

  let response: NextResponse | undefined;
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const result = await (authMiddleware as unknown as AuthMiddleware)(request, event);
    if (result) response = result as NextResponse;
  }
  // Only the rewrite above names a client's domain: a visitor's own header is dropped.
  if (!response && request.headers.has(CLIENT_DOMAIN_HEADER)) {
    const headers = new Headers(request.headers);
    headers.delete(CLIENT_DOMAIN_HEADER);
    response = NextResponse.next({ request: { headers } });
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
