import { NextResponse } from 'next/server';
import { HOUSE_COMPANY_ID, prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** Provider companies loaded for the app's admin list. */
const ADMIN_COMPANIES_TAKE = 100;

/**
 * Provider companies for the app's admin menu («Исполнители»): name, phone,
 * sign-up date, «Проверен» and the working fleet. СпецПласт16's own company
 * first, then the newest. The mark is changed by PATCH /api/admin/companies/[id].
 */
export async function GET() {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  // СпецПласт16's own company is always in the list and first (REVIEW.md §3),
  // however many providers sign up; then the newest.
  const select = {
    id: true,
    name: true,
    phone: true,
    verified: true,
    createdAt: true,
    _count: { select: { equipment: { where: { status: { not: 'RETIRED' as const } } } } },
  };
  const [house, others] = await Promise.all([
    prisma.company.findFirst({ where: { id: HOUSE_COMPANY_ID, isProvider: true }, select }),
    prisma.company.findMany({
      where: { isProvider: true, id: { not: HOUSE_COMPANY_ID } },
      select,
      orderBy: { createdAt: 'desc' },
      take: ADMIN_COMPANIES_TAKE,
    }),
  ]);
  const companies = [...(house ? [house] : []), ...others].map(({ _count, ...company }) => ({
    ...company,
    machines: _count.equipment,
    isHouse: company.id === HOUSE_COMPANY_ID,
  }));
  return NextResponse.json({ companies });
}
