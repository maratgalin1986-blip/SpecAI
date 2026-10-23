// «Спрос рядом» (2026-10-23): once a Moscow day, between 09:00 and 12:00
// Moscow time, a provider manager whose company has no machine on the line
// hears «Сегодня N заявок рядом — выйдите на линию». N counts real OPEN orders created today that fit the
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

/**
 * The window in Moscow time: from 09:00 up to (not including) 12:00. Providers
 * are all over Russia (CLAUDE.md), from MSK−1 to MSK+9, and a narrow morning
 * window in Moscow is daytime locally everywhere: 08–11 in Kaliningrad, 11–14
 * in Yekaterinburg, 16–19 in Vladivostok, 18–21 in Kamchatka. A wider one
 * (09–20 MSK) would wake Vladivostok at night.
 */
export const DEMAND_WINDOW_FROM_HOUR = 9;
export const DEMAND_WINDOW_TO_HOUR = 12;

const HOUR_MS = 3_600_000;

/** 00:00 in Moscow of the day `now` falls on (Moscow is UTC+3 all year). */
export function mskDayStart(now: Date): Date {
  return todayStartMsk(now);
}

/** Whether `now` is within 09:00–12:00 Moscow time. */
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
