// Provider documents (ProviderDocument): when they run out, which reminders
// are due and what the reminder says. Pure, unit-tested; the daily cron
// (api/cron/daily) and the cabinets do the database work.
import { providerDocumentKindLabel } from '@specai/shared';
import { moscowDateKey } from './bookingRules';

export const DOCUMENT_REMINDER_DAYS = 30;
const DAY_MS = 86_400_000;

export type DocumentStatus = 'ok' | 'expiring' | 'expired' | 'none';

export interface DocumentLike {
  id: string;
  kind: string;
  number?: string | null;
  equipmentId?: string | null;
  operatorName?: string | null;
  expiresAt: Date | null;
  remindedAt30?: Date | null;
  remindedAt0?: Date | null;
}

/** Whole days from today (Moscow) to the expiry day: 0 on the day, negative after. */
export function daysUntilExpiry(expiresAt: Date, now: Date = new Date()): number {
  const expiry = Date.parse(`${moscowDateKey(expiresAt)}T00:00:00Z`);
  const today = Date.parse(`${moscowDateKey(now)}T00:00:00Z`);
  return Math.round((expiry - today) / DAY_MS);
}

/** expired — the day has passed; expiring — within DOCUMENT_REMINDER_DAYS; none — no date. */
export function documentStatus(
  doc: { expiresAt: Date | null },
  now: Date = new Date(),
): DocumentStatus {
  if (!doc.expiresAt) return 'none';
  const days = daysUntilExpiry(doc.expiresAt, now);
  if (days < 0) return 'expired';
  if (days <= DOCUMENT_REMINDER_DAYS) return 'expiring';
  return 'ok';
}

/** A document row for the cabinets and the API: with its status. */
export function withStatus<T extends { expiresAt: Date | null }>(doc: T, now: Date = new Date()) {
  return { ...doc, status: documentStatus(doc, now) };
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  ok: 'Действует',
  expiring: 'Скоро истекает',
  expired: 'Просрочен',
  none: 'Без срока',
};

/** How many of a provider's documents are expired and expiring. */
export function documentsSummary(docs: { expiresAt: Date | null }[], now: Date = new Date()) {
  let expired = 0;
  let expiring = 0;
  for (const doc of docs) {
    const status = documentStatus(doc, now);
    if (status === 'expired') expired += 1;
    if (status === 'expiring') expiring += 1;
  }
  return { expired, expiring, total: docs.length };
}

export type ReminderThreshold = 30 | 0;

export interface DueReminder<T extends DocumentLike> {
  doc: T;
  threshold: ReminderThreshold;
  daysLeft: number;
}

/**
 * Reminders to send now: the 30-day one when the expiry is within 30 days
 * and it has not gone out yet; the day-of one once the expiry day has come
 * (or passed) and it has not gone out yet. Each at most once per document.
 */
export function dueReminders<T extends DocumentLike>(
  docs: T[],
  now: Date = new Date(),
): DueReminder<T>[] {
  const due: DueReminder<T>[] = [];
  for (const doc of docs) {
    if (!doc.expiresAt) continue;
    const daysLeft = daysUntilExpiry(doc.expiresAt, now);
    if (daysLeft <= 0 && !doc.remindedAt0) {
      due.push({ doc, threshold: 0, daysLeft });
    } else if (daysLeft > 0 && daysLeft <= DOCUMENT_REMINDER_DAYS && !doc.remindedAt30) {
      due.push({ doc, threshold: 30, daysLeft });
    }
  }
  return due;
}

/** «СТС № 16 АА 123456 (JCB 4CX)» — what the reminder is about. */
export function documentTitle(
  doc: { kind: string; number?: string | null; operatorName?: string | null },
  equipmentName?: string | null,
): string {
  const label = providerDocumentKindLabel(doc.kind);
  const subject = equipmentName ?? doc.operatorName ?? null;
  return `${label}${doc.number ? ` № ${doc.number}` : ''}${subject ? ` (${subject})` : ''}`;
}
