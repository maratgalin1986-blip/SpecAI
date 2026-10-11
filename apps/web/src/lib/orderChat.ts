// Chat between the customer of an order and a provider company (one thread
// per company). Pure functions only, so the access and masking rules are
// unit-tested without a database; the Prisma wiring is in orderChatAccess.ts.
//
// Privacy (CLAUDE.md): a provider sees the customer only as «Анна П.» and
// gets contacts once the booking is CONFIRMED/ACTIVE/COMPLETED. Until then
// phones, e-mails, messenger handles and links in messages are masked, and
// the masked text is what gets stored.
import { canSeeCustomerContacts, customerShortName } from './customerPrivacy';
import { isHttpsUrl, maskContactsAndLinks } from './privacy';

export const CHAT_MESSAGE_MAX_LENGTH = 2000;

/** Shown to the sender while contacts are still masked. */
export const CONTACTS_AFTER_CONFIRM_CHAT = 'Контакты откроются после подтверждения брони';

/** Frequency limits per sender: a burst and a daily cap. */
export const CHAT_RATE_LIMITS = [
  { limit: 20, windowMs: 60_000 },
  { limit: 400, windowMs: 24 * 60 * 60_000 },
];

export const CHAT_PAGE_SIZE = 50;

export type ThreadRole = 'customer' | 'provider' | 'admin';

export interface ChatViewer {
  id: string;
  role?: string | null;
  companyId?: string | null;
  /** Signed in to /admin (password cookie). */
  isAdmin?: boolean;
}

/** What the rules need to know about an order. */
export interface ChatOrder {
  id: string;
  customerId: string;
  /** Companies that bid on the order (any status). */
  bidCompanyIds: readonly string[];
  /** The booked company and the booking status, once a bid was accepted. */
  booking?: { companyId: string; status: string } | null;
}

/**
 * Whether the booking between the order's customer and this company lets
 * them exchange contacts: CONFIRMED, ACTIVE or COMPLETED.
 */
export function chatContactsOpen(order: ChatOrder, companyId: string): boolean {
  const booking = order.booking;
  if (!booking || booking.companyId !== companyId) return false;
  return canSeeCustomerContacts(booking.status);
}

/** Companies the customer may talk to: every bidder plus the booked one. */
export function chatCompanyIds(order: ChatOrder): string[] {
  const ids = new Set(order.bidCompanyIds);
  if (order.booking) ids.add(order.booking.companyId);
  return [...ids];
}

/**
 * The viewer's side in the thread of (order, company): the customer of the
 * order, a manager of that company (when it bid on or booked the order), or
 * an admin (read-only). Null when the viewer may not open the thread.
 */
export function threadRole(
  viewer: ChatViewer | null | undefined,
  order: ChatOrder,
  companyId: string,
): ThreadRole | null {
  if (!viewer) return null;
  if (viewer.id === order.customerId) return 'customer';
  if (viewer.role === 'PROVIDER_ADMIN' && viewer.companyId && viewer.companyId === companyId) {
    return chatCompanyIds(order).includes(companyId) ? 'provider' : null;
  }
  if (viewer.isAdmin || viewer.role === 'PLATFORM_ADMIN') return 'admin';
  return null;
}

export function canWriteThread(role: ThreadRole | null): role is 'customer' | 'provider' {
  return role === 'customer' || role === 'provider';
}

export const THREAD_FORBIDDEN = 'Чат доступен заказчику и исполнителю, предложившему технику';
export const THREAD_READ_ONLY = 'Администратор видит переписку, но не пишет в неё';

/**
 * Which company's thread a viewer opens on an order: the customer names it
 * (`?company=`), a provider always gets its own, an admin names it too.
 */
export function resolveThreadCompany(
  viewer: ChatViewer | null | undefined,
  order: ChatOrder,
  requested: string | null | undefined,
): { ok: true; companyId: string } | { ok: false; error: string; status: number } {
  if (!viewer) return { ok: false, error: 'Необходимо войти в аккаунт', status: 401 };
  if (viewer.role === 'PROVIDER_ADMIN' && viewer.companyId && viewer.id !== order.customerId) {
    if (requested && requested !== viewer.companyId) {
      return { ok: false, error: THREAD_FORBIDDEN, status: 403 };
    }
    return chatCompanyIds(order).includes(viewer.companyId)
      ? { ok: true, companyId: viewer.companyId }
      : { ok: false, error: 'Сначала предложите технику по заявке', status: 403 };
  }
  if (!requested) return { ok: false, error: 'Укажите исполнителя (company)', status: 400 };
  if (viewer.id === order.customerId || viewer.isAdmin || viewer.role === 'PLATFORM_ADMIN') {
    return chatCompanyIds(order).includes(requested)
      ? { ok: true, companyId: requested }
      : { ok: false, error: 'Этот исполнитель не предлагал технику по заявке', status: 404 };
  }
  return { ok: false, error: THREAD_FORBIDDEN, status: 403 };
}

