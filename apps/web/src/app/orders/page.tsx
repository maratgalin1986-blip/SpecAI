import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { prisma } from '@specai/database';
import { ORDER_STATUS_LABELS, orderStatusSchema, type OrderStatus } from '@specai/shared';
import { Card } from '@specai/ui';
import { NewOrderForm } from '@/components/NewOrderForm';
import { OrderBoardCard, type BoardViewer } from '@/components/OrderBoardCard';
import { Pagination } from '@/components/Pagination';
import { parseEnumParam, parsePage, totalPagesFor } from '@/lib/pagination';
import { CinemaHero } from '@/components/CinemaHero';
import { authOptions } from '@/lib/auth';
import { isAdminRequest } from '@/lib/admin';
import { isProvider } from '@/lib/fleet';
import { SITE } from '@/lib/site';
import { GuestOrderForm } from '@/components/GuestOrderForm';
import { OfferNow } from '@/components/OfferNow';
import { loadOfferNow } from '@/lib/offerNowData';
import { orderPrefill } from '@/lib/quickOrder';
import {
  BOARD_SORT,
  BOARD_SORT_LABELS,
  BOARD_WHEN,
  BOARD_WHEN_LABELS,
  boardHref,
  parseBoardQuery,
} from '@/lib/orderBoard';
import { loadOrderBoard } from '@/lib/orderBoardData';
import { pluralizeRu } from '@/lib/pluralize';
import { MODE_COOKIE, cabinetMode } from '@/lib/cabinetMode';
import { ModeSwitch } from '@/components/ModeSwitch';
import { Hint } from '@/components/Hint';

export const metadata: Metadata = {
  title: 'Заявки на спецтехнику по всей России — доска заказов',
  description:
    'Открытые заявки заказчиков на экскаваторы, краны, самосвалы и другую технику с машинистом по всей России. Исполнители рядом с объектом предлагают цену, заказчик выбирает. Разместить заявку бесплатно.',
  alternates: { canonical: '/orders' },
};

export const dynamic = 'force-dynamic';

const MY_PAGE_SIZE = 20;
const MY_PAGE_PARAM = 'mp';

const STATUS_FILTERS: { value: OrderStatus | 'ALL'; label: string }[] = [
  { value: 'OPEN', label: 'Открытые' },
  { value: 'MATCHED', label: 'Закрытые' },
  { value: 'CANCELLED', label: 'Отменённые' },
  { value: 'ALL', label: 'Все' },
];

const STATUS_HEADINGS: Record<OrderStatus | 'ALL', string> = {
  OPEN: 'открытые',
  MATCHED: 'закрытые',
  CANCELLED: 'отменённые',
  ALL: 'все',
};

interface OrdersSearchParams {
  status?: string;
  /** The board's page. */
  page?: string;
  /** The page of «Мои заявки». */
  mp?: string;
  /** From the map or /providers: the provider the order is meant for. */
  provider?: string;
  /** From the cabinet's quick-order panel (lib/quickOrder.ts). */
  category?: string;
  start?: string;
  now?: string;
  address?: string;
  /** Board filters (lib/orderBoard.ts). */
  group?: string;
  city?: string;
  when?: string;
  sort?: string;
  /** One login, two modes: a provider orders machinery as a customer. */
  mode?: string;
}

type OrderWhere = NonNullable<Parameters<typeof prisma.order.count>[0]>['where'];

/**
 * The customer's own orders. Without a database it is empty (logged), so the
 * rest of the page renders instead of a 500.
 */
