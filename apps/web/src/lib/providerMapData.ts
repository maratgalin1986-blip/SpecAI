import type { PrismaClient } from '@specai/database';
import { toMapPins, type ProviderMapPin } from './providerMap';

/**
 * Providers with a base for the map, from the database. Selects only the
 * fields the map shows; toMapPins checks them again and builds the markers.
 * Machinery that is written off (RETIRED) is not counted.
 */
export async function loadMapPins(prisma: PrismaClient): Promise<ProviderMapPin[]> {
  const companies = await prisma.company.findMany({
    // Every provider company with a base (the aggregator); toMapPins puts
    // СпецПласт16 first.
    where: { isProvider: true, baseLat: { not: null }, baseLon: { not: null } },
    select: {
      id: true,
      name: true,
      isProvider: true,
      baseLat: true,
      baseLon: true,
      pinImageUrl: true,
      pinNote: true,
      _count: { select: { equipment: { where: { status: { not: 'RETIRED' } } } } },
    },
    take: 2000,
  });
  return toMapPins(
    companies.map(({ _count, ...company }) => ({ ...company, equipmentCount: _count.equipment })),
  );
}
