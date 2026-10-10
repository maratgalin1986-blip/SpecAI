import { describe, expect, it } from 'vitest';
import {
  contactHref,
  defaultDirection,
  filterCounts,
  filterProviders,
  matchesQuery,
  providerTags,
  sortProviders,
  type ProviderRow,
} from './adminProviders';

const NOW = new Date('2026-10-10T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function row(partial: Partial<ProviderRow> & { id: string; name: string }): ProviderRow {
  return {
    taxId: null,
    phone: null,
    verified: false,
    onMap: false,
    createdAt: daysAgo(100),
    machines: 1,
    bookings: 0,
    cancelShare: null,
    rating: null,
    ratingCount: 0,
    referrals: 0,
    lastActivityAt: null,
    docsExpired: 0,
    docsExpiring: 0,
    ...partial,
  };
}

const rows: ProviderRow[] = [
  row({
    id: 'a',
    name: 'Бета Строй',
    verified: true,
    machines: 5,
    bookings: 12,
    createdAt: daysAgo(400),
    lastActivityAt: daysAgo(2),
    taxId: '1650123456',
  }),
  row({ id: 'b', name: 'Альфа Техно', machines: 0, createdAt: daysAgo(3), onMap: true }),
  row({
    id: 'c',
    name: 'Гамма Кран',
    machines: 2,
    bookings: 3,
    createdAt: daysAgo(50),
    docsExpired: 1,
    lastActivityAt: daysAgo(20),
  }),
];

describe('providerTags', () => {
  it('marks verified, new, empty, expired documents and on-map companies', () => {
    expect(providerTags(rows[0]!, NOW).map((tag) => tag.id)).toEqual(['verified']);
    expect(providerTags(rows[1]!, NOW).map((tag) => tag.id)).toEqual([
      'new',
      'no_machines',
      'on_map',
    ]);
    expect(providerTags(rows[2]!, NOW).map((tag) => tag.label)).toEqual(['Документы истекли']);
  });

  it('stops calling a company new after 14 days', () => {
    expect(providerTags(row({ id: 'x', name: 'X', createdAt: daysAgo(13.9) }), NOW)).toContainEqual(
      expect.objectContaining({ id: 'new' }),
    );
    expect(providerTags(row({ id: 'y', name: 'Y', createdAt: daysAgo(14) }), NOW)).toEqual([]);
  });
});

describe('sortProviders', () => {
  it('sorts by name ascending and by numbers descending by default', () => {
    expect(defaultDirection('name')).toBe('asc');
    expect(defaultDirection('bookings')).toBe('desc');
    expect(sortProviders(rows, 'name').map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(sortProviders(rows, 'machines').map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(sortProviders(rows, 'bookings', 'asc').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(sortProviders(rows, 'created').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    // Companies without any activity go last.
    expect(sortProviders(rows, 'activity').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not change the input', () => {
    const copy = [...rows];
    sortProviders(rows, 'name');
    expect(rows).toEqual(copy);
  });
});

describe('filterProviders', () => {
  it('filters by the chips and counts them', () => {
    expect(filterProviders(rows, 'verified').map((r) => r.id)).toEqual(['a']);
    expect(filterProviders(rows, 'unverified').map((r) => r.id)).toEqual(['b', 'c']);
    expect(filterProviders(rows, 'no_machines').map((r) => r.id)).toEqual(['b']);
    expect(filterProviders(rows, 'docs_expired').map((r) => r.id)).toEqual(['c']);
    expect(filterCounts(rows)).toEqual({
      all: 3,
      verified: 1,
      unverified: 2,
      no_machines: 1,
      docs_expired: 1,
    });
  });

  it('searches by a part of the name or by ИНН digits', () => {
    expect(filterProviders(rows, 'all', 'альфа').map((r) => r.id)).toEqual(['b']);
    expect(filterProviders(rows, 'all', '  КРАН ').map((r) => r.id)).toEqual(['c']);
    expect(filterProviders(rows, 'all', '1650 12').map((r) => r.id)).toEqual(['a']);
    expect(filterProviders(rows, 'unverified', 'альфа').map((r) => r.id)).toEqual(['b']);
    expect(matchesQuery(rows[1]!, '')).toBe(true);
    expect(matchesQuery(rows[1]!, '999')).toBe(false);
  });
});

describe('contactHref', () => {
  it('builds a tel: link from a phone and nothing from junk', () => {
    expect(contactHref('+7 (917) 123-45-67')).toBe('tel:+79171234567');
    expect(contactHref(null)).toBeNull();
    expect(contactHref('нет')).toBeNull();
  });
});
