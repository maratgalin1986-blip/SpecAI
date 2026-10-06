import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { notifyTelegram } from '@/lib/notify';
import { SITE } from '@/lib/site';
import { buildWeeklyReport } from '@/lib/weeklyReport';
import { submitToIndexNow } from '@/lib/indexNow';
import sitemap from '@/app/sitemap';

export const dynamic = 'force-dynamic';

// Called by Vercel Cron on Monday mornings (apps/web/vercel.json). With
// CRON_SECRET set in Vercel, only requests carrying it are accepted.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const fromCron = request.headers.get('user-agent')?.startsWith('vercel-cron');
  if (secret ? auth !== `Bearer ${secret}` : !fromCron) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const since = new Date(Date.now() - 14 * 86_400_000);
  const [leads, orders] = await Promise.all([
    prisma.lead.findMany({
      // Bot drafts without a phone are not leads yet.
      where: { createdAt: { gte: since }, NOT: { phone: '' } },
      select: { createdAt: true, source: true, status: true, outcome: true, amount: true },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, source: true },
    }),
  ]);
  const sent = await notifyTelegram(buildWeeklyReport(leads, orders, Date.now(), SITE.name));
  // Also remind Yandex of every page (new machines and landings get indexed).
  const indexNow =
    process.env.VERCEL_ENV === 'production'
      ? await submitToIndexNow((await sitemap()).map((entry) => entry.url))
      : null;
  return NextResponse.json({ ok: true, sent, indexNow });
}
