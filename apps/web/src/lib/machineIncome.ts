// Income per machine for the provider cabinet («Доход за месяц по каждой
// единице», Яндекс Про → раздел «Деньги»). Pure: the page and the API load
// the rows, this file only adds them up. Unit-tested in machineIncome.test.ts.
import { INCOME_STATUSES, monthStartMsk } from './providerDashboard';
import { isTimesheetFinal } from './shiftRules';

type Money = number | string | { toString(): string };

export interface IncomeBooking {
  id: string;
  equipmentId: string;
  status: string;
  startDate: Date;
  totalPrice: Money;
  /** Timesheets of the booking's shifts (any state). */
  timesheets: {
    hoursWorked: Money;
    customerConfirmedAt?: Date | null;
    providerConfirmedAt?: Date | null;
  }[];
}

export interface IncomeMachine {
  id: string;
  name: string;
  hourlyRate?: Money | null;
}

export interface MachineIncome {
  equipmentId: string;
  name: string;
  /** Rubles this month. */
  income: number;
  bookings: number;
  /** Hours from timesheets confirmed by both sides. */
  confirmedHours: number;
}

export interface IncomeReport {
  total: number;
  machines: MachineIncome[];
}

function num(value: Money | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The money of one booking: when a timesheet confirmed by both sides exists,
 * the confirmed hours × the machine's hourly rate replace the booking price;
 * without an hourly rate (or without a final timesheet) the price stands.
 */
export function bookingIncome(
  booking: Pick<IncomeBooking, 'totalPrice' | 'timesheets'>,
  hourlyRate: Money | null | undefined,
): { income: number; confirmedHours: number } {
  const confirmed = booking.timesheets.filter(isTimesheetFinal);
  const confirmedHours = confirmed.reduce((sum, row) => sum + num(row.hoursWorked), 0);
  const rate = num(hourlyRate);
  if (confirmed.length > 0 && rate > 0) {
    return { income: confirmedHours * rate, confirmedHours };
  }
  return { income: num(booking.totalPrice), confirmedHours };
}

/**
 * Income this month per machine and in total: confirmed, active and completed
 * bookings that start this month (Moscow). Machines without bookings are
 * listed with zero so the cabinet shows the whole fleet; sorted by income.
 */
export function incomeByMachine(
  machines: IncomeMachine[],
  bookings: IncomeBooking[],
  now: Date = new Date(),
): IncomeReport {
  const from = monthStartMsk(now).getTime();
  const nextMonth = monthStartMsk(new Date(from + 32 * 86_400_000)).getTime();
  const byId = new Map<string, MachineIncome>();
  const rates = new Map<string, Money | null | undefined>();
  for (const machine of machines) {
    byId.set(machine.id, {
      equipmentId: machine.id,
      name: machine.name,
      income: 0,
      bookings: 0,
      confirmedHours: 0,
    });
    rates.set(machine.id, machine.hourlyRate);
  }
  for (const booking of bookings) {
    if (!(INCOME_STATUSES as readonly string[]).includes(booking.status)) continue;
    const start = booking.startDate.getTime();
    if (start < from || start >= nextMonth) continue;
    const row = byId.get(booking.equipmentId);
    if (!row) continue;
    const { income, confirmedHours } = bookingIncome(booking, rates.get(booking.equipmentId));
    row.income += income;
    row.confirmedHours += confirmedHours;
    row.bookings += 1;
  }
  const list = [...byId.values()]
    .map((row) => ({ ...row, income: Math.round(row.income) }))
    .sort((a, b) => b.income - a.income || a.name.localeCompare(b.name, 'ru'));
  return { total: list.reduce((sum, row) => sum + row.income, 0), machines: list };
}
