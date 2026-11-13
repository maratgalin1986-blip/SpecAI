// The owner's Monday report in Telegram (api/cron/weekly): one short message
// about the last full week on the platform — requests and where they came
// from, bookings, new providers and machines, the line, reviews — against the
// week before. Pure and unit-tested; the numbers are read from the database in
// lib/weeklyReportData.ts. Counts only: no customer names, phones or texts.
import { BOOKING_TIME_ZONE, moscowDateKey } from './bookingRules';
import { formLabel, splitSource } from './marketing';
import { SITE } from './site';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** The report goes out from Monday 07:00 Moscow, not at night. */
export const REPORT_FROM_HOUR_MSK = 7;

export interface ReportWeek {
  /** Monday 00:00 Moscow of the reported week. */
  start: Date;
  /** The next Monday 00:00 Moscow (exclusive). */
  end: Date;
  /** Monday 00:00 Moscow of the week before: [previousStart, start) is compared. */
  previousStart: Date;
  /** «2026-11-02» — the Monday the week began on; the once-a-week key. */
  key: string;
  /** «2–8 ноября», «26 октября – 1 ноября». */
  label: string;
}

/** Moscow midnight of a «YYYY-MM-DD» day (Moscow keeps UTC+3 all year). */
function moscowDayStart(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00+03:00`);
}

const dayMonth = new Intl.DateTimeFormat('ru-RU', {
  timeZone: BOOKING_TIME_ZONE,
  day: 'numeric',
  month: 'long',
});

function weekLabel(start: Date, end: Date): string {
  const first = dayMonth.format(start);
  const last = dayMonth.format(new Date(end.getTime() - 1));
  const [firstDay, firstMonth] = first.split(' ');
  const [, lastMonth] = last.split(' ');
  return firstMonth === lastMonth ? `${firstDay}–${last}` : `${first} – ${last}`;
}

/**
 * The last full Moscow week (Monday–Sunday) before `now`. On Monday 00:30
 * Moscow it is already the week that ended half an hour ago; a late call on
 * Tuesday or Thursday still gets the same week and the same key.
 */
export function reportWeek(now: Date = new Date()): ReportWeek {
  const todayKey = moscowDateKey(now);
  // 0 = Monday … 6 = Sunday.
  const weekday = (new Date(`${todayKey}T00:00:00Z`).getUTCDay() + 6) % 7;
  const end = new Date(moscowDayStart(todayKey).getTime() - weekday * DAY_MS);
  const start = new Date(end.getTime() - WEEK_MS);
  return {
    start,
    end,
    previousStart: new Date(start.getTime() - WEEK_MS),
    key: moscowDateKey(start),
    label: weekLabel(start, end),
  };
}

/**
 * Whether the report for reportWeek(now) may go out: from Monday 07:00 Moscow.
 * A call in the night from Sunday to Monday waits for the morning one.
 */
export function reportDue(now: Date = new Date()): boolean {
  const { end } = reportWeek(now);
  return now.getTime() >= end.getTime() + REPORT_FROM_HOUR_MSK * 3_600_000;
}

/** The numbers of one week, as the database gave them. */
export interface WeekStats {
  /** Callback requests by stored source («form · channel») and status. */
  leads: { source: string | null; status: string; count: number }[];
  /** Requests the owner marked as a deal, and their sum in rubles. */
  deals: { count: number; amount: number };
  /** Machinery requests by OrderSource, without chat messages moderation turned down. */
  orders: { source: string; count: number }[];
  /** Chat messages the moderation did not take for a request. */
  rejectedImports: number;
  /** Bookings created in the week, by their status today. */
  bookings: { status: string; count: number }[];
  /** New provider companies. */
  providers: number;
  /** New machines of provider companies. */
  machines: number;
  reviews: { count: number; ratingSum: number };
}

export interface WeeklyData {
  current: WeekStats;
  previous: WeekStats;
  line: {
    /** Other providers' machines on the line at the moment of the report. */
    now: number;
    /** СпецПласт16's free machines (always on the line, lib/houseLine.ts). */
    house: number;
    /** Other providers' accounts that went on the line during the week. */
    joined: number;
  };
  /** Provider companies that confirmed prices and free days in the week. */
  priceUpdates: number;
  waiting: {
    /** Chat requests waiting for the owner's look (all, not only this week's). */
    orders: number;
    /** Review and comment texts waiting for approval. */
    reviewTexts: number;
  };
}

export const EMPTY_WEEK: WeekStats = {
  leads: [],
  deals: { count: 0, amount: 0 },
  orders: [],
  rejectedImports: 0,
  bookings: [],
  providers: 0,
  machines: 0,
  reviews: { count: 0, ratingSum: 0 },
};

const sum = (rows: { count: number }[]) => rows.reduce((total, row) => total + row.count, 0);

/** «(на прошлой неделе — 3)». */
function before(count: number): string {
  return `(на прошлой неделе — ${count})`;
}

/** «12 — на 4 больше, чем на прошлой неделе (8)». */
function versus(now: number, previous: number): string {
  if (now === previous) return `${now} — столько же, сколько на прошлой неделе`;
  const diff = Math.abs(now - previous);
  return `${now} — на ${diff} ${now > previous ? 'больше' : 'меньше'}, чем на прошлой неделе (${previous})`;
}

/** A headline number, or the honest «не было» for an empty week. */
function headline(title: string, nothing: string, now: number, previous: number): string {
  if (now > 0) return `${title}: ${versus(now, previous)}`;
  return previous > 0
    ? `${title}: ${nothing} ${before(previous)}`
    : `${title}: ${nothing}, как и на прошлой неделе`;
}

/** Sums counts by a label, biggest first; equal counts keep the alphabet. */
function ranked(rows: { label: string; count: number }[], limit: number): string[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.label, (totals.get(row.label) ?? 0) + row.count);
  const sorted = [...totals.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'),
  );
  const lines = sorted.slice(0, limit).map(([label, count]) => `  • ${label}: ${count}`);
  const rest = sum(sorted.slice(limit).map(([, count]) => ({ count })));
  if (rest > 0) lines.push(`  • остальные: ${rest}`);
  return lines;
}

const ORDER_SOURCES: [string, string][] = [
  ['SITE', 'с сайта и из приложения'],
  ['TELEGRAM', 'из чатов Telegram'],
  ['WHATSAPP', 'из чатов WhatsApp'],
  ['OTHER', 'из других источников'],
];

const BOOKING_STATUSES: [string, string][] = [
  ['PENDING', 'ждут подтверждения'],
  ['CONFIRMED', 'подтверждены'],
  ['ACTIVE', 'идут сейчас'],
  ['COMPLETED', 'завершены'],
  ['CANCELLED', 'отменены'],
];

/** «с сайта и из приложения — 5, из чатов Telegram — 4»; zero parts are left out. */
function parts(rows: { key: string; count: number }[], labels: [string, string][]): string {
  const known = new Set(labels.map(([key]) => key));
  const named = labels.map(([key, label]) => ({
    label,
    count: sum(rows.filter((row) => row.key === key)),
  }));
  const unknown = sum(rows.filter((row) => !known.has(row.key)));
  if (unknown > 0) named.push({ label: 'прочие', count: unknown });
  return named
    .filter((part) => part.count > 0)
    .map((part) => `${part.label} — ${part.count}`)
    .join(', ');
}

function rating(reviews: WeekStats['reviews']): string {
  return (reviews.ratingSum / reviews.count).toFixed(1).replace('.', ',');
}

/**
 * The text of the report. Every number comes from `data`; a week without
 * requests, bookings or reviews says so instead of hiding the line.
 */
export function buildWeeklyReport(data: WeeklyData, week: ReportWeek): string {
  const { current, previous, line, waiting } = data;
  const leads = sum(current.leads);
  const leadsBefore = sum(previous.leads);
  const orders = sum(current.orders);
  const ordersBefore = sum(previous.orders);
  const lines = [`📊 ${SITE.platform} от ${SITE.name} — неделя ${week.label}`, ''];

  // Requests: machinery orders and callback requests together, then apart.
  lines.push(
    headline('Заявки', 'за неделю заявок не было', leads + orders, leadsBefore + ordersBefore),
  );
  if (leads + orders > 0) {
    const from = parts(
      current.orders.map((row) => ({ key: row.source, count: row.count })),
      ORDER_SOURCES,
    );
    lines.push(`  • на технику: ${orders} ${before(ordersBefore)}${from ? `: ${from}` : ''}`);
    lines.push(`  • на звонок: ${leads} ${before(leadsBefore)}`);
  }
  if (current.rejectedImports > 0) {
    lines.push(`Сообщений из чатов, которые не оказались заявками: ${current.rejectedImports}`);
  }
  if (leads > 0) {
    lines.push(
      'Откуда пришли заявки на звонок:',
      ...ranked(
        current.leads.map((row) => ({
          label: splitSource(row.source).channel,
          count: row.count,
        })),
        5,
      ),
      'С каких форм:',
      ...ranked(
        current.leads.map((row) => ({
          label: formLabel(splitSource(row.source).form),
          count: row.count,
        })),
        5,
      ),
    );
  }
  if (current.deals.count > 0) {
    const amount = current.deals.amount.toLocaleString('ru-RU');
    lines.push(`Сделок по заявкам на звонок: ${current.deals.count} на ${amount} ₽`);
  }

  // Bookings created in the week, by what became of them.
  const bookings = sum(current.bookings);
  lines.push(
    '',
    headline('Брони', 'за неделю новых броней не было', bookings, sum(previous.bookings)),
  );
  if (bookings > 0) {
    const byStatus = parts(
      current.bookings.map((row) => ({ key: row.status, count: row.count })),
      BOOKING_STATUSES,
    );
    lines.push(`  • ${byStatus}`);
  }

  // Providers, machines, the line.
  lines.push(
    '',
    headline(
      'Новые исполнители',
      'за неделю никто не пришёл',
      current.providers,
      previous.providers,
    ),
    headline('Новые машины', 'за неделю не добавляли', current.machines, previous.machines),
    `На линии сейчас: машин других исполнителей — ${line.now}, свободных машин ${SITE.name} — ${line.house}`,
    `Вышли на линию за неделю: ${line.joined}`,
    `Обновили цены и свободные дни: ${data.priceUpdates}`,
  );

  // Reviews.
  lines.push('');
  if (current.reviews.count > 0) {
    lines.push(
      `Отзывы: ${versus(current.reviews.count, previous.reviews.count)}; средняя оценка — ${rating(current.reviews)}`,
    );
  } else {
    lines.push(headline('Отзывы', 'за неделю новых отзывов не было', 0, previous.reviews.count));
  }

  // What waits for the owner.
  const unanswered = sum(current.leads.filter((row) => row.status === 'NEW'));
  const todo = [
    unanswered > 0 ? `  • заявки на звонок без ответа: ${unanswered} — /admin/leads` : null,
    waiting.orders > 0 ? `  • заявки из чатов на проверке: ${waiting.orders} — /admin` : null,
    waiting.reviewTexts > 0
      ? `  • тексты отзывов на проверке: ${waiting.reviewTexts} — /admin`
      : null,
  ].filter((item): item is string => item !== null);
  if (todo.length > 0) lines.push('', 'Ждёт вас:', ...todo);

  lines.push('', 'Посещения и звонки с сайта — в Яндекс Метрике, раздел «Конверсии».');
  return lines.join('\n');
}
