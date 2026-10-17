// «Поделиться заявкой»: заказчик сам, по желанию, отправляет ссылку на свою
// заявку знакомым или в рабочий чат. В тексте — только вид техники, город и
// дата (как на сайте, apps/web/src/lib/orderCard.ts): ни имени, ни телефона,
// ни адреса. Превью ссылки — картинка с сайта (orders/[id]/opengraph-image).
// Чистые функции (крутятся в vitest). После заявки — обещание площадки
// (владелец, 2026-10-17), как в тексте «Поделиться» на сайте.
import { PLATFORM_NAME, PROMISE } from './promise';

export const PRODUCTION_SITE_URL = 'https://spec-ai-web.vercel.app';

/** Сайт для ссылки: адрес API, но не локальный (с телефона друга он не откроется). */
export function shareBaseUrl(apiUrl: string | null | undefined): string {
  const base = (apiUrl ?? '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) return PRODUCTION_SITE_URL;
  return base;
}

export function orderShareLink(base: string, orderId: string): string {
  return `${base}/orders/${encodeURIComponent(orderId)}?utm_source=app&utm_medium=share`;
}

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

/** «20 октября» по Москве (UTC+3 круглый год), без Intl — Hermes не везде знает часовые пояса. */
export function shareDate(value: string | Date): string | null {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  const msk = new Date(time + 3 * 3_600_000);
  return `${msk.getUTCDate()} ${MONTHS[msk.getUTCMonth()]}`;
}

const NOT_A_CITY =
  /(?:^|[\s.])(?:ул|улица|пр|пр-т|проспект|пер|переулок|шоссе|бульвар|б-р|наб|набережная|дом|д|кв|корп|стр|мкр|микрорайон|район|р-н|снт|днт|тсн|деревня|дер|село|с|пос|посёлок|поселок|пгт|рп|участок|км)(?=[\s.]|$)/i;

/** Город из поля «город» места: «г. Елабуга» → «Елабуга»; улица, дом или село — null. */
export function shareCity(raw: string | null | undefined): string | null {
  const name = ((raw ?? '').split(/[,;(]/)[0] ?? '')
    .replace(/^\s*(?:г|гор|город)(?:\.\s*|\s+)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || name.length > 40) return null;
  if (!/^[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z -]*$/.test(name)) return null;
  if (NOT_A_CITY.test(name.toLowerCase())) return null;
  return name;
}

function lowerFirst(text: string): string {
  if (/^\p{Lu}{2}/u.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** «Помогите найти технику: автокраны · Елабуга · 20 октября». */
export function orderShareText(order: {
  categoryName?: string | null;
  city?: string | null;
  desiredStartDate: string | Date;
}): string {
  const what = order.categoryName?.trim() ? lowerFirst(order.categoryName.trim()) : 'спецтехника';
  const parts = [what, shareCity(order.city), shareDate(order.desiredStartDate)].filter(Boolean);
  return `Помогите найти технику: ${parts.join(' · ')}`;
}

/** «Заявка на ИИСтройка24: бесплатно и без посредников», как на сайте (orderShareText). */
export const SHARE_PROMISE = `Заявка на ${PLATFORM_NAME}: ${PROMISE.toLowerCase()}`;

/** Текст для системного «Поделиться»: фраза, обещание и ссылка с новой строки. */
export function orderShareMessage(
  order: Parameters<typeof orderShareText>[0] & { id: string },
  apiUrl: string | null | undefined,
): string {
  return `${orderShareText(order)}. ${SHARE_PROMISE}\n${orderShareLink(shareBaseUrl(apiUrl), order.id)}`;
}
