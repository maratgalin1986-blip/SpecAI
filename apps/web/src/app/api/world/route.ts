import { NextResponse } from 'next/server';
import { NO_ACTIVITY, worldProgress } from '@/lib/stroyka/progress';

// How far the /stroyka district has been built: the construction timeline by
// the server's calendar (lib/stroyka/progress.ts), the same for every visitor.
// No database: site activity no longer speeds the world up (owner, 2026-10-03:
// «стройку замедли», real durations of work).
export const revalidate = 300;

export async function GET() {
  const progress = worldProgress(Date.now(), NO_ACTIVITY);
  return NextResponse.json(progress, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
