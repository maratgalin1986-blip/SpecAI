// «Спрос рядом» (2026-10-23): once a Moscow day, between 09:00 and 20:00, a
// provider manager who is not on the line hears «Сегодня N заявок рядом —
// выйдите на линию». N counts real OPEN orders created today that fit the
// company by the same rule as the new-order alert (providerMatchesOrder).
// Push and Telegram only (routing.ts EVENT_CHANNELS). Pure helpers; the
// database side is lib/demandNudgeData.ts.
//
// routing.ts renders the message from demandNudgeText and this file matches
// with routing.ts: each side uses the other only inside functions, so the
// import cycle is safe.
import {
  pluralOrders,
  providerMatchesOrder,
  type OrderForMatch,
  type ProviderForMatch,
} from './notifications/routing';
import { todayStartMsk } from './providerFeed';

/** Where the message leads: the open orders (the app opens its orders screen for it). */
export const DEMAND_NUDGE_PATH = '/orders';

/** The daytime window in Moscow: from 09:00 up to (not including) 20:00. */
export const DEMAND_WINDOW_FROM_HOUR = 9;
export const DEMAND_WINDOW_TO_HOUR = 20;

const HOUR_MS = 3_600_000;

/** 00:00 in Moscow of the day `now` falls on (Moscow is UTC+3 all year). */
export function mskDayStart(now: Date): Date {
  return todayStartMsk(now);
}

/** Whether `now` is within 09:00–20:00 Moscow time. */
export function inDemandWindow(now: Date): boolean {
  const sinceMidnight = now.getTime() - mskDayStart(now).getTime();
  return (
    sinceMidnight >= DEMAND_WINDOW_FROM_HOUR * HOUR_MS &&
    sinceMidnight < DEMAND_WINDOW_TO_HOUR * HOUR_MS
  );
}

/** Not sent yet today (Moscow): never, or before today's midnight. */
export function demandNudgeDue(sentAt: Date | null | undefined, now: Date): boolean {
  return !sentAt || sentAt.getTime() < mskDayStart(now).getTime();
}

/** How many of the orders the provider would be alerted about. */
export function countNearbyOrders(
  provider: ProviderForMatch,
  orders: readonly OrderForMatch[],
): number {
  let count = 0;
  for (const order of orders) if (providerMatchesOrder(provider, order)) count += 1;
  return count;
}

/** «Сегодня 5 заявок рядом» and the call to go on the line. */
export function demandNudgeText(count: number): { title: string; body: string } {
  return {
    title: `Сегодня ${count} ${pluralOrders(count)} рядом`,
    body: 'Выйдите на линию — заказчики видят свободные машины на карте и пишут первым.',
  };
}
