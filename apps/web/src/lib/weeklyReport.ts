import { formLabel, splitSource } from '@/lib/marketing';

// Monday-morning summary for the owner in Telegram: how many requests came
// in over the last 7 days, against the week before, and from where.

type LeadRow = {
  createdAt: Date;
  source: string | null;
  status: string;
  outcome?: string | null;
  amount?: number | null;
};
type OrderRow = { createdAt: Date; source: string };

const DAY = 86_400_000;

function top(entries: string[], limit = 4) {
  const counts = entries.reduce<Record<string, number>>((acc, name) => {
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => `  • ${name}: ${count}`);
}

function trend(now: number, before: number) {
  if (before === 0) return now > 0 ? '(на прошлой неделе не было)' : '';
  const change = Math.round(((now - before) / before) * 100);
  return change === 0
    ? '(как на прошлой неделе)'
    : `(${change > 0 ? '+' : ''}${change}% к прошлой)`;
}

export function buildWeeklyReport(
  leads: LeadRow[],
  orders: OrderRow[],
  now = Date.now(),
  siteName = 'СпецПласт16',
): string {
  const week = (rows: { createdAt: Date }[], back: number) =>
    rows.filter((r) => {
      const age = now - r.createdAt.getTime();
      return age >= back * 7 * DAY && age < (back + 1) * 7 * DAY;
    });
  const leadsNow = week(leads, 0) as LeadRow[];
  const leadsBefore = week(leads, 1);
  const ordersNow = week(orders, 0) as OrderRow[];
  const ordersBefore = week(orders, 1);
  const unanswered = leadsNow.filter((lead) => lead.status === 'NEW').length;

  const lines = [
    `📊 Неделя ${siteName}`,
    `Заявки на звонок: ${leadsNow.length} ${trend(leadsNow.length, leadsBefore.length)}`.trim(),
    `Заявки на технику: ${ordersNow.length} ${trend(ordersNow.length, ordersBefore.length)}`.trim(),
  ];
  if (unanswered > 0) lines.push(`⚠️ Не обработано: ${unanswered} — загляните в /admin`);
  if (leadsNow.length > 0) {
    lines.push('Откуда пришли:', ...top(leadsNow.map((l) => splitSource(l.source).channel)));
    lines.push('Какие формы:', ...top(leadsNow.map((l) => formLabel(splitSource(l.source).form))));
  }
  const deals = leadsNow.filter((l) => l.outcome === 'deal');
  if (deals.length > 0) {
    const sum = deals.reduce((total, l) => total + (l.amount ?? 0), 0);
    lines.push(`Сделок: ${deals.length} на ${sum.toLocaleString('ru-RU')} ₽`);
  }
  const fromChats = ordersNow.filter((o) => o.source !== 'SITE').length;
  if (fromChats > 0) lines.push(`Из чатов Telegram/WhatsApp: ${fromChats}`);
  lines.push('Звонки и визиты — в Яндекс.Метрике: «Конверсии» и «Параметры визитов → ab».');
  return lines.join('\n');
}
