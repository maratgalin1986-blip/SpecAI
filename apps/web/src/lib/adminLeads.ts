// The admin's callback list (/admin#leads): new ones first and a status
// filter. Pure, unit-tested.

export type LeadFilter = 'all' | 'new' | 'work' | 'done';

export const LEAD_FILTERS: { id: LeadFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'work', label: 'В работе' },
  { id: 'done', label: 'Обработаны' },
];

const STATUS_OF: Record<Exclude<LeadFilter, 'all'>, string> = {
  new: 'NEW',
  work: 'IN_PROGRESS',
  done: 'DONE',
};

const RANK: Record<string, number> = { NEW: 0, IN_PROGRESS: 1, DONE: 2 };

export function parseLeadFilter(value: string | string[] | undefined): LeadFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return LEAD_FILTERS.some((item) => item.id === raw) ? (raw as LeadFilter) : 'all';
}

interface LeadLike {
  status: string;
  createdAt: Date;
}

/** New first, then in work, then done; newest first inside each. */
export function sortLeads<T extends LeadLike>(leads: T[]): T[] {
  return [...leads].sort(
    (a, b) =>
      (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export function filterLeads<T extends LeadLike>(leads: T[], filter: LeadFilter): T[] {
  return filter === 'all' ? leads : leads.filter((lead) => lead.status === STATUS_OF[filter]);
}

export function leadFilterCounts(leads: LeadLike[]): Record<LeadFilter, number> {
  return {
    all: leads.length,
    new: filterLeads(leads, 'new').length,
    work: filterLeads(leads, 'work').length,
    done: filterLeads(leads, 'done').length,
  };
}
