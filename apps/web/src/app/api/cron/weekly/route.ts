import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { onceADay } from '@/lib/cronOnce';
import { notifyTelegram } from '@/lib/notify';
import { SITE } from '@/lib/site';
import { buildWeeklyReport } from '@/lib/weeklyReport';
import { submitToIndexNow } from '@/lib/indexNow';
import { sendWeeklyNewsletter } from '@/lib/newsletterData';
import { sendWeeklyPriceAsk } from '@/lib/aktualnoData';
import sitemap from '@/app/sitemap';

export const dynamic = 'force-dynamic';
// A GET handler: without this Next keeps outgoing sends (Telegram, push,
// e-mail) in its Data Cache and never repeats an identical one.
export const fetchCache = 'force-no-store';
// The newsletter paces its letters (Resend: 2 a second) within NEWSLETTER_BUDGET_MS.
export const maxDuration = 60;

/** The newsletter starts no new letter after this much of the run. */
const NEWSLETTER_BUDGET_MS = 35_000;
/** «Обновите цены и свободные дни» to providers starts no new message after this. */
// Its sends time out after 8 s (lib/aktualnoData.ts), so the run ends within maxDuration.
const PRICE_ASK_BUDGET_MS = 48_000;

// Called by Vercel Cron on Monday mornings (apps/web/vercel.json). With
// CRON_SECRET set in Vercel, only requests carrying it are accepted.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const fromCron = request.headers.get('user-agent')?.startsWith('vercel-cron');
  if (secret ? auth !== `Bearer ${secret}` : !fromCron) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const started = Date.now();
  // Once a day (lib/cronOnce.ts): a repeated call does not resend the report.
  let result: Awaited<ReturnType<typeof sendWeeklyReport>> | null = null;
  let failed = false;
  try {
    result = await onceADay('weekly', sendWeeklyReport);
  } catch (error) {
    console.error('[cron/weekly] report failed', error);
    failed = true;
  }
  // «Заявки рядом за неделю» to subscribers, after the report and on its own:
  // an error here never costs the report. Each user is guarded by lastNewsAt,
  // so a repeated call goes on with those not mailed yet.
  const newsletter = await sendWeeklyNewsletter({
    deadline: started + NEWSLETTER_BUDGET_MS,
  }).catch((error: unknown) => {
    console.error('[cron/weekly] newsletter failed', error);
    return { error: String(error) };
  });
  // «Актуализация»: the platform asks its own providers to confirm prices and
  // free days (lib/aktualnoData.ts). Last, on its own budget; each user is
  // guarded by NotificationSettings.priceAskSentAt (once a week).
  const priceAsk = await sendWeeklyPriceAsk({
    deadline: started + PRICE_ASK_BUDGET_MS,
  }).catch((error: unknown) => {
    console.error('[cron/weekly] price ask failed', error);
    return { error: String(error) };
  });
  if (failed) {
    return NextResponse.json(
      { ok: false, error: 'report failed', newsletter, priceAsk },
      { status: 500 },
    );
  }
  if (!result) {
    return NextResponse.json({ ok: true, skipped: 'already sent today', newsletter, priceAsk });
  }
  return NextResponse.json({ ok: true, ...result, newsletter, priceAsk });
}

async function sendWeeklyReport() {
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
  return { sent, indexNow };
}
