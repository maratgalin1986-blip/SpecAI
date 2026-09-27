type QueryValue = string | string[] | undefined;

interface PaginationProps {
  page: number;
  totalPages: number;
  basePath: string;
  /** Current query parameters; they are preserved in every generated link. */
  searchParams: Record<string, QueryValue>;
  /** Name of the query parameter that holds the page number (default `page`). */
  pageParam?: string;
}

function buildHref(
  basePath: string,
  searchParams: Record<string, QueryValue>,
  pageParam: string,
  page: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === pageParam || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v !== '') params.append(key, v);
    }
  }
  if (page > 1) params.set(pageParam, String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Page numbers to show: first, last, and a window around the current page, with `null` gaps. */
function pageItems(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 1; p <= page + 1; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | null)[] = [];
  let previous: number | undefined;
  for (const current of sorted) {
    if (previous !== undefined && current - previous > 1) items.push(null);
    items.push(current);
    previous = current;
  }
  return items;
}

const linkClass =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-amber-400 hover:text-slate-900';
const disabledClass =
  'rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-400';

export function Pagination({
  page,
  totalPages,
  basePath,
  searchParams,
  pageParam = 'page',
}: PaginationProps) {
  if (totalPages <= 1) return null;
  const href = (target: number) => buildHref(basePath, searchParams, pageParam, target);

  return (
    <nav aria-label="Пагинация" className="flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <a href={href(page - 1)} className={linkClass} rel="prev">
          Назад
        </a>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Назад
        </span>
      )}

      {pageItems(page, totalPages).map((item, index) =>
        item === null ? (
          <span key={`gap-${index}`} className="px-1 text-slate-400" aria-hidden="true">
            …
          </span>
        ) : item === page ? (
          <span
            key={item}
            aria-current="page"
            className="rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            {item}
          </span>
        ) : (
          <a key={item} href={href(item)} className={linkClass}>
            {item}
          </a>
        ),
      )}

      {page < totalPages ? (
        <a href={href(page + 1)} className={linkClass} rel="next">
          Вперёд
        </a>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Вперёд
        </span>
      )}
    </nav>
  );
}
