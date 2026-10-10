// Loads this month's bookings and timesheets of a company and hands them to
// the pure incomeByMachine() — shared by /provider and GET /api/shifts/income.
import type { PrismaClient } from '@specai/database';
import { incomeByMachine, type IncomeReport } from './machineIncome';
import { INCOME_STATUSES, monthStartMsk } from './providerDashboard';

export interface MachineIncomeReport extends IncomeReport {
  /** "2026-10" */
  month: string;
}

export async function loadMachineIncome(
  companyId: string,
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<MachineIncomeReport> {
  const monthStart = monthStartMsk(now);
  const [machines, bookings] = await Promise.all([
    prisma.equipment.findMany({
      where: { companyId, status: { not: 'RETIRED' } },
      select: { id: true, name: true, hourlyRate: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.booking.findMany({
      where: {
        equipment: { companyId },
        status: { in: [...INCOME_STATUSES] },
        startDate: { gte: monthStart },
      },
      select: {
        id: true,
        equipmentId: true,
        status: true,
        startDate: true,
        totalPrice: true,
        shifts: {
          select: {
            timesheet: {
              select: { hoursWorked: true, customerConfirmedAt: true, providerConfirmedAt: true },
            },
          },
        },
      },
      take: 1000,
    }),
  ]);
  const report = incomeByMachine(
    machines,
    bookings.map((booking) => ({
      ...booking,
      timesheets: booking.shifts.flatMap((shift) => (shift.timesheet ? [shift.timesheet] : [])),
    })),
    now,
  );
  const msk = new Date(now.getTime() + 3 * 3600_000);
  return {
    ...report,
    month: `${msk.getUTCFullYear()}-${String(msk.getUTCMonth() + 1).padStart(2, '0')}`,
  };
}
