import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { moscowDateKey } from '@/lib/bookingRules';
import {
  ADMIN_PRICE_REPORT_SELECT,
  priceReportsCsv,
  type AdminPriceReport,
} from '@/lib/priceReports';

export const dynamic = 'force-dynamic';

/** Rows in one download, newest first. */
const CSV_MAX_ROWS = 10_000;

/**
 * «Опрос цен» for the owner (admin area only): every answer as CSV. Names,
 * companies and phones only where the person consented.
 */
export async function GET() {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const reports = (await prisma.priceReport.findMany({
    select: ADMIN_PRICE_REPORT_SELECT,
    orderBy: { createdAt: 'desc' },
    take: CSV_MAX_ROWS,
  })) as AdminPriceReport[];
  return new NextResponse(priceReportsCsv(reports), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="opros-cen-${moscowDateKey(new Date())}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
