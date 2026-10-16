// Orders whose author has no account: found in open Telegram/WhatsApp chats
// (the bot was added there by the chat's admins; no userbots, no private
// chats) or left by a guest on the site (source SITE, api/orders/guest).
// The author's phone is stored but shown masked; a signed-in provider
// presses «Показать телефон», which is logged (ContactReveal) and limited per
// provider company per day. The author may ask to remove the order — the
// admin erases it. Pure functions only; the route handlers do the database work.

import { SITE } from './site';

export const CHAT_PHONE_REVEALS_PER_DAY = 30;
export const DAY_MS = 24 * 60 * 60_000;

/** «+7 917 •••-••-34»: enough to recognise a number, not to call it. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '•••';
  const last = digits.slice(-2);
  if (digits.length === 11 && /^[78]/.test(digits)) {
    return `+7 ${digits.slice(1, 4)} •••-••-${last}`;
  }
  return `${digits.slice(0, 3)}•••••${last}`;
}

/**
 * How the author of an imported order asks to remove it (152-ФЗ ст. 18 ч. 3
 * notice). Shown next to the order, outside its description: descriptions are
 * shown with phones and e-mails masked, which would hide these contacts.
 */
export const CHAT_ORDER_REMOVAL = `Автор может попросить удалить её: ${SITE.email} или ${SITE.phone}`;

/** Where the board and the order page send the author who wants the order removed. */
export const CHAT_ORDER_REMOVAL_HREF = '/privacy#iz-chatov';

/** The line added to the description of every order imported from a chat. */
export function chatOrderNote(chatTitle?: string | null): string {
  const chat = chatTitle?.trim() ? ` «${chatTitle.trim().slice(0, 80)}»` : '';
  return (
    `Заявка найдена в открытом чате${chat}. Автор может попросить удалить её — ` +
    'как это сделать, сказано на странице заявки.'
  );
}

/**
 * The description without the chatOrderNote line — for alerts and digest
 * lines, where the notice would eat the text budget and repeat «найдена в
 * открытом чате».
 */
export function stripChatOrderNote(description: string): string {
  return description.replace(/\s*Заявка найдена в открытом чате[\s\S]*$/u, '').trim();
}

const PLACE_STOP_WORDS = new Set([
  'аренду',
  'аренда',
  'наличии',
  'наличие',
  'работу',
  'работе',
  'час',
  'смену',
  'смена',
  'день',
  'сутки',
  'срочно',
  'общем',
  'основном',
  'итоге',
  'целом',
  'ближайшее',
  'течение',
  'районе',
  'район',
  'городе',
  'город',
  'связи',
  'принципе',
  'этом',
  'этот',
  'эту',
  'следующем',
  'начале',
  'конце',
  'понедельник',
  'вторник',
  'среду',
  'четверг',
  'пятницу',
  'субботу',
  'воскресенье',
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре',
]);

/**
 * The place a chat message names after «в/во/г./город/с./пос.» («в Бавлы»,
 * «г. Уруссу»): capitalised, 3+ letters, so an order from a town the parser
 * does not know still gets a city text instead of silently becoming a
 * home-city order. Null when nothing looks like a place.
 */
