import { describe, expect, it } from 'vitest';
import { LIST_LIMIT, capList, parseShowAll, showAllHref } from './adminList';

describe('admin lists', () => {
  const rows = Array.from({ length: 102 }, (_, i) => i);

  it('shows the first rows and counts the hidden ones', () => {
    const capped = capList(rows, false);
    expect(capped.shown).toHaveLength(LIST_LIMIT);
    expect(capped.shown[0]).toBe(0);
    expect(capped.hidden).toBe(102 - LIST_LIMIT);
    expect(capped.total).toBe(102);
  });

  it('shows everything on ?all=1 or when the list is short', () => {
    expect(capList(rows, true)).toEqual({ shown: rows, hidden: 0, total: 102 });
    expect(capList([1, 2, 3], false)).toEqual({ shown: [1, 2, 3], hidden: 0, total: 3 });
    expect(capList(rows, false, 102).hidden).toBe(0);
  });

  it('reads the flag from the query', () => {
    expect(parseShowAll('1')).toBe(true);
    expect(parseShowAll(['true'])).toBe(true);
    expect(parseShowAll('0')).toBe(false);
    expect(parseShowAll(undefined)).toBe(false);
  });

  it('builds the «Показать ещё» link keeping the filter and the anchor', () => {
    expect(showAllHref('/admin', { leads: 'new' }, 'leads')).toBe('/admin?leads=new&all=1#leads');
    expect(showAllHref('/admin/funnel', { period: '7', q: undefined })).toBe(
      '/admin/funnel?period=7&all=1',
    );
  });
});
