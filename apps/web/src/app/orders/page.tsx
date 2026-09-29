import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { orderStatusSchema, type OrderStatus } from '@specai/shared';
import { Card } from '@specai/ui';
import { NewOrderForm } from '@/components/NewOrderForm';
import { Pagination } from '@/components/Pagination';
import { parseEnumParam, parsePage, totalPagesFor } from '@/lib/pagination';
import { CinemaHero } from '@/components/CinemaHero';

export const metadata: Metadata = {
  title: 'Заявки на технику',
  description: 'Опубликуйте задачу — поставщики спецтехники предложат технику и цену.',
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: OrderStatus | 'ALL'; label: string }[] = [
  { value: 'OPEN', label: 'Открытые' },
  { value: 'MATCHED', label: 'Закрытые' },
  { value: 'CANCELLED', label: 'Отменённые' },
  { value: 'ALL', label: 'Все' },
];

const STATUS_HEADINGS: Record<OrderStatus | 'ALL', string> = {
  OPEN: 'Открытые заявки',
  MATCHED: 'Закрытые заявки',
  CANCELLED: 'Отменённые заявки',
  ALL: 'Все заявки',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  OPEN: 'Открыта',
  MATCHED: 'Закрыта',
  CANCELLED: 'Отменена',
};

interface OrdersSearchParams {
  status?: string;
  page?: string;
}

export default async function OrdersPage({ searchParams }: { searchParams: OrdersSearchParams }) {
  const status = parseEnumParam(
    searchParams.status,
    [...orderStatusSchema.options, 'ALL'] as const,
    'OPEN',
  );
  const requestedPage = parsePage(searchParams.page);
  // Orders imported from messengers stay hidden until the admin publishes them.
  const where = status === 'ALL' ? { status: { not: 'PENDING_REVIEW' as const } } : { status };

  const total = await prisma.order.count({ where });
  const totalPages = totalPagesFor(total, PAGE_SIZE);
  const page = Math.min(requestedPage, totalPages);

  const orders = await prisma.order.findMany({
    where,
    include: { category: true, customer: true, bids: true },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const statusHref = (value: OrderStatus | 'ALL') =>
    value === 'OPEN' ? '/orders' : `/orders?status=${value}`;

  return (
    <div className="flex flex-col gap-8">
      <CinemaHero
        eyebrow="Биржа заявок"
        title="Заявки на технику"
        clips={['workers', 'house-frame']}
        camera={4}
        compact
      >
        <p>
          Опубликуйте, что вам нужно — поставщики поблизости предложат свою технику и цену. Похоже
          на заказ такси, только для спецтехники.
        </p>
      </CinemaHero>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Новая заявка</h2>
        <Card className="max-w-xl">
          <NewOrderForm />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{STATUS_HEADINGS[status]}</h2>
          <nav aria-label="Фильтр по статусу" className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => (
              <a
                key={filter.value}
                href={statusHref(filter.value)}
                aria-current={filter.value === status ? 'page' : undefined}
                className={
                  filter.value === status
                    ? 'rounded-full bg-amber-600 px-3 py-1 text-sm font-medium text-white'
                    : 'rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:border-amber-400'
                }
              >
                {filter.label}
              </a>
            ))}
          </nav>
        </div>

        <p className="text-sm text-slate-600">
          Найдено: {total}
          {totalPages > 1 && ` · страница ${page} из ${totalPages}`}
        </p>

        {orders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-medium text-slate-700">
              {status === 'ALL' ? 'Заявок пока нет.' : 'Заявок с таким статусом нет.'}
            </p>
            {status !== 'OPEN' && (
              <p className="mt-2 text-sm text-slate-500">
                <a href="/orders" className="font-medium text-amber-700 hover:underline">
                  Сбросить фильтры
                </a>
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {orders.map((order) => (
              <a key={order.id} href={`/orders/${order.id}`}>
                <Card className="flex h-full flex-col gap-2 hover:border-amber-400">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{order.description}</p>
                    {status === 'ALL' && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {STATUS_LABELS[order.status as OrderStatus]}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {order.category?.name ?? 'Любая категория'} ·{' '}
                    {order.desiredStartDate.toLocaleDateString('ru-RU')} –{' '}
                    {order.desiredEndDate.toLocaleDateString('ru-RU')}
                  </p>
                  {order.source !== 'SITE' && (
                    <p className="w-fit rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                      Из {order.source === 'WHATSAPP' ? 'WhatsApp' : 'Telegram'}
                      {order.sourceChat ? ` · ${order.sourceChat}` : ''}
                    </p>
                  )}
                  <p className="text-sm text-slate-500">
                    {order.bids.length > 0
                      ? `Предложений: ${order.bids.length}`
                      : 'Пока нет предложений'}
                  </p>
                </Card>
              </a>
            ))}
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/orders"
          searchParams={{ status: status === 'OPEN' ? undefined : status }}
        />
      </section>
    </div>
  );
}
