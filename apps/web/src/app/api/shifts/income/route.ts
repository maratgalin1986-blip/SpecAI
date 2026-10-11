import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { isProvider } from '@/lib/fleet';
import { loadMachineIncome } from '@/lib/machineIncomeStore';

export const dynamic = 'force-dynamic';

/**
 * Income this month per machine for the provider cabinet (app «Лента» /
 * «Техника», site /provider): confirmed, active and completed bookings that
 * start this month; where a timesheet confirmed by both sides exists, its
 * hours × the machine's hourly rate replace the booking price.
 */
export async function GET(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) {
    return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
  }
  const report = await loadMachineIncome(currentUser.companyId, prisma);
  return NextResponse.json(report);
}
