import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { adminGate } from '@/components/admin/AdminGate';
import { AdminProvidersTable } from '@/components/admin/AdminProvidersTable';
import { AdminPageHeader, StatTile } from '@/components/admin/AdminUi';
import { PROVIDER_FILTERS, type ProviderFilter, type ProviderRow } from '@/lib/adminProviders';
import { loadCompanyStats } from '@/lib/companyStats';
import { documentsSummary } from '@/lib/documents';
import { reliability } from '@/lib/reliability';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Исполнители · CRM', robots: { index: false } };

type Query = Record<string, string | string[] | undefined>;

function parseFilter(value: string | string[] | undefined): ProviderFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return PROVIDER_FILTERS.some((item) => item.id === raw) ? (raw as ProviderFilter) : 'all';
}

async function loadRows(now: Date): Promise<ProviderRow[]> {
  const companies = await prisma.company.findMany({
    where: { isProvider: true },
    select: {
      id: true,
      name: true,
      taxId: true,
      phone: true,
      verified: true,
      baseLat: true,
      baseLon: true,
      createdAt: true,
      _count: { select: { equipment: { where: { status: { not: 'RETIRED' } } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const ids = companies.map((company) => company.id);
  if (ids.length === 0) return [];

  const [stats, equipment, documents] = await Promise.all([
    loadCompanyStats(ids),
    prisma.equipment.findMany({
      where: { companyId: { in: ids } },
      select: { id: true, companyId: true },
      take: 10_000,
    }),
    prisma.providerDocument.findMany({
      where: { companyId: { in: ids } },
      select: { companyId: true, expiresAt: true },
      take: 10_000,
    }),
  ]);

  // Last activity: the newest bid or booking on any of the company's machines.
  const equipmentIds = equipment.map((item) => item.id);
  const companyOf = new Map(equipment.map((item) => [item.id, item.companyId]));
  const [lastBids, lastBookings] = equipmentIds.length
    ? await Promise.all([
        prisma.bid.groupBy({
          by: ['equipmentId'],
          where: { equipmentId: { in: equipmentIds } },
          _max: { createdAt: true },
        }),
        prisma.booking.groupBy({
          by: ['equipmentId'],
          where: { equipmentId: { in: equipmentIds } },
          _max: { createdAt: true },
        }),
      ])
    : [[], []];
  const lastActivity = new Map<string, number>();
  for (const row of [...lastBids, ...lastBookings]) {
    const companyId = companyOf.get(row.equipmentId);
    const at = row._max.createdAt?.getTime();
    if (!companyId || !at) continue;
    lastActivity.set(companyId, Math.max(lastActivity.get(companyId) ?? 0, at));
  }

  const docsByCompany = new Map<string, { expiresAt: Date | null }[]>();
  for (const doc of documents) {
    const list = docsByCompany.get(doc.companyId) ?? [];
    list.push(doc);
    docsByCompany.set(doc.companyId, list);
  }

  return companies.map((company) => {
    const companyStats = stats.get(company.id);
    const trust = companyStats ? reliability(companyStats) : null;
    const bookings = companyStats?.bookings ?? {};
    const docs = documentsSummary(docsByCompany.get(company.id) ?? [], now);
    const last = lastActivity.get(company.id);
    return {
      id: company.id,
      name: company.name,
      taxId: company.taxId,
      phone: company.phone,
      verified: company.verified,
      onMap: company.baseLat != null && company.baseLon != null,
      createdAt: company.createdAt.toISOString(),
      machines: company._count.equipment,
      bookings: (bookings.CONFIRMED ?? 0) + (bookings.ACTIVE ?? 0) + (bookings.COMPLETED ?? 0),
      cancelShare: trust?.cancelShare ?? null,
      rating: trust?.rating ?? null,
      ratingCount: trust?.ratingCount ?? 0,
      referrals: companyStats?.invitedProviders ?? 0,
      lastActivityAt: last ? new Date(last).toISOString() : null,
      docsExpired: docs.expired,
      docsExpiring: docs.expiring,
    };
  });
}

export default async function AdminProvidersPage({ searchParams }: { searchParams: Query }) {
  const gate = adminGate();
  if (gate) return gate;

  const now = new Date();
  const rows = await loadRows(now);
  const verified = rows.filter((row) => row.verified).length;
  const withoutMachines = rows.filter((row) => row.machines === 0).length;
  const expiredDocs = rows.filter((row) => row.docsExpired > 0).length;
  const newOnes = rows.filter(
    (row) => now.getTime() - Date.parse(row.createdAt) < 14 * 86_400_000,
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Исполнители"
        text="Все компании-исполнители площадки. Отметка «Проверен» видна заказчикам; ставьте её после звонка и проверки ИНН и документов."
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Всего" value={rows.length} tone="dark" hint={`проверено ${verified}`} />
        <StatTile label="Новые за 14 дней" value={newOnes} />
        <StatTile label="Без техники" value={withoutMachines} hint="нечего предлагать" />
        <StatTile
          label="Документы истекли"
          value={expiredDocs}
          hint={expiredDocs > 0 ? 'напомнить компании' : 'всё в порядке'}
        />
      </div>
      <AdminProvidersTable
        rows={rows}
        initialFilter={parseFilter(searchParams.filter)}
        now={now.toISOString()}
      />
    </div>
  );
}
