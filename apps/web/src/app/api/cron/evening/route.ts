import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { cronAllowed } from '@/lib/cronAuth';
import { digestsForCompanies, tomorrowRange } from '@/lib/eveningDigest';
import { notifyUser, notifyUsers } from '@/lib/notifications/notifyUser';

export const dynamic = 'force-dynamic';

/**
 * Evening cron (19:00 Moscow, apps/web/vercel.json): the preorder digest.
 * Every provider gets one message with tomorrow's open orders in its
 * categories and radius («На завтра: 2 заявки — экскаватор, Елабуга; кран,
 * Челны»); customers whose booking starts tomorrow are reminded.
 */
export async function GET(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { start, end } = tomorrowRange();

  const [orders, companies, bookings] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'OPEN', desiredStartDate: { gte: start, lt: end } },
      select: {
        id: true,
        customerId: true,
        categoryId: true,
        category: { select: { name: true } },
        location: { select: { city: true, latitude: true, longitude: true } },
      },
      take: 500,
    }),
    prisma.company.findMany({
      where: { isProvider: true },
      select: {
        id: true,
        baseLat: true,
        baseLon: true,
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
    prisma.booking.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] }, startDate: { gte: start, lt: end } },
      select: {
        id: true,
        customerId: true,
        startDate: true,
        equipment: { select: { name: true, company: { select: { name: true } } } },
      },
      take: 500,
    }),
  ]);

  const digests = digestsForCompanies(
    companies.map((company) => ({
      id: company.id,
      userIds: company.users.map((user) => user.id),
      categoryIds: company.equipment.map((item) => item.categoryId),
      baseLat: company.baseLat,
      baseLon: company.baseLon,
      radiusKm: company.deliveryRadiusKm,
    })),
    orders.map((order) => ({
      id: order.id,
      customerId: order.customerId,
      categoryId: order.categoryId,
      categoryName: order.category?.name,
      city: order.location?.city,
      lat: order.location?.latitude,
      lon: order.location?.longitude,
    })),
  );
  for (const digest of digests) {
    await notifyUsers(digest.userIds, { type: 'digest.evening', items: digest.items });
  }
  for (const booking of bookings) {
    await notifyUser(booking.customerId, {
      type: 'booking.tomorrow',
      bookingId: booking.id,
      equipmentName: booking.equipment.name,
      startDate: booking.startDate,
      providerName: booking.equipment.company.name,
    });
  }
  return NextResponse.json({
    ok: true,
    tomorrowOrders: orders.length,
    providersNotified: digests.length,
    customersReminded: bookings.length,
  });
}
