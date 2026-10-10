'use client';

import { useMemo, useState } from 'react';
import { AdminVerifyToggle } from '@/components/AdminVerifyToggle';
import { AdminTag, chipClass } from '@/components/admin/AdminUi';
import {
  PROVIDER_FILTERS,
  contactHref,
  defaultDirection,
  filterCounts,
  filterProviders,
  providerTags,
  shortDate,
  sortProviders,
  type ProviderFilter,
  type ProviderRow,
  type ProviderSort,
  type SortDirection,
} from '@/lib/adminProviders';
import { cancelLabel } from '@/lib/reliability';
import { providerPath } from '@/lib/providerSeo';

// /admin/providers: the CRM table. Sorting, filters and search run in the
// browser over the rows the page loaded (a few hundred at most). Desktop: a
// dense table; on a phone (< 640 px) every row becomes a card.

interface Props {
  rows: ProviderRow[];
  initialFilter?: ProviderFilter;
  /** ISO moment the rows were loaded — «Новый» is judged against it. */
  now: string;
}

const COLUMNS: { id: ProviderSort | null; label: string; align?: 'right' }[] = [
  { id: 'name', label: 'Компания' },
  { id: 'machines', label: 'Техника', align: 'right' },
  { id: 'bookings', label: 'Заказы', align: 'right' },
  { id: null, label: 'Отмены', align: 'right' },
  { id: null, label: 'Рейтинг', align: 'right' },
  { id: null, label: 'Привёл', align: 'right' },
  { id: 'activity', label: 'Активность' },
  { id: 'created', label: 'С нами' },
  { id: null, label: 'Действия' },
];

function Rating({ row }: { row: ProviderRow }) {
  if (row.rating === null) return <span className="text-graphite-400">—</span>;
  return (
    <span className="tabular-nums">
      <span className="text-signal-600">★</span> {row.rating.toFixed(1)}{' '}
      <span className="text-graphite-400">({row.ratingCount})</span>
    </span>
  );
}

function Cancels({ row }: { row: ProviderRow }) {
  if (row.cancelShare === null) return <span className="text-graphite-400">—</span>;
  const label = cancelLabel(row.cancelShare);
  return (
    <span className={row.cancelShare > 0.2 ? 'font-semibold text-red-700' : 'text-graphite-700'}>
      {row.cancelShare > 0 ? `${Math.round(row.cancelShare * 100)}%` : label}
    </span>
  );
}

function Contact({ row }: { row: ProviderRow }) {
  const href = contactHref(row.phone);
  if (!href) return <span className="text-xs text-graphite-400">Нет телефона</span>;
  return (
    <a
      href={href}
      className="inline-flex min-h-[28px] items-center rounded-full border border-graphite-200 px-2.5 text-xs font-semibold text-graphite-800 hover:border-graphite-800"
      title={row.phone ?? undefined}
    >
      Написать
    </a>
  );
}

function Tags({ row, now }: { row: ProviderRow; now: Date }) {
  const tags = providerTags(row, now);
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <AdminTag key={tag.id} tone={tag.tone}>
          {tag.label}
        </AdminTag>
      ))}
    </span>
  );
}

