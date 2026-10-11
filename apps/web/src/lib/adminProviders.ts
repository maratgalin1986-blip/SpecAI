// The admin's CRM table of provider companies (/admin/providers): tags,
// sorting, filters and search over rows the page loads. Pure functions,
// unit-tested; dates are ISO strings so the rows pass to the client table.

export type ProviderTagId = 'verified' | 'new' | 'no_machines' | 'on_map' | 'docs_expired';

export interface ProviderTag {
  id: ProviderTagId;
  label: string;
  /** Visual weight: strong — the good mark, warn — needs attention, quiet — a fact. */
  tone: 'strong' | 'warn' | 'quiet' | 'accent';
}

export interface ProviderRow {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  verified: boolean;
  onMap: boolean;
  /** ISO date-time. */
  createdAt: string;
  machines: number;
  /** CONFIRMED + ACTIVE + COMPLETED bookings. */
  bookings: number;
  /** 0..1 or null below the reliability sample (lib/reliability.ts). */
  cancelShare: number | null;
  rating: number | null;
  ratingCount: number;
  /** Providers signed up by invitation of the company's users. */
  referrals: number;
  /** ISO date-time of the last bid or booking; null without any. */
  lastActivityAt: string | null;
  docsExpired: number;
  docsExpiring: number;
}

/** A provider counts as «Новый» this many days after sign-up. */
export const NEW_PROVIDER_DAYS = 14;

export function providerTags(row: ProviderRow, now: Date = new Date()): ProviderTag[] {
  const tags: ProviderTag[] = [];
  if (row.verified) tags.push({ id: 'verified', label: 'Проверен', tone: 'strong' });
  const ageDays = (now.getTime() - Date.parse(row.createdAt)) / 86_400_000;
  if (ageDays < NEW_PROVIDER_DAYS) tags.push({ id: 'new', label: 'Новый', tone: 'accent' });
  if (row.machines === 0) tags.push({ id: 'no_machines', label: 'Нет техники', tone: 'warn' });
  if (row.docsExpired > 0)
    tags.push({ id: 'docs_expired', label: 'Документы истекли', tone: 'warn' });
  if (row.onMap) tags.push({ id: 'on_map', label: 'На карте', tone: 'quiet' });
  return tags;
}

export type ProviderSort = 'name' | 'machines' | 'bookings' | 'created' | 'activity';
export type SortDirection = 'asc' | 'desc';

export const PROVIDER_SORTS: { id: ProviderSort; label: string }[] = [
  { id: 'name', label: 'По названию' },
  { id: 'machines', label: 'По технике' },
  { id: 'bookings', label: 'По заказам' },
  { id: 'created', label: 'По дате регистрации' },
  { id: 'activity', label: 'По активности' },
];

/** The direction a column starts with when first clicked. */
export function defaultDirection(sort: ProviderSort): SortDirection {
  return sort === 'name' ? 'asc' : 'desc';
}

const time = (value: string | null) => (value ? Date.parse(value) : 0);

export function sortProviders(
  rows: ProviderRow[],
  sort: ProviderSort,
  direction: SortDirection = defaultDirection(sort),
): ProviderRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  const compare = (a: ProviderRow, b: ProviderRow): number => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name, 'ru');
      case 'machines':
        return a.machines - b.machines;
      case 'bookings':
        return a.bookings - b.bookings;
      case 'created':
        return time(a.createdAt) - time(b.createdAt);
      case 'activity':
        return time(a.lastActivityAt) - time(b.lastActivityAt);
    }
  };
  return [...rows].sort(
    (a, b) =>
      sign * compare(a, b) || a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id),
  );
}

export type ProviderFilter = 'all' | 'verified' | 'unverified' | 'no_machines' | 'docs_expired';

export const PROVIDER_FILTERS: { id: ProviderFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'verified', label: 'Проверенные' },
  { id: 'unverified', label: 'Не проверены' },
  { id: 'no_machines', label: 'Без техники' },
  { id: 'docs_expired', label: 'Документы истекли' },
];

export function matchesFilter(row: ProviderRow, filter: ProviderFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'verified':
      return row.verified;
    case 'unverified':
      return !row.verified;
    case 'no_machines':
      return row.machines === 0;
    case 'docs_expired':
      return row.docsExpired > 0;
  }
}

/** Search by name (any case, any part) or by ИНН digits. */
export function matchesQuery(row: ProviderRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (row.name.toLowerCase().includes(needle)) return true;
  const digits = needle.replace(/\D/g, '');
  return digits.length > 0 && Boolean(row.taxId && row.taxId.replace(/\D/g, '').includes(digits));
}

export function filterProviders(
  rows: ProviderRow[],
  filter: ProviderFilter,
  query = '',
): ProviderRow[] {
  return rows.filter((row) => matchesFilter(row, filter) && matchesQuery(row, query));
}

/** Counts for the filter chips: how many rows each filter would show. */
export function filterCounts(rows: ProviderRow[]): Record<ProviderFilter, number> {
  const counts = { all: 0, verified: 0, unverified: 0, no_machines: 0, docs_expired: 0 };
  for (const row of rows) {
    for (const filter of Object.keys(counts) as ProviderFilter[]) {
      if (matchesFilter(row, filter)) counts[filter] += 1;
    }
  }
  return counts;
}

/** «Написать»: a phone link when the company left a phone; null otherwise. */
export function contactHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.length >= 6 ? `tel:${digits}` : null;
}

/** «12.03.2026» / «—» for the table. */
export function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
}
