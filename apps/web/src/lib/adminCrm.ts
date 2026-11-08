// The CRM page (/admin/leads): filters from the address bar, the order of
// the list, the counters and the evening call-back reminder for the owner.
// Pure and unit-tested; the page only feeds it the leads from the database.

import { LEAD_FILTERS, type LeadFilter, parseLeadFilter } from './adminLeads';

export const MSK = 'Europe/Moscow';

export interface CrmLead {
  id: string;
  name: string;
  phone: string;
  message?: string | null;
  city?: string | null;
  note?: string | null;
  status: string;
  callAt?: Date | null;
  createdAt: Date;
}

export interface CrmQuery {
  status: LeadFilter;
  today: boolean;
  city: string;
  from: Date | null;
  to: Date | null;
}

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Moscow calendar date of an instant as YYYY-MM-DD. */
export function mskDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MSK,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Start of a Moscow calendar day (YYYY-MM-DD), or null for a bad value. */
export function mskDayStart(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  // Moscow has no DST: a fixed +03:00 offset is exact.
  const date = new Date(`${day}T00:00:00+03:00`);
  return Number.isNaN(date.getTime()) || mskDate(date) !== day ? null : date;
}

/** [start, end) of the Moscow day that contains `at`. */
export function mskDayBounds(at: Date): { start: Date; end: Date } {
  const start = mskDayStart(mskDate(at)) as Date;
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function parseCrmQuery(params: Params): CrmQuery {
  const from = mskDayStart(first(params.from));
  const toDay = mskDayStart(first(params.to));
  return {
    status: parseLeadFilter(params.status),
    today: first(params.today) === '1',
    city: first(params.city).trim().slice(0, 80),
    from,
    // «по» is inclusive: the end of that Moscow day.
    to: toDay ? new Date(toDay.getTime() + 86_400_000) : null,
  };
}

/** The address of the page with these filters (the status chips keep the rest). */
export function crmHref(query: CrmQuery, patch: Partial<CrmQuery> = {}): string {
  const next = { ...query, ...patch };
  const search = new URLSearchParams();
  if (next.status !== 'all') search.set('status', next.status);
  if (next.today) search.set('today', '1');
  if (next.city) search.set('city', next.city);
  if (next.from) search.set('from', mskDate(next.from));
  if (next.to) search.set('to', mskDate(new Date(next.to.getTime() - 1)));
  const text = search.toString();
  return text ? `/admin/leads?${text}` : '/admin/leads';
}

const STATUS_OF: Record<Exclude<LeadFilter, 'all'>, string> = {
  new: 'NEW',
  work: 'IN_PROGRESS',
  done: 'DONE',
};

export const CRM_STATUS_FILTERS = LEAD_FILTERS;

/** A call-back is due today or earlier and the lead is not closed. */
export function isDueToday(lead: CrmLead, now: Date): boolean {
  if (!lead.callAt || lead.status === 'DONE') return false;
  return lead.callAt.getTime() < mskDayBounds(now).end.getTime();
}

/** The call-back time passed and the lead is still open. */
export function isOverdue(lead: CrmLead, now: Date): boolean {
  return !!lead.callAt && lead.status !== 'DONE' && lead.callAt.getTime() < now.getTime();
}

export function filterCrm<T extends CrmLead>(leads: T[], query: CrmQuery, now: Date): T[] {
  const city = query.city.toLocaleLowerCase('ru-RU');
  return leads.filter((lead) => {
    if (query.status !== 'all' && lead.status !== STATUS_OF[query.status]) return false;
    if (query.today && !isDueToday(lead, now)) return false;
    if (city && !(lead.city ?? '').toLocaleLowerCase('ru-RU').includes(city)) return false;
    if (query.from && lead.createdAt.getTime() < query.from.getTime()) return false;
    if (query.to && lead.createdAt.getTime() >= query.to.getTime()) return false;
    return true;
  });
}

function rank(lead: CrmLead, now: Date): number {
  if (isOverdue(lead, now)) return 0;
  if (lead.status === 'NEW') return 1;
  if (isDueToday(lead, now)) return 2;
  if (lead.status === 'IN_PROGRESS') return 3;
  return 4;
}

/** Overdue call-backs, then new leads, then today's call-backs, the rest in work, closed last. */
export function sortCrm<T extends CrmLead>(leads: T[], now: Date): T[] {
  return [...leads].sort(
    (a, b) =>
      rank(a, now) - rank(b, now) ||
      (a.callAt && b.callAt ? a.callAt.getTime() - b.callAt.getTime() : 0) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export function crmCounters(
  leads: CrmLead[],
  now: Date,
): { new: number; today: number; overdue: number } {
  return {
    new: leads.filter((lead) => lead.status === 'NEW').length,
    today: leads.filter((lead) => isDueToday(lead, now)).length,
    overdue: leads.filter((lead) => isOverdue(lead, now)).length,
  };
}

const REMINDER_LIMIT = 30;

function reminderLine(lead: CrmLead): string {
  const note = (lead.note ?? '').replace(/\s+/g, ' ').trim();
  const parts = [lead.name, lead.phone, lead.city?.trim()].filter(Boolean);
  return `• ${parts.join(' · ')}${note ? ` — ${note.slice(0, 80)}` : ''}`;
}

/**
 * The owner's evening reminder (cron/daily, 19:00 Moscow): call-backs set for
 * tomorrow and the ones already missed. Null when there is nothing to say.
 */
export function callbackReminderText(leads: CrmLead[], now: Date): string | null {
  const { end: tonight } = mskDayBounds(now);
  const tomorrowEnd = new Date(tonight.getTime() + 86_400_000);
  const open = leads.filter((lead) => lead.callAt && lead.status !== 'DONE');
  const overdue = open
    .filter((lead) => (lead.callAt as Date).getTime() < now.getTime())
    .sort((a, b) => (a.callAt as Date).getTime() - (b.callAt as Date).getTime());
  const tomorrow = open
    .filter((lead) => {
      const at = (lead.callAt as Date).getTime();
      return at >= tonight.getTime() && at < tomorrowEnd.getTime();
    })
    .sort((a, b) => (a.callAt as Date).getTime() - (b.callAt as Date).getTime());
  if (!overdue.length && !tomorrow.length) return null;
  const lines: string[] = [];
  let left = REMINDER_LIMIT;
  if (tomorrow.length) {
    lines.push(`📞 Перезвонить завтра (${tomorrow.length}):`);
    for (const lead of tomorrow.slice(0, left)) lines.push(reminderLine(lead));
    left -= Math.min(tomorrow.length, left);
  }
  if (overdue.length) {
    if (lines.length) lines.push('');
    lines.push(`⚠️ Просрочено (${overdue.length}):`);
    for (const lead of overdue.slice(0, Math.max(left, 0))) lines.push(reminderLine(lead));
  }
  const hidden = tomorrow.length + overdue.length - REMINDER_LIMIT;
  if (hidden > 0) lines.push(`… и ещё ${hidden} — в /admin/leads`);
  return lines.join('\n');
}
