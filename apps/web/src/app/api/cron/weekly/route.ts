import { NextRequest, NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/cronAuth';
import { onceForKey } from '@/lib/cronOnce';
import { notifyTelegram } from '@/lib/notify';
import { buildWeeklyReport, reportDue, reportWeek, type ReportWeek } from '@/lib/weeklyReport';
import { loadWeeklyData } from '@/lib/weeklyReportData';
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

// Called on Monday mornings by Vercel Cron (apps/web/vercel.json) and, as a
// backstop, by .github/workflows/weekly-report.yml — GitHub starts scheduled
// runs hours late, so the call may come more than once and on a later day.
// Only requests carrying CRON_SECRET are accepted (lib/cronAuth.ts).
export async function GET(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const started = Date.now();
  const now = new Date(started);
  const week = reportWeek(now);
  const due = reportDue(now);
  // One report per reported week (lib/cronOnce.ts): the key is the week's
  // Monday, so a second call for the same week sends nothing, whatever the day.
  let result: Awaited<ReturnType<typeof sendWeeklyReport>> | null = null;
  let failed = false;
  if (due) {
    try {
      result = await onceForKey(
        `cron:weekly-report:${week.key}`,
        () => sendWeeklyReport(week, now),
        now,
      );
    } catch (error) {
      console.error('[cron/weekly] report failed', error);
      failed = true;
    }
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
      { ok: false, error: 'report failed', week: week.key, newsletter, priceAsk },
      { status: 500 },
    );
  }
  if (!result) {
    return NextResponse.json({
      ok: true,
      week: week.key,
      skipped: due ? 'already sent for this week' : 'too early',
      newsletter,
      priceAsk,
    });
  }
  return NextResponse.json({ ok: true, week: week.key, ...result, newsletter, priceAsk });
}

async function sendWeeklyReport(week: ReportWeek, now: Date) {
  const text = buildWeeklyReport(await loadWeeklyData(week, now), week);
  // Not accepted (Telegram is down or not set up): the error gives the week
  // back, so the next scheduled call sends the report instead of losing it.
  if (!(await notifyTelegram(text))) throw new Error('Telegram did not accept the report');
  // Also remind Yandex of every page (new machines and landings get indexed).
  // Its failure must not give the week back: the report is already delivered.
  const indexNow =
    process.env.VERCEL_ENV === 'production'
      ? await sitemap()
          .then((entries) => submitToIndexNow(entries.map((entry) => entry.url)))
          .catch((error: unknown) => {
            console.error('[cron/weekly] IndexNow failed', error);
            return null;
          })
      : null;
  return { sent: true, indexNow };
}
