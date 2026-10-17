import { unstable_cache } from 'next/cache';
import { prisma } from '@specai/database';
import {
  ACTIVITY_EVENTS_MAX,
  ACTIVITY_REVALIDATE_S,
  ACTIVITY_WINDOW_MS,
  COUNTED_BOOKING_STATUSES,
  COUNTED_ORDER_STATUSES,
  activityDayStart,
  buildActivity,
  onlineCount,
  type Activity,
} from './activity';
import { NEARBY_MAX_ROWS, PRESENCE_FRESH_MS } from './linePresence';

/**
 * The activity strip from the database (lib/activity.ts builds and checks
 * it). Selects only what an anonymous line needs: no names, phones,
 * descriptions, addresses beyond the city, prices or user ids.
 */
export async function loadActivityUncached(now: Date = new Date()): Promise<Activity> {
  const dayStart = activityDayStart(now);
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_MS);
  const orderStatus = { in: [...COUNTED_ORDER_STATUSES] };
  const bookingStatus = { in: [...COUNTED_BOOKING_STATUSES] };
  const [ordersToday, confirmedToday, line, orders, bookings] = await Promise.all([
    prisma.order.count({ where: { status: orderStatus, createdAt: { gte: dayStart } } }),
    prisma.booking.count({ where: { status: bookingStatus, confirmedAt: { gte: dayStart } } }),
    prisma.linePresence.findMany({
      where: {
        online: true,
        updatedAt: { gte: new Date(now.getTime() - PRESENCE_FRESH_MS) },
        equipment: { is: { status: 'AVAILABLE' } },
      },
      select: {
        online: true,
        onlineSince: true,
        timeZone: true,
        updatedAt: true,
        lat: true,
        lon: true,
        companyId: true,
        equipment: { select: { id: true, status: true, category: { select: { name: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: NEARBY_MAX_ROWS,
    }),
    prisma.order.findMany({
      where: { status: orderStatus, createdAt: { gte: since } },
      select: {
        createdAt: true,
        status: true,
        source: true,
        category: { select: { name: true } },
        location: { select: { city: true, latitude: true, longitude: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: ACTIVITY_EVENTS_MAX,
    }),
    prisma.booking.findMany({
      where: { status: bookingStatus, confirmedAt: { gte: since } },
      select: {
        status: true,
        confirmedAt: true,
        equipment: { select: { companyId: true, category: { select: { name: true } } } },
      },
      orderBy: { confirmedAt: 'desc' },
      take: ACTIVITY_EVENTS_MAX,
    }),
  ]);
  return buildActivity(
    { orders: ordersToday, online: onlineCount(line, now), confirmed: confirmedToday },
    { orders, line, bookings },
    now,
  );
}

const cachedActivity = unstable_cache(() => loadActivityUncached(), ['activity-v1'], {
  revalidate: ACTIVITY_REVALIDATE_S,
});

/**
 * The strip, cached for ACTIVITY_REVALIDATE_S for everybody (it holds nothing
 * personal). Null when the database is away: the strip is hidden then rather
 * than claiming a quiet day.
 */
export async function loadActivity(): Promise<Activity | null> {
  try {
    return await cachedActivity();
  } catch (error) {
    console.error('[activity] failed to load', error);
    return null;
  }
}
