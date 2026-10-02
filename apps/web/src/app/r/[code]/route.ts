import { NextRequest, NextResponse } from 'next/server';
import {
  REFERRAL_COOKIE,
  REFERRAL_MAX_AGE,
  normalizeReferralCode,
  referralLanding,
} from '@/lib/referral';
import { findReferrer } from '@/lib/referralStore';

export const dynamic = 'force-dynamic';

/**
 * «Пригласи коллегу»: /r/<code> remembers the inviter for 30 days and opens
 * the sign-up (the provider form when a provider invites). An unknown code
 * still lands on the sign-up, just without the cookie.
 */
export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeReferralCode(params.code);
  const referrer = code ? await findReferrer(code).catch(() => null) : null;
  const target =
    code && referrer
      ? referralLanding(code, referrer.role === 'PROVIDER_ADMIN')
      : '/register?utm_source=referral&utm_medium=invite';
  const response = NextResponse.redirect(new URL(target, request.nextUrl.origin));
  if (code && referrer) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      path: '/',
      maxAge: REFERRAL_MAX_AGE,
      sameSite: 'lax',
      httpOnly: true,
    });
  }
  return response;
}
