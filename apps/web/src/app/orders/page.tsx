import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { ORDER_STATUS_LABELS, orderStatusSchema, type OrderStatus } from '@specai/shared';
import { Card } from '@specai/ui';
import { NewOrderForm } from '@/components/NewOrderForm';
import { Pagination } from '@/components/Pagination';
import { parseEnumParam, parsePage, totalPagesFor } from '@/lib/pagination';
import { CinemaHero } from '@/components/CinemaHero';
import { authOptions } from '@/lib/auth';
import { isAdminRequest } from '@/lib/admin';
import { isProvider } from '@/lib/fleet';
import { SITE } from '@/lib/site';
import { CallbackForm } from '@/components/CallbackForm';
import { orderPrefill } from '@/lib/quickOrder';

export const metadata: Metadata = {
  title: 'Заявка на технику',
  description:
    'Опишите задачу — исполнители со своей техникой и машинистами, включая парк СпецПласт16, пришлют предложения с ценой. Сервис бесплатный.',
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

interface OrdersSearchParams {
  status?: string;
  page?: string;
  /** From the map: the provider the order is meant for. */
  provider?: string;
  /** From the cabinet's quick-order panel (lib/quickOrder.ts). */
  category?: string;
  start?: string;
  now?: string;
  address?: string;
}

type OrderWhere = NonNullable<Parameters<typeof prisma.order.count>[0]>['where'];

/**
 * The list under the form. Without a database it is empty (logged), so the
 * guest form above always renders instead of a 500.
 */
async function loadOrders(where: OrderWhere, requestedPage: number) {
  try {
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
    return { total, totalPages, page, orders, failed: false };
  } catch (error) {
    console.error('Failed to load orders', error);
    return { total: 0, totalPages: 1, page: 1, orders: [], failed: true };
  }
}

async function loadProvider(id: string | undefined) {
  if (!id || !/^[\w-]{1,64}$/.test(id)) return null;
  try {
    return await prisma.company.findFirst({
      where: { id, isProvider: true },
      select: { id: true, name: true },
    });
  } catch (error) {
    console.error('Failed to load the provider for /orders', error);
    return null;
  }
}

export default async function OrdersPage({ searchParams }: { searchParams: OrdersSearchParams }) {
  const status = parseEnumParam(
    searchParams.status,
    [...orderStatusSchema.options, 'ALL'] as const,
    'OPEN',
  );
  const requestedPage = parsePage(searchParams.page);
  // Aggregator: providers and the admin see every order (an open board), a
  // customer only their own, a guest only the form.
  const session = await getServerSession(authOptions);
  const viewerIsProvider = isProvider(session?.user);
  const seesAll = viewerIsProvider || isAdminRequest();
  const viewerId = session?.user.id;
  const forProvider = await loadProvider(searchParams.provider);
  // Orders imported from messengers stay hidden until the admin publishes them.
  const where = {
    ...(status === 'ALL' ? { status: { not: 'PENDING_REVIEW' as const } } : { status }),
    ...(seesAll ? {} : { customerId: viewerId ?? '-' }),
  };

  // A guest sees only the form: no query at all.
  const { total, totalPages, page, orders, failed } =
    seesAll || viewerId
      ? await loadOrders(where, requestedPage)
      : { total: 0, totalPages: 1, page: 1, orders: [], failed: false };

  const statusHref = (value: OrderStatus | 'ALL') =>
    value === 'OPEN' ? '/orders' : `/orders?status=${value}`;

  return (
    <div className="flex flex-col gap-8">
      <CinemaHero
        eyebrow={viewerIsProvider ? 'Кабинет исполнителя' : 'Техника с машинистом'}
        title={viewerIsProvider ? 'Лента заявок заказчиков' : 'Заявка на технику'}
        clips={['workers', 'house-frame']}
        camera={4}
        compact
      >
        {viewerIsProvider ? (
          <p>
            Открытые заявки заказчиков: откройте заявку и предложите свою технику и цену. Другие
            исполнители ваших цен не видят.
          </p>
        ) : (
          <p>
            Опишите задачу — её увидят исполнители со своей техникой и машинистами, включая парк{' '}
            {SITE.name}. Они пришлют цены, вы выберете лучшее. Сервис бесплатный.
          </p>
        )}
      </CinemaHero>

      {!viewerIsProvider && (
        <section id="new" className="scroll-mt-24">
          <h2 className="mb-3 text-lg font-semibold">
            {forProvider ? `Заявка для «${forProvider.name}»` : 'Новая заявка'}
          </h2>
          {forProvider && (
            <p className="mb-3 max-w-xl text-sm text-slate-600">
              Заявку увидит «{forProvider.name}» и другие исполнители — сравните предложения.
            </p>
          )}
          {viewerId ? (
            <Card className="max-w-xl">
              <NewOrderForm provider={forProvider} initial={orderPrefill(searchParams)} />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CallbackForm
                  source="orders"
                  title="Заявка без регистрации"
                  subtitle="Оставьте телефон и коротко опишите задачу — перезвоним и назовём цену."
                />
              </Card>
              <Card className="flex flex-col justify-center gap-3">
                <p className="font-semibold">Не знаете, какая техника нужна?</p>
                <p className="text-sm text-slate-600">
                  Ответьте на 3 вопроса — подберём машину, покажем цену и погоду на день работ.
                </p>
                <a
                  href="/#podbor"
                  className="w-fit rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Подобрать технику за 30 секунд
                </a>
              </Card>
            </div>
          )}
        </section>
      )}

      {(seesAll || viewerId) && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {viewerIsProvider && status === 'OPEN'
                ? 'Лента заявок заказчиков'
                : seesAll
                  ? STATUS_HEADINGS[status]
                  : `Мои заявки · ${STATUS_HEADINGS[status].toLowerCase()}`}
            </h2>
            <nav aria-label="Фильтр по статусу" className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => (
                <a
                  key={filter.value}
                  href={statusHref(filter.value)}
                  aria-current={filter.value === status ? 'page' : undefined}
                  className={
                    filter.value === status
                      ? 'rounded-full bg-amber-500 px-3 py-1 text-sm font-medium text-slate-950'
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

          {failed ? (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
              Список заявок сейчас не загрузился. Новую заявку можно оставить по телефону{' '}
              <a href={SITE.phoneHref} className="font-semibold text-amber-800 underline">
                {SITE.phone}
              </a>
              .
            </p>
          ) : orders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="font-medium text-slate-700">
                {status === 'ALL'
                  ? `Заявок пока нет — техника ${SITE.name} ждёт первой задачи.`
                  : 'Заявок с таким статусом нет.'}
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
                          {ORDER_STATUS_LABELS[order.status]}
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
                      {order.bids.length > 0 ? `Предложений: ${order.bids.length}` : 'Ждёт ответа'}
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
      )}
    </div>
  );
}
