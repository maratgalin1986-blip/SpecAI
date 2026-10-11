import { formatMoney } from '@/lib/money';
import type { MachineIncomeReport } from '@/lib/machineIncomeStore';

// «Доход по технике» in /provider: this month per machine and in total.
// Hours confirmed in timesheets by both sides replace the booking price.

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

export function monthLabel(month: string): string {
  const index = Number(month.split('-')[1]) - 1;
  return MONTHS[index] ?? month;
}

export function MachineIncomeTable({ report }: { report: MachineIncomeReport }) {
  return (
    <section id="income" className="cab-card flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-graphite-950">Доход по технике</h2>
          <p className="text-sm text-graphite-600">
            {monthLabel(report.month)}: подтверждённые брони с началом в этом месяце; где табель
            подтвердили обе стороны — часы × цена часа.
          </p>
        </div>
        <p className="font-mono text-xl font-bold text-graphite-950">{formatMoney(report.total)}</p>
      </div>
      {report.machines.length === 0 ? (
        <p className="text-sm text-graphite-500">Техники пока нет.</p>
      ) : (
        <ul className="divide-y divide-graphite-100">
          {report.machines.map((row) => (
            <li
              key={row.equipmentId}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <a
                  href={`/equipment/${row.equipmentId}`}
                  className="break-words font-semibold text-graphite-900 hover:underline"
                >
                  {row.name}
                </a>
                <p className="text-xs text-graphite-500">
                  {row.bookings === 0
                    ? 'броней нет'
                    : `броней: ${row.bookings}${row.confirmedHours > 0 ? ` · по табелю ${row.confirmedHours} ч` : ''}`}
                </p>
              </div>
              <span className="shrink-0 font-mono font-semibold text-graphite-950">
                {formatMoney(row.income)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
