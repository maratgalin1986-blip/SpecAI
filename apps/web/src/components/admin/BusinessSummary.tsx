import type { AdminSummary, SummaryWindow } from '@/lib/adminSummary';
import { formatMoney } from '@/lib/money';

const ROWS: { key: keyof SummaryWindow; title: string; money?: boolean }[] = [
  { key: 'orders', title: 'Заявки' },
  { key: 'bookings', title: 'Брони' },
  { key: 'turnover', title: 'Оборот броней', money: true },
  { key: 'providers', title: 'Новые исполнители' },
];

/** «Сводка»: four cards, each with 7 and 30 days (lib/adminSummary.ts). */
export function BusinessSummary({ summary }: { summary: AdminSummary }) {
  return (
    <section aria-label="Сводка за 7 и 30 дней" className="flex flex-col gap-2" id="summary">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ROWS.map(({ key, title, money }) => {
          const show = (value: number) => (money ? formatMoney(value) : String(value));
          return (
            <div key={key} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {title}
              </p>
              <p className="mt-1 truncate text-2xl font-bold tabular-nums text-slate-900">
                {show(summary.week[key])}
              </p>
              <p className="text-xs text-slate-600">за 7 дней</p>
              <p className="mt-1 text-xs text-slate-600">
                за 30 дней: <span className="tabular-nums">{show(summary.month[key])}</span>
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-600">
        Оборот — сумма броней, которые исполнитель принял (без онлайн-оплаты это договорённость, а
        не поступившие деньги).
      </p>
    </section>
  );
}