/**
 * The threads of an order a viewer may see: the customer and admins see all
 * of them, a provider only its own. Everyone else sees none.
 */
export function visibleThreads<T extends { companyId: string }>(
  threads: readonly T[],
  viewer: ChatViewer | null | undefined,
  order: ChatOrder,
): T[] {
  if (!viewer) return [];
  if (viewer.id === order.customerId || viewer.isAdmin || viewer.role === 'PLATFORM_ADMIN') {
    return [...threads];
  }
  if (viewer.role === 'PROVIDER_ADMIN' && viewer.companyId) {
    return threads.filter((thread) => thread.companyId === viewer.companyId);
  }
  return [];
}

export type PreparedChatMessage =
  { ok: true; text: string; masked: boolean } | { ok: false; error: string };

/**
 * Trims and checks a message and, while the booking is not confirmed, hides
 * contacts and links. `masked` tells the UI to explain why the text changed.
 */
export function prepareChatMessage(raw: unknown, contactsOpen: boolean): PreparedChatMessage {
  if (typeof raw !== 'string') return { ok: false, error: 'Напишите сообщение' };
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length === 0) return { ok: false, error: 'Напишите сообщение' };
  if (text.length > CHAT_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Сообщение слишком длинное: не больше ${CHAT_MESSAGE_MAX_LENGTH} символов`,
    };
  }
  if (contactsOpen) return { ok: true, text, masked: false };
  const safe = maskContactsAndLinks(text);
  return { ok: true, text: safe, masked: safe !== text };
}

/** An attachment is an https link (Vercel Blob) or nothing. */
export function prepareAttachmentUrl(
  raw: unknown,
): { ok: true; url: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, url: null };
  if (typeof raw !== 'string' || raw.length > 2048 || !isHttpsUrl(raw)) {
    return { ok: false, error: 'Вложение должно быть ссылкой https' };
  }
  return { ok: true, url: raw };
}

/**
 * Whether a message came from the other side of the thread than the viewer:
 * for the customer anything not written by them, for a provider anything
 * written by the customer (so a colleague's message is not «unread»).
 */
export function isFromOtherSide(
  message: { senderUserId: string },
  role: ThreadRole,
  orderCustomerId: string,
  viewerId: string,
): boolean {
  if (role === 'customer') return message.senderUserId !== orderCustomerId;
  if (role === 'provider') return message.senderUserId === orderCustomerId;
  return message.senderUserId !== viewerId;
}

/** Unread messages for the viewer: from the other side and not yet read. */
export function countUnread(
  messages: readonly { senderUserId: string; readAt: Date | null }[],
  role: ThreadRole,
  orderCustomerId: string,
  viewerId: string,
): number {
  return messages.filter(
    (message) =>
      message.readAt === null && isFromOtherSide(message, role, orderCustomerId, viewerId),
  ).length;
}

/**
 * How the other side is named in the thread header: the customer sees the
 * company, a provider sees «Анна П.», an admin sees both.
 */
export function counterpartName(
  role: ThreadRole,
  names: { companyName: string; customerName: string },
): string {
  if (role === 'customer') return names.companyName;
  if (role === 'provider') return customerShortName(names.customerName);
  return `${customerShortName(names.customerName)} ↔ ${names.companyName}`;
}

/** A message as the API returns it: no sender ids, only «mine» or not. */
export interface PublicChatMessage {
  id: string;
  body: string;
  attachmentUrl: string | null;
  createdAt: string;
  /** Written by the viewer's side (the customer, or the viewer's company). */
  mine: boolean;
  readAt: string | null;
}

export function toPublicMessage(
  message: {
    id: string;
    body: string;
    attachmentUrl: string | null;
    createdAt: Date;
    readAt: Date | null;
    senderUserId: string;
  },
  role: ThreadRole,
  orderCustomerId: string,
  viewerId: string,
): PublicChatMessage {
  return {
    id: message.id,
    body: message.body,
    attachmentUrl: message.attachmentUrl,
    createdAt: message.createdAt.toISOString(),
    mine: role !== 'admin' && !isFromOtherSide(message, role, orderCustomerId, viewerId),
    readAt: message.readAt ? message.readAt.toISOString() : null,
  };
}

/** The sender's name in a notification to the other side (never the full customer name). */
export function senderNameFor(
  senderRole: 'customer' | 'provider',
  names: { companyName: string; customerName: string },
): string {
  return senderRole === 'customer' ? customerShortName(names.customerName) : names.companyName;
}
