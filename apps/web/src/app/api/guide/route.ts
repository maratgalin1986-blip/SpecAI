import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/requestUser';
import { guideReply } from '@/lib/guide';
import { guideFor } from '@/lib/guideState';

export const dynamic = 'force-dynamic';

/**
 * The assistant's checklist and next step for the current user (Bearer token
 * from the app or the site session); a guest gets the guest's steps.
 * `reply` is the same as a chat answer to «Что дальше?».
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  const guide = await guideFor(user);
  const links = request.nextUrl.searchParams.get('links') === 'plain' ? 'plain' : 'markdown';
  return NextResponse.json(
    { ...guide, reply: guideReply(guide, links) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
