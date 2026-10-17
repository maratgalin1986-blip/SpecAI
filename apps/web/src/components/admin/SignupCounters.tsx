import type { AdminStats, SignupCounts } from '@/lib/adminStats';

function Counter({ title, counts }: { title: string; counts: SignupCounts }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{counts.total}</p>
      <p className="mt-1 text-xs text-slate-600">
        сегодня +{counts.today} · 7 дней +{counts.week} · 30 дней +{counts.month}
      </p>
    </div>
  );
}

/** «Сколько зарегистрировалось»: customers and providers, then the rest in one line. */
export function SignupCounters({ stats }: { stats: AdminStats }) {
  return (
    <section aria-label="Регистрации" className="flex flex-col gap-2" id="counters">
      <div className="grid grid-cols-2 gap-3">
        <Counter title="Заказчики" counts={stats.customers} />
        <Counter title="Исполнители" counts={stats.providers} />
      </div>
      <p className="text-xs text-slate-600">
        Компаний-исполнителей {stats.providerCompanies} · машинистов {stats.operators} · техники{' '}
        {stats.machines} · открытых заявок {stats.openOrders} · броней в работе{' '}
        {stats.activeBookings}
        {stats.moderation.reviews + stats.moderation.comments > 0
          ? ` · ждут модерации: отзывы ${stats.moderation.reviews}, комментарии ${stats.moderation.comments}`
          : ''}
      </p>
    </section>
  );
}