function Details({ row }: { row: ProviderRow }) {
  const items: [string, string][] = [
    ['ИНН', row.taxId ?? '—'],
    ['Телефон', row.phone ?? '—'],
    ['Техники', String(row.machines)],
    ['Заказов (подтв./в работе/завершено)', String(row.bookings)],
    ['Отзывов', String(row.ratingCount)],
    ['Пригласил исполнителей', String(row.referrals)],
    ['Документы истекли / скоро', `${row.docsExpired} / ${row.docsExpiring}`],
    ['Последняя активность', shortDate(row.lastActivityAt)],
    ['Зарегистрирована', shortDate(row.createdAt)],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 sm:block">
          <dt className="text-graphite-500">{label}</dt>
          <dd className="font-semibold text-graphite-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AdminProvidersTable({ rows, initialFilter = 'all', now }: Props) {
  const [sort, setSort] = useState<ProviderSort>('created');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [filter, setFilter] = useState<ProviderFilter>(initialFilter);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const loadedAt = useMemo(() => new Date(now), [now]);

  const counts = useMemo(() => filterCounts(rows), [rows]);
  const visible = useMemo(
    () => sortProviders(filterProviders(rows, filter, query), sort, direction),
    [rows, filter, query, sort, direction],
  );

  function toggleSort(next: ProviderSort) {
    if (next === sort) {
      setDirection(direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(next);
      setDirection(defaultDirection(next));
    }
  }

  const arrow = (id: ProviderSort | null) =>
    id && id === sort ? (direction === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Фильтр">
          {PROVIDER_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={chipClass(filter === item.id)}
            >
              {item.label}
              <span className="font-mono tabular-nums opacity-70">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Название или ИНН"
          aria-label="Поиск по названию или ИНН"
          className="min-h-[36px] rounded-full border border-graphite-200 bg-white px-3.5 text-sm text-graphite-900 placeholder:text-graphite-400 focus:border-graphite-800 focus:outline-none sm:w-64"
        />
      </div>

      <p className="text-xs text-graphite-500">
        Показано {visible.length} из {rows.length}. Сортировка — клик по заголовку столбца.
      </p>

      {/* Desktop: dense table */}
      <div className="hidden overflow-x-auto rounded-xl border border-graphite-100 bg-white sm:block">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-graphite-50 text-[11px] uppercase tracking-wide text-graphite-500">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  aria-sort={
                    column.id === sort
                      ? direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={`border-b border-graphite-100 px-2 py-2 font-bold ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {column.id ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.id!)}
                      className="whitespace-nowrap uppercase hover:text-graphite-900"
                    >
                      {column.label}
                      {arrow(column.id)}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-graphite-500">
                  Ничего не найдено.
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const expanded = open === row.id;
              return [
                <tr
                  key={row.id}
                  className={`border-b border-graphite-100 align-top hover:bg-graphite-50 ${
                    expanded ? 'bg-graphite-50' : ''
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5">
                        <a
                          href={providerPath(row.id)}
                          className="font-semibold text-graphite-950 hover:text-signal-700"
                        >
                          {row.name}
                        </a>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Скрыть карточку' : 'Открыть карточку'}
                          onClick={() => setOpen(expanded ? null : row.id)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-graphite-200 text-[11px] font-bold text-graphite-600 hover:border-graphite-800"
                        >
                          {expanded ? '–' : 'i'}
                        </button>
                      </span>
                      <span className="text-xs text-graphite-500">
                        {row.taxId ? `ИНН ${row.taxId}` : 'ИНН не указан'}
                      </span>
                      <Tags row={row} now={loadedAt} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{row.machines}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{row.bookings}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Cancels row={row} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Rating row={row} />
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    {row.referrals > 0 ? (
                      row.referrals
                    ) : (
                      <span className="text-graphite-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-graphite-700">
                    {shortDate(row.lastActivityAt)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-graphite-700">
                    {shortDate(row.createdAt)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-col items-start gap-1">
                      <AdminVerifyToggle companyId={row.id} initial={row.verified} />
                      <Contact row={row} />
                    </div>
                  </td>
                </tr>,
                expanded ? (
                  <tr
                    key={`${row.id}-details`}
                    className="border-b border-graphite-100 bg-graphite-50"
                  >
                    <td colSpan={COLUMNS.length} className="px-3 py-3">
                      <Details row={row} />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* Phone: cards */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {visible.length === 0 && (
          <li className="cab-card text-sm text-graphite-500">Ничего не найдено.</li>
        )}
        {visible.map((row) => {
          const expanded = open === row.id;
          return (
            <li key={row.id} className="cab-card flex flex-col gap-2 !p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <a
                    href={providerPath(row.id)}
                    className="break-words font-semibold text-graphite-950"
                  >
                    {row.name}
                  </a>
                  <p className="text-xs text-graphite-500">
                    {row.taxId ? `ИНН ${row.taxId}` : 'ИНН не указан'} · с{' '}
                    {shortDate(row.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : row.id)}
                  className="shrink-0 text-xs font-semibold text-graphite-600"
                >
                  {expanded ? 'Скрыть' : 'Подробнее'}
                </button>
              </div>
              <Tags row={row} now={loadedAt} />
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div>
                  <p className="font-mono text-base font-bold tabular-nums">{row.machines}</p>
                  <p className="text-graphite-500">техники</p>
                </div>
                <div>
                  <p className="font-mono text-base font-bold tabular-nums">{row.bookings}</p>
                  <p className="text-graphite-500">заказов</p>
                </div>
                <div>
                  <p className="text-base font-bold">
                    <Cancels row={row} />
                  </p>
                  <p className="text-graphite-500">отмены</p>
                </div>
                <div>
                  <p className="text-base font-bold">
                    <Rating row={row} />
                  </p>
                  <p className="text-graphite-500">рейтинг</p>
                </div>
              </div>
              {expanded && <Details row={row} />}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <AdminVerifyToggle companyId={row.id} initial={row.verified} />
                <Contact row={row} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