async function loadMyOrders(where: OrderWhere, requestedPage: number) {
  try {
    const total = await prisma.order.count({ where });
    const totalPages = totalPagesFor(total, MY_PAGE_SIZE);
    const page = Math.min(requestedPage, totalPages);
    const orders = await prisma.order.findMany({
      where,
      include: { category: true, bids: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * MY_PAGE_SIZE,
      take: MY_PAGE_SIZE,
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

const field =
  'w-full rounded-xl border border-graphite-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-signal-600 focus:ring-2 focus:ring-signal-200';

export default async function OrdersPage({ searchParams }: { searchParams: OrdersSearchParams }) {
  // Aggregator: the board of open orders is public; a provider bids, a
  // customer also sees «Мои заявки», a guest is sent to sign in to bid.
  const session = await getServerSession(authOptions);
  const accountIsProvider = isProvider(session?.user);
  // A provider in the customer mode places orders and sees «Мои заявки» here.
  const customerMode =
    accountIsProvider &&
    cabinetMode(session?.user, searchParams.mode, cookies().get(MODE_COOKIE)?.value) === 'customer';
  const viewerIsProvider = accountIsProvider && !customerMode;
  const isAdmin = isAdminRequest();
  const viewerId = session?.user.id;
  const viewerIsCustomer = Boolean(viewerId) && !viewerIsProvider;

  const boardQuery = parseBoardQuery(searchParams);
  const status = parseEnumParam(
    searchParams.status,
    [...orderStatusSchema.options, 'ALL'] as const,
    'OPEN',
  );
  const myWhere = {
    ...(status === 'ALL' ? { status: { not: 'PENDING_REVIEW' as const } } : { status }),
    customerId: viewerId ?? '-',
  };

  const [board, forProvider, mine, offer] = await Promise.all([
    loadOrderBoard(boardQuery),
    loadProvider(searchParams.provider),
    viewerIsCustomer ? loadMyOrders(myWhere, parsePage(searchParams.mp)) : null,
    // Not for providers, nor on an order meant for one provider (no block there).
    viewerIsProvider || searchParams.provider ? null : loadOfferNow(),
  ]);

  // A provider's own order (placed in the customer mode) is «Моя заявка»;
  // other orders keep «Предложить цену» for a provider in either mode.
  const viewerFor = (customerId: string): BoardViewer =>
    viewerId && viewerId === customerId
      ? 'owner'
      : accountIsProvider || isAdmin
        ? 'provider'
        : viewerId
          ? 'customer'
          : 'guest';

  // Someone came to order (from a provider's page or the cabinet's quick
  // order): the form goes first, the board after it.
  const cameToOrder = Boolean(
    forProvider || searchParams.category || searchParams.start || searchParams.address,
  );
  const statusHref = (value: OrderStatus | 'ALL') =>
    value === 'OPEN' ? '/orders' : `/orders?status=${value}`;
  const filterParams = {
    group: boardQuery.group ?? undefined,
    city: boardQuery.city ?? undefined,
    when: boardQuery.when === 'all' ? undefined : boardQuery.when,
    sort: boardQuery.sort === 'newest' ? undefined : boardQuery.sort,
  };
  const hasFilters = Boolean(boardQuery.group || boardQuery.city || boardQuery.when !== 'all');

  const orderForm = !viewerIsProvider && (
    <>
      {/* Owner, 2026-10-18: СпецПласт16's machines first, then who is on the
          line; «Заказать» fills the form right below. Not for an order meant
          for one provider. */}
      {offer && !forProvider && <OfferNow house={offer.house} line={offer.line} formAnchor="new" />}
      <section id="new" data-order-form className="scroll-mt-24">
        <h2 className="mb-3 text-lg font-semibold">
          {forProvider ? `Заявка для «${forProvider.name}»` : 'Разместить заявку'}
        </h2>
        {viewerId ? (
          <p className="mb-3 max-w-xl text-sm text-slate-600">
            {forProvider
              ? `Заявку увидит «${forProvider.name}» и другие исполнители — сравните предложения.`
              : `Заявку увидят все исполнители со своей техникой, включая парк ${SITE.name}, и пришлют цены. Бесплатно.`}
          </p>
        ) : (
          // A guest's order goes on the board (POST /api/orders/guest); the
          // phone stays hidden and opens to providers only on request.
          <p className="mb-3 max-w-xl text-sm text-slate-600">
            Без регистрации: заявку увидят{' '}
            {forProvider ? `«${forProvider.name}» и другие исполнители` : 'все исполнители'} и
            пришлют цены, а телефон откроется только по запросу исполнителя. С аккаунтом удобнее
            сравнивать предложения:{' '}
            <a href="/register" className="underline">
              зарегистрируйтесь
            </a>{' '}
            или{' '}
            <a href="/login" className="underline">
              войдите
            </a>{' '}
            — это бесплатно.
          </p>
        )}
        {!viewerId && <Hint id="orders-guest" className="mb-3 max-w-xl" />}
        {viewerId ? (
          <Card className="max-w-xl">
            <NewOrderForm provider={forProvider} initial={orderPrefill(searchParams)} />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* No account: the guest form puts the order on the board
              (POST /api/orders/guest); providers bid as on any order. */}
            <Card>
              <GuestOrderForm provider={forProvider} initial={orderPrefill(searchParams)} />
            </Card>
            <Card className="flex flex-col justify-center gap-3 self-start">
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
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      <CinemaHero
        eyebrow="Доска заказов · вся Россия"
        title="Заявки на спецтехнику"
        clips={['workers', 'house-frame']}
        camera={4}
        compact
      >
        <p>
          {viewerIsProvider
            ? 'Открытые заявки заказчиков: откройте заявку и предложите свою технику и цену. Другие исполнители ваших цен не видят.'
            : `Заказчики размещают заявки, исполнители со своей техникой и машинистами предлагают цены — включая парк ${SITE.name}. Заказчик выбирает лучшее. Сервис бесплатный.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {viewerIsProvider ? (
            <a href="/provider" className="cab-action">
              Кабинет исполнителя
            </a>
          ) : (
            <>
              <a href="#new" className="cab-action" data-cta="place-order">
                Разместить заявку
              </a>
              {accountIsProvider ? (
                <a
                  href="/provider"
                  className="cab-ghost border-white/40 bg-transparent text-white hover:border-white"
                >
                  Кабинет исполнителя
                </a>
              ) : (
                <a
                  href="/register?type=provider"
                  className="cab-ghost border-white/40 bg-transparent text-white hover:border-white"
                  data-cta="join-provider"
                >
                  Встать на линию
                </a>
              )}
            </>
          )}
        </div>
      </CinemaHero>

      {accountIsProvider && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-graphite-600">
            {customerMode
              ? 'Вы заказываете технику как заказчик.'
              : 'Вы смотрите заявки как исполнитель.'}
          </p>
          <ModeSwitch
            current={customerMode ? 'customer' : 'provider'}
            customerHref="/orders?mode=customer"
            providerHref="/orders?mode=provider"
          />
        </div>
      )}

      {cameToOrder && orderForm}

      {mine && (
        <section className="flex flex-col gap-3" aria-labelledby="my-orders">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="my-orders" className="text-lg font-semibold">
              Мои заявки · {STATUS_HEADINGS[status]}
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
          {mine.failed ? (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
              Список заявок сейчас не загрузился. Новую заявку можно оставить по телефону{' '}
              <a href={SITE.phoneHref} className="font-semibold text-amber-800 underline">
                {SITE.phone}
              </a>
              .
            </p>
          ) : mine.orders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              {status === 'OPEN' ? (
                <>
                  У вас пока нет открытых заявок —{' '}
                  <a href="#new" className="font-medium text-amber-700 hover:underline">
                    разместите первую
                  </a>
                  .
                </>
              ) : (
                <>
                  Заявок с таким статусом нет.{' '}
                  <a href="/orders" className="font-medium text-amber-700 hover:underline">
                    Сбросить фильтр
                  </a>
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {mine.orders.map((order) => (
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
                    <p className="text-sm text-slate-500">
                      {order.bids.length > 0 ? `Предложений: ${order.bids.length}` : 'Ждёт ответа'}
                    </p>
                  </Card>
                </a>
              ))}
            </div>
          )}
          <Pagination
            page={mine.page}
            totalPages={mine.totalPages}
            basePath="/orders"
            pageParam={MY_PAGE_PARAM}
            searchParams={{ status: status === 'OPEN' ? undefined : status }}
          />
        </section>
      )}

      <section
        className="scroll-mt-24 flex flex-col gap-4"
        aria-labelledby="board-title"
        id="board"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="cab-eyebrow">Открытые заявки</p>
            <h2 id="board-title" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              {board.total > 0
                ? `${pluralizeRu(board.total, ['заявка', 'заявки', 'заявок'])} ждут исполнителя`
                : 'Доска заказов'}
            </h2>
          </div>
          {hasFilters && (
            <a
              href="/orders#board"
              className="text-sm font-medium text-graphite-500 hover:text-graphite-900"
            >
              Сбросить фильтры ×
            </a>
          )}
        </div>

        {board.groups.length > 0 && (
          <nav
            aria-label="Вид техники"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          >
            <a
              href={boardHref({ ...boardQuery, group: null, page: 1 })}
              aria-current={!boardQuery.group ? 'page' : undefined}
              className={
                !boardQuery.group
                  ? 'shrink-0 rounded-full bg-graphite-950 px-4 py-2 text-sm font-semibold text-white'
                  : 'shrink-0 rounded-full border border-graphite-200 bg-white px-4 py-2 text-sm font-semibold text-graphite-700 hover:border-graphite-900'
              }
            >
              Вся техника
            </a>
            {board.groups.map((group) => (
              <a
                key={group.id}
                href={boardHref({ ...boardQuery, group: group.id, page: 1 })}
                aria-current={group.id === boardQuery.group ? 'page' : undefined}
                className={
                  group.id === boardQuery.group
                    ? 'shrink-0 rounded-full bg-graphite-950 px-4 py-2 text-sm font-semibold text-white'
                    : 'shrink-0 rounded-full border border-graphite-200 bg-white px-4 py-2 text-sm font-semibold text-graphite-700 hover:border-graphite-900'
                }
              >
                {group.label}
              </a>
            ))}
          </nav>
        )}

        <form
          method="get"
          action="/orders#board"
          className="grid grid-cols-2 items-end gap-3 rounded-3xl border border-graphite-100 bg-white p-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:p-5"
        >
          {boardQuery.group && <input type="hidden" name="group" value={boardQuery.group} />}
          <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
            <span className="cab-eyebrow text-graphite-500">Город</span>
            <select name="city" defaultValue={boardQuery.city ?? ''} className={field}>
              <option value="">Любой</option>
              {board.cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
              {boardQuery.city && !board.cities.includes(boardQuery.city) && (
                <option value={boardQuery.city}>{boardQuery.city}</option>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="cab-eyebrow text-graphite-500">Когда</span>
            <select name="when" defaultValue={boardQuery.when} className={field}>
              {BOARD_WHEN.map((when) => (
                <option key={when} value={when}>
                  {BOARD_WHEN_LABELS[when]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="cab-eyebrow text-graphite-500">Сортировка</span>
            <select name="sort" defaultValue={boardQuery.sort} className={field}>
              {BOARD_SORT.map((sort) => (
                <option key={sort} value={sort}>
                  {BOARD_SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="cab-action col-span-2 sm:col-span-1">
            Показать
          </button>
        </form>

        <p className="text-sm text-graphite-600" aria-live="polite">
          Найдено: {board.total}
          {board.totalPages > 1 && ` · страница ${board.page} из ${board.totalPages}`}
          {' · '}
          заказчик виден как «Анна П.», контакты — после подтверждения брони, а телефон из заявок
          без аккаунта — по кнопке «Показать телефон»
        </p>

        {board.items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-graphite-200 bg-white p-8 text-center">
            <p className="font-semibold text-graphite-800">
              {hasFilters ? 'По этим фильтрам открытых заявок нет' : 'Открытых заявок сейчас нет'}
            </p>
            <p className="mt-2 text-sm text-graphite-600">
              {hasFilters ? (
                <a href="/orders#board" className="font-medium text-signal-700 hover:underline">
                  Показать все заявки
                </a>
              ) : viewerIsProvider ? (
                'Включите уведомления в кабинете — новая заявка придёт сразу.'
              ) : (
                <>
                  Разместите свою —{' '}
                  <a href="#new" className="font-medium text-signal-700 hover:underline">
                    исполнители ответят ценами
                  </a>
                  .
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {board.items.map((item) => (
              <OrderBoardCard
                key={item.card.id}
                card={item.card}
                viewer={viewerFor(item.customerId)}
              />
            ))}
          </div>
        )}

        <Pagination
          page={board.page}
          totalPages={board.totalPages}
          basePath="/orders"
          searchParams={filterParams}
        />
      </section>

      {!cameToOrder && orderForm}
    </div>
  );
}
