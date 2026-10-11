import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { PUBLISHED_FLEET, isProvider } from '@/lib/fleet';
import { loadMachineCalendar } from '@/lib/calendarStore';
import { parseMonth } from '@/lib/occupancy';

export const dynamic = 'force-dynamic';

/**
 * Occupancy calendar of a machine for a month (`?month=YYYY-MM`, the current
 * one by default). The owning provider gets the bookings and blocks behind
 * the days; anyone else only sees which days are free (a published machine).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  const period = parseMonth(request.nextUrl.searchParams.get('month'));
  const own = isProvider(currentUser)
    ? await prisma.equipment.findFirst({
        where: { id: params.id, companyId: currentUser.companyId },
        select: { id: true, name: true, status: true },
      })
    : null;
  const equipment =
    own ??
    (await prisma.equipment.findFirst({
      where: { id: params.id, ...PUBLISHED_FLEET },
      select: { id: true, name: true, status: true },
    }));
  if (!equipment) {
    return NextResponse.json({ error: 'Техника не найдена' }, { status: 404 });
  }
  const calendar = await loadMachineCalendar(equipment, period, { owner: Boolean(own) });
  return NextResponse.json(calendar);
}
