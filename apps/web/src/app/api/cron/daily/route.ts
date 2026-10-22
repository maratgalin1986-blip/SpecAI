import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { cronAllowed } from '@/lib/cronAuth';
import { DOCUMENT_REMINDER_DAYS, documentTitle, dueReminders } from '@/lib/documents';
import { notifyCompany } from '@/lib/notifications/notifyUser';
import { notifyTelegram } from '@/lib/notify';
import { onceADay } from '@/lib/cronOnce';
import { aiModerationSummary, sweepPendingOrders } from '@/lib/orderModeration';
import { GET as evening } from '../evening/route';
import { postChannelDigest } from '@/lib/channelDigest';
import { FLUSH_BATCH, tickDeferredOrderNotices } from '@/lib/deferredOrderNotices';
import { runGroupPriceSurvey } from '@/lib/groupPriceSurvey';
import { callbackReminderText } from '@/lib/adminCrm';

export const dynamic = 'force-dynamic';
// A GET handler: without this Next keeps outgoing sends (Telegram, push,
// e-mail) in its Data Cache and never repeats an identical one.
export const fetchCache = 'force-no-store';
// The AI moderation sweep makes up to 20 calls (four at a time).
export const maxDuration = 60;

/**
 * Daily cron (19:00 Moscow, apps/web/vercel.json): document reminders 30
 * days before the expiry and again on the day, each once per document
 * (remindedAt30 / remindedAt0), to the company's managers via notifyUser;
 * then the evening digest (api/cron/evening); last, the AI moderator takes
 * the chat orders still waiting (lib/orderModeration.ts). The sweep is last
 * so that a slow AI can never cost the digest: what it publishes reaches the
 * providers at once anyway.
 */
export async function GET(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  // Backstop for the delayed new-order alerts (lib/deferredOrderNotices.ts).
  const notices = await tickDeferredOrderNotices('cron/daily', FLUSH_BATCH);
  const now = new Date();
  const horizon = new Date(now.getTime() + (DOCUMENT_REMINDER_DAYS + 1) * 86_400_000);
  const candidates = await prisma.providerDocument.findMany({
    where: {
      expiresAt: { not: null, lte: horizon },
      OR: [{ remindedAt30: null }, { remindedAt0: null }],
    },
    take: 1000,
  });
  const due = dueReminders(candidates, now);
  const equipmentIds = [
    ...new Set(due.map((item) => item.doc.equipmentId).filter((id): id is string => !!id)),
  ];
  const machines = equipmentIds.length
    ? await prisma.equipment.findMany({
        where: { id: { in: equipmentIds } },
        select: { id: true, name: true },
      })
    : [];
  const machineName = new Map(machines.map((item) => [item.id, item.name]));

  let sent = 0;
  for (const { doc, threshold, daysLeft } of due) {
    await notifyCompany(doc.companyId, {
      type: 'document.expiring',
      title: documentTitle(doc, doc.equipmentId ? machineName.get(doc.equipmentId) : null),
      expiresAt: doc.expiresAt as Date,
      daysLeft: Math.max(0, daysLeft),
    });
    await prisma.providerDocument.update({
      where: { id: doc.id },
      data: threshold === 30 ? { remindedAt30: now } : { remindedAt0: now },
    });
    sent += 1;
  }
  // CRM (/admin/leads): the owner's call-backs for tomorrow and the missed
  // ones, to the owner's Telegram, once a day (lib/adminCrm.ts).
  const callbacks = await remindCallbacks(now).catch((error: unknown) => {
    console.error('[cron/daily] call-back reminder failed', error);
    return { due: 0, sent: false };
  });
  // The evening digest runs from the same cron: Vercel's Hobby plan allows two
  // cron jobs per project (weekly + this one), so both daily tasks share it.
  const digest = await evening(request)
    .then((response) => response.json() as Promise<unknown>)
    .catch((error: unknown) => ({ error: String(error) }));
  // «Заявки за сутки» in the platform's own Telegram channel (off without TELEGRAM_CHANNEL_ID);
  // before the AI sweep, which may use the rest of the function's time.
  const channel = await postChannelDigest().catch((error: unknown) => ({ error: String(error) }));
  // «Опрос цен в группе»: posted once in the owner's group, closed after 7
  // days with the results to the owner (lib/groupPriceSurvey.ts).
  const priceSurvey = await runGroupPriceSurvey().catch((error: unknown) => {
    console.error('[cron/daily] group price survey failed', error);
    return 'error';
  });
  const moderation = await sweepPendingOrders().catch((error: unknown) => {
    console.error('[cron/daily] AI moderation sweep failed', error);
    return { error: String(error) };
  });
  // One line a day for the owner instead of a message per decision.
  const moderationSummary = await onceADay('ai-moderation', async () => {
    const line = await aiModerationSummary();
    if (line) await notifyTelegram(line);
    return line;
  }).catch(() => null);
  return NextResponse.json({
    ok: true,
    checked: candidates.length,
    sent,
    moderation,
    moderationSummary,
    digest,
    channel,
    priceSurvey,
    notices,
    callbacks,
  });
}

/** Call-backs for tomorrow and the missed ones → the owner's Telegram, once a day. */
async function remindCallbacks(now: Date): Promise<{ due: number; sent: boolean }> {
  const horizon = new Date(now.getTime() + 2 * 86_400_000);
  const leads = await prisma.lead.findMany({
    where: { callAt: { not: null, lte: horizon }, status: { not: 'DONE' }, NOT: { phone: '' } },
    select: {
      id: true,
      name: true,
      phone: true,
      city: true,
      note: true,
      status: true,
      callAt: true,
      createdAt: true,
    },
    take: 500,
  });
  const text = callbackReminderText(leads, now);
  if (!text) return { due: 0, sent: false };
  const result = await onceADay('lead-callbacks', () => notifyTelegram(text));
  return { due: leads.length, sent: result === true };
}
