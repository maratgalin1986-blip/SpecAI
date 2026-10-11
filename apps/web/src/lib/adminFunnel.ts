// Order funnel for the admin (/admin/funnel): how many orders of a period
// are at each stage of the ride-like status line (lib/orderTimeline.ts),
// which orders got stuck, and how fast providers answer. Pure functions,
// unit-tested; the page loads the rows.

export type FunnelStageId = 'created' | 'offers' | 'chosen' | 'onsite' | 'done' | 'cancelled';

export interface FunnelOrder {
  id: string;
  /** OPEN | MATCHED | CANCELLED | PENDING_REVIEW */
  status: string;
  createdAt: Date;
  /** Bids on the order, any status. */
  bids: { createdAt: Date; status: string }[];
  /** Status of the booking made from the accepted bid, if any. */
  bookingStatus?: string | null;
}

export interface FunnelStage {
  id: FunnelStageId;
  title: string;
  count: number;
  /** Share of the period's orders, 0..1 (0 without orders). */
  share: number;
}

export const FUNNEL_PERIODS = [7, 30, 90] as const;
export type FunnelPeriod = (typeof FUNNEL_PERIODS)[number];
export const DEFAULT_FUNNEL_PERIOD: FunnelPeriod = 30;

/** 7 / 30 / 90 from a query string; the default otherwise. */
export function parseFunnelPeriod(value: string | string[] | undefined): FunnelPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  const days = Number(raw);
  return (FUNNEL_PERIODS as readonly number[]).includes(days)
    ? (days as FunnelPeriod)
    : DEFAULT_FUNNEL_PERIOD;
}

const STAGE_TITLES: Record<FunnelStageId, string> = {
  created: 'Создан',
  offers: 'Предложения',
  chosen: 'Исполнитель выбран',
  onsite: 'На объекте',
  done: 'Завершён',
  cancelled: 'Отменён',
};

const STAGE_ORDER: FunnelStageId[] = ['created', 'offers', 'chosen', 'onsite', 'done', 'cancelled'];

/** The one stage an order is at now. */
export function funnelStageOf(order: FunnelOrder): FunnelStageId {
  if (order.status === 'CANCELLED') return 'cancelled';
  const booking = order.bookingStatus ?? null;
  if (booking === 'COMPLETED') return 'done';
  if (booking === 'ACTIVE') return 'onsite';
  // A cancelled booking reopens its order (api/bookings/[id]), so MATCHED
  // means the customer chose someone and the booking waits or is confirmed.
  if (order.status === 'MATCHED') return 'chosen';
  if (order.bids.length > 0) return 'offers';
  return 'created';
}

/** Orders created within the last `days` days (chat imports under review are not counted). */
export function ordersInPeriod<T extends FunnelOrder>(orders: T[], days: number, now: Date): T[] {
  const from = now.getTime() - days * 86_400_000;
  return orders.filter(
    (order) => order.status !== 'PENDING_REVIEW' && order.createdAt.getTime() >= from,
  );
}

export function funnelStages(orders: FunnelOrder[]): FunnelStage[] {
  const counts = new Map<FunnelStageId, number>();
  for (const order of orders) {
    const stage = funnelStageOf(order);
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  const total = orders.length;
  return STAGE_ORDER.map((id) => {
    const count = counts.get(id) ?? 0;
    return { id, title: STAGE_TITLES[id], count, share: total > 0 ? count / total : 0 };
  });
}

/** Share of the period's orders that reached a chosen provider or further, 0..1. */
export function conversionToProvider(stages: FunnelStage[]): number {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  if (total === 0) return 0;
  const reached = stages
    .filter((stage) => stage.id === 'chosen' || stage.id === 'onsite' || stage.id === 'done')
    .reduce((sum, stage) => sum + stage.count, 0);
  return reached / total;
}

export type StuckReason = 'no_bids' | 'no_choice';

export interface StuckOrder<T extends FunnelOrder = FunnelOrder> {
  order: T;
  reason: StuckReason;
  /** Hours the order has been waiting in this state. */
  hours: number;
}

export const STUCK_NO_BIDS_HOURS = 24;
export const STUCK_NO_CHOICE_HOURS = 48;

export const STUCK_REASON_LABELS: Record<StuckReason, string> = {
  no_bids: 'Нет предложений',
  no_choice: 'Заказчик не выбрал',
};

/**
 * Orders that need a push from the admin: open for more than 24 h without a
 * single bid, or with bids the customer has not acted on for 48 h (the order
 * is still OPEN and the oldest bid is that old). Longest wait first. Looks at
 * every open order, not only the period's: an old stuck order is still stuck.
 */
export function stuckOrders<T extends FunnelOrder>(orders: T[], now: Date): StuckOrder<T>[] {
  const result: StuckOrder<T>[] = [];
  for (const order of orders) {
    if (order.status !== 'OPEN') continue;
    if (order.bids.length === 0) {
      const hours = hoursBetween(order.createdAt, now);
      if (hours >= STUCK_NO_BIDS_HOURS) result.push({ order, reason: 'no_bids', hours });
      continue;
    }
    const pending = order.bids.filter((bid) => bid.status === 'PENDING');
    if (pending.length === 0) continue;
    const oldest = Math.min(...pending.map((bid) => bid.createdAt.getTime()));
    const hours = hoursBetween(new Date(oldest), now);
    if (hours >= STUCK_NO_CHOICE_HOURS) result.push({ order, reason: 'no_choice', hours });
  }
  return result.sort((a, b) => b.hours - a.hours);
}

function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);
}

/** Median of «first bid − order created» in milliseconds; null when no order got a bid. */
export function medianTimeToFirstBid(orders: FunnelOrder[]): number | null {
  const waits: number[] = [];
  for (const order of orders) {
    if (order.bids.length === 0) continue;
    const first = Math.min(...order.bids.map((bid) => bid.createdAt.getTime()));
    waits.push(Math.max(0, first - order.createdAt.getTime()));
  }
  if (waits.length === 0) return null;
  waits.sort((a, b) => a - b);
  const middle = Math.floor(waits.length / 2);
  return waits.length % 2 === 1 ? waits[middle]! : (waits[middle - 1]! + waits[middle]!) / 2;
}

/** «12 мин», «3,5 ч», «2 д 4 ч» — a duration for the dashboard. */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} мин`;
  const hours = ms / 3_600_000;
  if (hours < 24) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded.toLocaleString('ru-RU')} ч`;
  }
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest > 0 ? `${days} д ${rest} ч` : `${days} д`;
}

/** Whole hours as «3 ч», «2 д 5 ч». */
export function formatHours(hours: number): string {
  return formatDuration(hours * 3_600_000);
}
