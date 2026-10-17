import type { AdminStats, SignupCounts } from './adminApi';

/**
 * Подписи меню администратора: счётчики, звёзды, даты по Москве. Чистые
 * функции — проверяются тестами (adminFormat.test.ts).
 */

/** 12345 → «12 345» (неразрывный пробел между разрядами). */
export function formatCount(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** «сегодня +2 · 7 дней +5 · 30 дней +12». */
export function signupLine(counts: SignupCounts): string {
  return [
    `сегодня +${formatCount(counts.today)}`,
    `7 дней +${formatCount(counts.week)}`,
    `30 дней +${formatCount(counts.month)}`,
  ].join(' · ');
}

/** Число на значке: пусто для нуля, «99+» для больших. */
export function badgeCount(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value > 99 ? '99+' : String(Math.round(value));
}

/** Сколько отзывов и комментариев ждут решения. */
export function moderationTotal(stats: Pick<AdminStats, 'moderation'> | null | undefined): number {
  if (!stats) return 0;
  return (stats.moderation.reviews ?? 0) + (stats.moderation.comments ?? 0);
}

/** Короткий список под счётчиками «Сводки». */
export function summaryRows(stats: AdminStats): { label: string; value: string }[] {
  return [
    { label: 'Компаний-исполнителей', value: formatCount(stats.providerCompanies) },
    { label: 'Машинистов', value: formatCount(stats.operators) },
    { label: 'Техники', value: formatCount(stats.machines) },
    { label: 'Открытых заявок', value: formatCount(stats.openOrders) },
    { label: 'Броней в работе', value: formatCount(stats.activeBookings) },
  ];
}

/** Оценка звёздами: 4 → «★★★★☆». */
export function starsText(rating: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, '0');

function moscowParts(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const msk = new Date(date.getTime() + MSK_OFFSET_MS);
  return {
    day: pad(msk.getUTCDate()),
    month: pad(msk.getUTCMonth() + 1),
    year: msk.getUTCFullYear(),
    hours: pad(msk.getUTCHours()),
    minutes: pad(msk.getUTCMinutes()),
  };
}

/** Дата по Москве, не по часовому поясу телефона: «17.10.2026». */
export function moscowDate(value: string | Date): string {
  const parts = moscowParts(value);
  return parts ? `${parts.day}.${parts.month}.${parts.year}` : '—';
}

/** «17.10.2026, 09:41» по Москве. */
export function moscowDateTime(value: string | Date): string {
  const parts = moscowParts(value);
  return parts ? `${parts.day}.${parts.month}.${parts.year}, ${parts.hours}:${parts.minutes}` : '—';
}

/** «Обновлено в 09:41 по Москве». */
export function updatedLabel(value: string | Date): string {
  const parts = moscowParts(value);
  return parts ? `Обновлено в ${parts.hours}:${parts.minutes} по Москве` : '';
}

const SOURCE_LABELS: Record<string, string> = {
  SITE: 'Сайт',
  TELEGRAM: 'Telegram',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Другой чат',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
