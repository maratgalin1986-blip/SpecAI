import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { WORLD_START, worldProgress, type Activity } from '@/lib/stroyka/progress';

// How far the /stroyka district has been built: real time since the start
// plus real activity on the site. No table of its own; if the database is
// unreachable the time-only formula is returned.
export const revalidate = 300;

async function activity(): Promise<Activity | null> {
  const since = { createdAt: { gte: new Date(WORLD_START) } };
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 4000),
    );
    const [leads, orders, bids, comments] = await Promise.race([
      Promise.all([
        prisma.lead.count({ where: { ...since, NOT: { phone: '' } } }),
        prisma.order.count({ where: since }),
        prisma.bid.count({ where: since }),
        prisma.comment.count({ where: since }),
      ]),
      timeout,
    ]);
    return { leads, orders, bids, comments };
  } catch {
    return null;
  }
}

export async function GET() {
  const progress = worldProgress(Date.now(), await activity());
  return NextResponse.json(progress, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
