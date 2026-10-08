// Orders whose author has no account: found in open Telegram/WhatsApp chats
// (the bot was added there by the chat's admins; no userbots, no private
// chats) or left by a guest on the site (source SITE, api/orders/guest).
// The author's phone is stored but shown masked; a signed-in provider
// presses «Показать телефон», which is logged (ContactReveal) and limited per
// provider company per day. The author may ask to remove the order — the
// admin erases it. Pure functions only; the route handlers do the database work.

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

/** The line added to the description of every order imported from a chat. */
export function chatOrderNote(chatTitle?: string | null): string {
  const chat = chatTitle?.trim() ? ` «${chatTitle.trim().slice(0, 80)}»` : '';
  return `Заявка найдена в открытом чате${chat}. Автор может попросить удалить её.`;
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
