import { NextRequest, NextResponse } from 'next/server';
import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import { cronAllowed } from '@/lib/cronAuth';
import { onceADay } from '@/lib/cronOnce';
import { digestsForCompanies, tomorrowRange } from '@/lib/eveningDigest';
import { orderPoint } from '@/lib/geo';
import { acceptedCategoryIds } from '@/lib/notifications/routing';
import { notifyCompany, notifyUser, notifyUsers } from '@/lib/notifications/notifyUser';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';
// A GET handler: without this Next keeps outgoing sends (Telegram, push,
// e-mail) in its Data Cache and never repeats an identical one.
export const fetchCache = 'force-no-store';

/**
 * Evening cron (19:00 Moscow, apps/web/vercel.json): the preorder digest.
 * Every provider gets one message with tomorrow's open orders in its
 * categories and radius («На завтра: 2 заявки — экскаватор, Елабуга; кран,
 * Челны»); for every CONFIRMED booking that starts tomorrow the customer, the
 * provider's managers and the assigned operator are reminded. Once a day
 * (lib/cronOnce.ts): a repeated call sends nothing.
 */
/** The evening digest may run from this Moscow hour on. */
const EVENING_FROM_HOUR = 18;

/** Hour of the day in Moscow (UTC+3 all year). */
function moscowHour(now: Date): number {
  return (now.getUTCHours() + 3) % 24;
}

export async function GET(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  // The digest is an evening one (the cron fires at 19:00 Moscow): an early
  // call must not use up the day's single run with half of the day's orders.
  if (moscowHour(new Date()) < EVENING_FROM_HOUR) {
    return NextResponse.json({ ok: true, skipped: 'too early' });
  }
  const result = await onceADay('evening', sendEveningNotifications);
  if (!result) return NextResponse.json({ ok: true, skipped: 'already sent today' });
  return NextResponse.json({ ok: true, ...result });
}

async function sendEveningNotifications() {
  const { start, end } = tomorrowRange();

  const [orders, companies, bookings, categoryRows] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'OPEN', desiredStartDate: { gte: start, lt: end } },
      select: {
        id: true,
        customerId: true,
        categoryId: true,
        category: { select: { name: true } },
        location: { select: { city: true, addressLine: true, latitude: true, longitude: true } },
      },
      take: 500,
    }),
    prisma.company.findMany({
      where: { isProvider: true },
      select: {
        id: true,
        baseLat: true,
        baseLon: true,
        baseAddress: true,
        deliveryRadiusKm: true,
        equipment: {
          where: { status: { not: 'RETIRED' } },
          select: { categoryId: true },
          distinct: ['categoryId'],
        },
        users: { where: { role: 'PROVIDER_ADMIN' }, select: { id: true } },
      },
      take: 1000,
    }),
    // Only confirmed: a PENDING booking may still be declined by the provider.
    prisma.booking.findMany({
      where: { status: 'CONFIRMED', startDate: { gte: start, lt: end } },
      select: {
        id: true,
        customerId: true,
        startDate: true,
        operator: { select: { userId: true } },
        equipment: { select: { name: true, companyId: true, company: { select: { name: true } } } },
      },
      take: 500,
    }),
    prisma.equipmentCategory.findMany({ select: { id: true, slug: true, parentId: true } }),
  ]);

  const digests = digestsForCompanies(
    companies.map((company) => ({
      id: company.id,
      userIds: company.users.map((user) => user.id),
      categoryIds: company.equipment.map((item) => item.categoryId),
      baseLat: company.baseLat,
      baseLon: company.baseLon,
      radiusKm: company.deliveryRadiusKm,
      baseAddress: company.baseAddress,
      isHouse: company.id === HOUSE_COMPANY_ID,
    })),
    orders.map((order) => {
      const point = orderPoint(order.location, SITE.city);
      return {
        id: order.id,
        customerId: order.customerId,
        categoryId: order.categoryId,
        categoryIds: acceptedCategoryIds(order.categoryId, categoryRows),
        categoryName: order.category?.name,
        city: order.location?.city,
        lat: point?.lat,
        lon: point?.lon,
      };
    }),
  );
  for (const digest of digests) {
    await notifyUsers(digest.userIds, { type: 'digest.evening', items: digest.items });
  }
  for (const booking of bookings) {
    const event = {
      type: 'booking.tomorrow' as const,
      bookingId: booking.id,
      equipmentName: booking.equipment.name,
      startDate: booking.startDate,
      providerName: booking.equipment.company.name,
    };
    await notifyUser(booking.customerId, event);
    await notifyCompany(booking.equipment.companyId, { ...event, audience: 'provider' });
    if (booking.operator?.userId) {
      await notifyUser(booking.operator.userId, { ...event, audience: 'operator' });
    }
  }
  return {
    tomorrowOrders: orders.length,
    providersNotified: digests.length,
    bookingsReminded: bookings.length,
  };
}
