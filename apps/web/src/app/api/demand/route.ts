import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { PUBLIC_FLEET } from '@/lib/fleet';
import {
  DEMAND_COLORS,
  DEMAND_LABELS,
  DEMAND_WINDOW_DAYS,
  demandSummary,
  providerDemandText,
} from '@/lib/demand';

export const dynamic = 'force-dynamic';

/**
 * GET /api/demand — the demand indicator (lib/demand.ts): orders of the last
 * 14 days by machine category and by city against the free machines. Public
 * and aggregated (no order texts, no customers), cached for ten minutes.
 */
export async function GET() {
  const now = new Date();
  const since = new Date(now.getTime() - DEMAND_WINDOW_DAYS * 86_400_000);
  const [orders, supply] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: since }, status: { in: ['OPEN', 'MATCHED'] } },
      select: {
        categoryId: true,
        createdAt: true,
        desiredStartDate: true,
        category: { select: { name: true } },
        location: { select: { city: true, latitude: true, longitude: true } },
      },
      take: 5000,
    }),
    prisma.equipment.findMany({
      where: { ...PUBLIC_FLEET, status: 'AVAILABLE' },
      select: { categoryId: true, company: { select: { baseLat: true, baseLon: true } } },
      take: 5000,
    }),
  ]);
  const summary = demandSummary(
    orders.map((order) => ({
      categoryId: order.categoryId,
      categoryName: order.category?.name,
      city: order.location?.city,
      lat: order.location?.latitude,
      lon: order.location?.longitude,
      createdAt: order.createdAt,
      desiredStartDate: order.desiredStartDate,
    })),
    supply.map((item) => ({
      categoryId: item.categoryId,
      lat: item.company.baseLat,
      lon: item.company.baseLon,
    })),
    now,
  );
  return NextResponse.json(
    {
      ...summary,
      labels: DEMAND_LABELS,
      colors: DEMAND_COLORS,
      providerText: providerDemandText(summary),
      generatedAt: now.toISOString(),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } },
  );
}
