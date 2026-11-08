// Long lists in the admin (/admin#leads, /admin/funnel «Застрявшие»,
// /admin/search): the first LIST_LIMIT rows and a «Показать ещё» link that
// adds ?all=1 to the same page. Pure, unit-tested.

export const LIST_LIMIT = 30;

/** `?all=1` (or `all=true`) lifts the cap. */
export function parseShowAll(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === '1' || raw === 'true';
}

export interface CappedList<T> {
  shown: T[];
  /** How many rows the cap hid; 0 when everything is on the page. */
  hidden: number;
  total: number;
}

export function capList<T>(items: T[], showAll: boolean, limit = LIST_LIMIT): CappedList<T> {
  if (showAll || items.length <= limit) return { shown: items, hidden: 0, total: items.length };
  return { shown: items.slice(0, limit), hidden: items.length - limit, total: items.length };
}

/** The same page with `all=1` added (and the anchor kept). */
export function showAllHref(
  pathname: string,
  params: Record<string, string | undefined>,
  hash?: string,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  query.set('all', '1');
  return `${pathname}?${query.toString()}${hash ? `#${hash}` : ''}`;
}
