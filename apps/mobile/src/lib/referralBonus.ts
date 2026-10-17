/**
 * Акция «Пригласи друга» (владелец, 2026-10-17) — копия текстов
 * apps/web/src/lib/referralPriority.ts и lib/referral.ts. Друг регистрируется
 * по ссылке — и 7 дней уведомления о новых заявках рядом приходят на
 * 5 минут раньше остальных исполнителей. Раньше приходит только уведомление:
 * лента заявок открыта всем сразу. Чистый файл без импортов React Native —
 * его проверяет vitest.
 */
import { PLATFORM_NAME, PROMISE } from './promise';

export const EARLY_NOTICE_MINUTES = 5;
export const PRIORITY_DAYS = 7;
export const PRIORITY_CAP_DAYS = 30;

export const INVITE_HEADLINE = `Пригласите друга — неделю получаете заявки на ${EARLY_NOTICE_MINUTES} минут раньше всех`;
export const INVITE_DETAIL = `Друг регистрируется по вашей ссылке — и ${PRIORITY_DAYS} дней уведомления о новых заявках рядом приходят вам на ${EARLY_NOTICE_MINUTES} минут раньше остальных исполнителей. За каждого следующего — ещё неделя (до ${PRIORITY_CAP_DAYS} дней вперёд).`;
export const CUSTOMER_INVITE_NOTE = `Работаете и сами на технике? За каждого приглашённого — неделя заявок на ${EARLY_NOTICE_MINUTES} минут раньше других исполнителей, когда подключите свою технику.`;

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
/** Москва — UTC+3 круглый год: дата по Москве, не по часовому поясу телефона. */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** «24 октября» — московский день конца бонуса; null для неверной даты. */
export function priorityDate(until: string | Date): string | null {
  const time = new Date(until).getTime();
  if (!Number.isFinite(time)) return null;
  const msk = new Date(time + MSK_OFFSET_MS);
  return `${msk.getUTCDate()} ${MONTHS[msk.getUTCMonth()]}`;
}

/** Плашка «🚀 Заявки приходят вам на 5 минут раньше — до 24 октября»; null без бонуса. */
export function priorityBadgeText(
  until: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!until) return null;
  const time = new Date(until).getTime();
  if (!Number.isFinite(time) || time <= now.getTime()) return null;
  return `🚀 Заявки приходят вам на ${EARLY_NOTICE_MINUTES} минут раньше — до ${priorityDate(until)}`;
}

/** Текст приглашения для мессенджеров (как invitationText на сайте) со ссылкой. */
export function invitationMessage(role: 'CUSTOMER' | 'PROVIDER', link: string): string {
  const promise = PROMISE.toLowerCase();
  const text =
    role === 'PROVIDER'
      ? `Подключайся к ${PLATFORM_NAME} от СпецПласт16 — заказы спецтехники по всей России, ${promise}: заявки заказчиков рядом с тобой приходят прямо в кабинет, цену называешь сам, расчёт — напрямую с заказчиком, площадка не берёт процент.`
      : `Заказываю спецтехнику через ${PLATFORM_NAME} от СпецПласт16: пишешь заявку, исполнители сами присылают цены. ${PROMISE} — расчёт напрямую с владельцем техники.`;
  return `${text} ${link}`;
}

/** «По вашей ссылке зарегистрировались: 2» / «пока никто». */
export function invitedLine(count: number | null | undefined): string | null {
  if (count === null || count === undefined || !Number.isFinite(count)) return null;
  return count > 0
    ? `По вашей ссылке зарегистрировались: ${count}`
    : 'По вашей ссылке пока никто не зарегистрировался.';
}
