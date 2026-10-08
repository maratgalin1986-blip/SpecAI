import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { cronAllowed } from '@/lib/cronAuth';
import { DOCUMENT_REMINDER_DAYS, documentTitle, dueReminders } from '@/lib/documents';
import { notifyCompany } from '@/lib/notifications/notifyUser';

export const dynamic = 'force-dynamic';

/**
 * Morning cron (06:00 Moscow, apps/web/vercel.json): document reminders 30
 * days before the expiry and again on the day, each once per document
 * (remindedAt30 / remindedAt0), to the company's managers via notifyUser.
 */
export async function GET(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
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
  return NextResponse.json({ ok: true, checked: candidates.length, sent });
}
