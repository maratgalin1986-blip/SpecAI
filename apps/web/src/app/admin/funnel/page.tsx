import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { adminGate } from '@/components/admin/AdminGate';
import { AdminPageHeader, AdminTag, StatTile, chipClass } from '@/components/admin/AdminUi';
import {
  FUNNEL_PERIODS,
  STUCK_REASON_LABELS,
  conversionToProvider,
  formatDuration,
  formatHours,
  funnelStages,
  medianTimeToFirstBid,
  ordersInPeriod,
  parseFunnelPeriod,
  stuckOrders,
  type FunnelStageId,
} from '@/lib/adminFunnel';
import { clipText } from '@/lib/adminFeed';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Воронка заявок · CRM', robots: { index: false } };

type Query = Record<string, string | string[] | undefined>;

const STAGE_BAR: Record<FunnelStageId, string> = {
  created: 'bg-graphite-300',
  offers: 'bg-graphite-500',
  chosen: 'bg-graphite-700',
  onsite: 'bg-signal-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-red-400',
};

const MAX_PERIOD = Math.max(...FUNNEL_PERIODS);

export default async function AdminFunnelPage({ searchParams }: { searchParams: Query }) {
  const gate = adminGate();
  if (gate) return gate;

  const now = new Date();
  const period = parseFunnelPeriod(searchParams.period);
  // The longest period's orders plus every open order (an old one can be stuck).
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { createdAt: { gte: new Date(now.getTime() - MAX_PERIOD * 86_400_000) } },
        { status: 'OPEN' },
      ],
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      description: true,
      desiredStartDate: true,
      source: true,
      category: { select: { name: true } },
      location: { select: { city: true } },
      bids: { select: { createdAt: true, status: true } },
      booking: { select: { status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const rows = orders.map((order) => ({
    ...order,
    bookingStatus: order.booking?.status ?? null,
  }));

  const inPeriod = ordersInPeriod(rows, period, now);
  const stages = funnelStages(inPeriod);
  const conversion = conversionToProvider(stages);
  const median = medianTimeToFirstBid(inPeriod);
  const stuck = stuckOrders(rows, now);
  const pendingReview = rows.filter((order) => order.status === 'PENDING_REVIEW').length;
  const maxCount = Math.max(1, ...stages.map((stage) => stage.count));

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Воронка заявок"
        text="Сколько заявок дошло до каждого шага: от публикации до завершённой работы. Стадия — по статусу заявки и её брони."
      >
        <nav aria-label="Период" className="flex gap-1.5">
          {FUNNEL_PERIODS.map((days) => (
            <a
              key={days}
              href={`/admin/funnel?period=${days}`}
              aria-current={days === period ? 'page' : undefined}
              className={chipClass(days === period)}
            >
              {days} дней
            </a>
          ))}
        </nav>
      </AdminPageHeader>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={`Заявок за ${period} дн.`} value={inPeriod.length} tone="dark" />
        <StatTile
          label="Дошли до исполнителя"
          value={`${Math.round(conversion * 100)}%`}
          hint="выбран, на объекте или завершён"
        />
        <StatTile
          label="Первое предложение"
          value={median === null ? '—' : formatDuration(median)}
          hint="медиана от публикации до первой цены"
        />
        <StatTile
          label="Застряли"
          value={stuck.length}
          hint={stuck.length > 0 ? 'нужен звонок' : 'всё движется'}
        />
      </div>

      <section className="cab-card flex flex-col gap-3">
        <h2 className="font-semibold text-graphite-950">Стадии</h2>
        {inPeriod.length === 0 ? (
          <p className="text-sm text-graphite-500">За этот период заявок не было.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {stages.map((stage) => (
              <li
                key={stage.id}
                className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_7rem]"
              >
                <span className="truncate font-semibold text-graphite-800">{stage.title}</span>
                <span className="h-5 overflow-hidden rounded bg-graphite-50">
                  <span
                    className={`block h-full rounded ${STAGE_BAR[stage.id]}`}
                    style={{
                      width: `${Math.max(stage.count > 0 ? 2 : 0, (stage.count / maxCount) * 100)}%`,
                    }}
                  />
                </span>
                <span className="text-right font-mono tabular-nums text-graphite-800">
                  {stage.count}{' '}
                  <span className="text-graphite-400">{Math.round(stage.share * 100)}%</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {pendingReview > 0 && (
          <p className="text-xs text-graphite-500">
            Ещё {pendingReview} заявок из чатов ждут проверки и в воронку не входят —{' '}
            <a href="/admin" className="underline">
              проверить
            </a>
            .
          </p>
        )}
      </section>

      <section className="cab-card flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-graphite-950">
            Застрявшие заявки <span className="text-graphite-400">({stuck.length})</span>
          </h2>
          <p className="text-sm text-graphite-600">
            Открыты больше суток без предложений, или заказчик не выбирает исполнителя двое суток.
          </p>
        </div>
        {stuck.length === 0 ? (
          <p className="text-sm text-graphite-500">Таких заявок нет.</p>
        ) : (
          <ul className="divide-y divide-graphite-100">
            {stuck.map(({ order, reason, hours }) => (
              <li
                key={order.id}
                className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <a
                    href={`/orders/${order.id}`}
                    className="font-semibold text-graphite-950 hover:text-signal-700"
                  >
                    {clipText(order.description, 90) || 'Заявка без описания'}
                  </a>
                  <p className="text-xs text-graphite-500">
                    {[order.category?.name, order.location?.city].filter(Boolean).join(' · ') ||
                      'без категории'}{' '}
                    · с{' '}
                    {order.desiredStartDate.toLocaleDateString('ru-RU', {
                      timeZone: 'Europe/Moscow',
                    })}
                    {order.bids.length > 0 ? ` · предложений: ${order.bids.length}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <AdminTag tone={reason === 'no_bids' ? 'red' : 'amber'}>
                    {STUCK_REASON_LABELS[reason]}
                  </AdminTag>
                  <span className="font-mono text-xs tabular-nums text-graphite-600">
                    {formatHours(hours)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
