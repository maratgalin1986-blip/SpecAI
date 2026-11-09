import { NextRequest, NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/cronAuth';
import { onceADay } from '@/lib/cronOnce';
import { notifyTelegram } from '@/lib/notify';
import { DIGEST_HOURS, collectDigest, moscowHour } from '@/lib/office/digest';
import { sendOutreach } from '@/lib/office/outreachRun';
import { runScheduledStep } from '@/lib/office/run';

export const dynamic = 'force-dynamic';
// A GET handler: without this Next keeps the Telegram send in its Data Cache.
export const fetchCache = 'force-no-store';
// Overpass answers in up to 25 s; the digest queries come after it.
export const maxDuration = 60;
/** Время на шаг и рассылку вместе, с запасом до maxDuration для сводки и записи отметок. */
const CRON_BUDGET_MS = 45_000;

/**
 * Hourly cron of the office agents (.github/workflows/bot-reminders.yml, spec §7):
 * one step of the plan (agent × niche × city), then — between 08:00 and 10:59
 * Moscow, once a day — the owner's digest to Telegram. The response carries
 * only counts and status words: no names, phones or tokens.
 */
export async function GET(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const now = new Date();
  const step = await runScheduledStep(now).catch((error: unknown) => {
    console.error('[cron/office] step failed', error);
    return { skipped: 'error' as const, step: null, result: null };
  });
  // Рассылка кандидатам по e-mail и WhatsApp (lib/office/outreachRun.ts): одно
  // сообщение на компанию и канал, дневной лимит, пауза из /admin/office.
  // Остаток времени функции после шага поиска — рассылке, с запасом на сводку.
  const budgetMs = CRON_BUDGET_MS - (Date.now() - now.getTime());
  const outreach = await sendOutreach(now, { budgetMs }).catch((error: unknown) => {
    console.error('[cron/office] outreach failed', error);
    return { email: 0, whatsapp: 0, skipped: 'error', errors: 0 };
  });
  let digest = false;
  const hour = moscowHour(now);
  if (hour >= DIGEST_HOURS.from && hour <= DIGEST_HOURS.to) {
    const sent = await onceADay(
      'office-digest',
      async () => notifyTelegram(await collectDigest(now)),
      now,
    ).catch((error: unknown) => {
      console.error('[cron/office] digest failed', error);
      return null;
    });
    digest = sent === true;
  }
  return NextResponse.json({
    outreach,
    step: step.skipped
      ? { skipped: step.skipped }
      : {
          agent: step.step.agent,
          niche: step.step.niche,
          city: step.step.city,
          found: step.result.found,
          created: step.result.created,
          skipped: step.result.skipped,
          error: step.result.error,
        },
    digest,
  });
}