export function placeInText(text: string | null | undefined): string | null {
  if (!text) return null;
  // The preposition in either case («В Бавлы» opens a sentence), the place capitalised.
  const pattern =
    /(?:^|[\s,.;:(«"])(?:[вВ]о?|[гГ]\.|[гГ]ород|[сС]\.|[сС]ело|[пП]ос\.|[пП]осёлок|[пП]оселок|пгт|[дД]\.|[дД]еревня)\s+([А-ЯЁ][а-яё]{2,}(?:[- ][А-ЯЁ][а-яё]{2,})?)(?=$|[\s,.;:!?)»"])/gu;
  for (const match of text.matchAll(pattern)) {
    const place = match[1]?.trim();
    if (!place) continue;
    const first = place.split(/[- ]/)[0]?.toLowerCase().replace(/ё/g, 'е') ?? '';
    if (PLACE_STOP_WORDS.has(first)) continue;
    return place;
  }
  return null;
}

export const ERASED_DESCRIPTION = 'Заявка удалена по запросу автора.';

/** Fields cleared when the admin erases an order on the author's request. */
export const ERASED_ORDER_DATA = {
  status: 'CANCELLED' as const,
  description: ERASED_DESCRIPTION,
  contactName: null,
  contactPhone: null,
  rawText: null,
  sourceUrl: null,
  sourceChat: null,
};

/**
 * Whether «Удалить по запросу» may run with this booking on the order:
 * a pending booking is cancelled along with the order, a confirmed or
 * running one must be cancelled by hand first (the machine may be on its way).
 */
export function eraseBlockedByBooking(bookingStatus: string | null | undefined): boolean {
  return bookingStatus === 'CONFIRMED' || bookingStatus === 'ACTIVE';
}

export interface RevealViewer {
  userId: string;
  role: string;
  companyId: string | null;
  emailVerified: boolean;
}

export interface RevealOrder {
  source: string;
  status: string;
  contactPhone: string | null;
}

export type RevealDecision =
  { ok: true; counts: boolean } | { ok: false; status: number; error: string };

/**
 * Whether a viewer may see the phone of a chat order.
 * - only providers (PROVIDER_ADMIN with a company); customers and guests never;
 * - a confirmed e-mail when the site can send letters (accountability);
 * - only open/matched orders (from chats or guests of the site) that still
 *   have a phone — an order of a signed-in customer never has one;
 * - at most CHAT_PHONE_REVEALS_PER_DAY different orders per company a day;
 *   opening the same order again does not count.
 */
export function revealDecision(input: {
  viewer: RevealViewer | null;
  order: RevealOrder | null;
  alreadyRevealed: boolean;
  revealsToday: number;
  requireVerifiedEmail: boolean;
}): RevealDecision {
  const { viewer, order } = input;
  if (!viewer) return { ok: false, status: 401, error: 'Войдите как исполнитель' };
  if (viewer.role !== 'PROVIDER_ADMIN' || !viewer.companyId) {
    return { ok: false, status: 403, error: 'Телефон видят только исполнители' };
  }
  if (input.requireVerifiedEmail && !viewer.emailVerified) {
    return { ok: false, status: 403, error: 'Подтвердите e-mail, чтобы открывать телефоны' };
  }
  if (!order || order.status === 'PENDING_REVIEW') {
    return { ok: false, status: 404, error: 'Заявка не найдена' };
  }
  if (order.status === 'CANCELLED' || !order.contactPhone) {
    return { ok: false, status: 410, error: 'Телефон недоступен: заявка закрыта или удалена' };
  }
  if (input.alreadyRevealed) return { ok: true, counts: false };
  if (input.revealsToday >= CHAT_PHONE_REVEALS_PER_DAY) {
    return {
      ok: false,
      status: 429,
      error: `Лимит: ${CHAT_PHONE_REVEALS_PER_DAY} телефонов в сутки на компанию. Попробуйте завтра`,
    };
  }
  return { ok: true, counts: true };
}

/** What the provider is told when the phone opens: how the author reached us. */
export function revealNote(source: string): string {
  return source === 'SITE'
    ? 'Человек оставил заявку на сайте без регистрации. Представьтесь и скажите, что звоните по заявке с ИИСтройка24.'
    : 'Человек написал в открытый чат. Представьтесь и скажите, где нашли заявку.';
}

/**
 * The masked contact a provider sees on an order whose author has no account
 * (a chat or a guest order): the house fleet and admins get the full contact
 * elsewhere, everyone else may open it with POST /api/orders/[id]/phone.
 */
export function maskedContactFor(
  order: { contactPhone: string | null },
  viewer: { isProvider: boolean; isHouse: boolean },
): { maskedPhone: string | null; canReveal: true } | undefined {
  if (!order.contactPhone || !viewer.isProvider || viewer.isHouse) return undefined;
  return { maskedPhone: maskPhone(order.contactPhone), canReveal: true };
}
