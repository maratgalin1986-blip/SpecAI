// Personal data rules (152-ФЗ) shared by the order pages and the orders API.
// Pure functions only, so they are unit-tested without a database.

export const HIDDEN_CONTACT = '[контакт скрыт]';

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const MESSENGER_LINK =
  /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|wa\.me|api\.whatsapp\.com|vk\.com|ok\.ru)\/[^\s,;)]+/giu;
const USERNAME = /(^|[^\p{L}\p{N}_@])@[A-Za-z0-9_]{3,32}(?![A-Za-z0-9_])/gu;
// Digits with spaces, dashes and brackets in between; dots are left out so
// dates such as 01.06.2028 are never touched.
const PHONE_LIKE = /\+?\d[\d\s()-]{5,}\d/g;

function looksLikePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 15) return true;
  // Local numbers written like 242-80-88.
  return digits.length === 7 && /^\d{3}-\d{2}-\d{2}$/.test(candidate.trim());
}

/**
 * Hides phone numbers, e-mails, @usernames and messenger links in free text,
 * e.g. the description of an order imported from a chat. The full text stays
 * in Order.rawText, which only admins and verified providers see.
 */
export function maskContacts(text: string): string {
  return text
    .replace(EMAIL, HIDDEN_CONTACT)
    .replace(MESSENGER_LINK, HIDDEN_CONTACT)
    .replace(USERNAME, (_match, prefix: string) => `${prefix}${HIDDEN_CONTACT}`)
    .replace(PHONE_LIKE, (match) => {
      if (!looksLikePhone(match)) return match;
      // Keep the space that the pattern may have swallowed at the edges.
      const lead = /^\s/.test(match) ? ' ' : '';
      const tail = /\s$/.test(match) ? ' ' : '';
      return `${lead}${HIDDEN_CONTACT}${tail}`;
    });
}

/**
 * Chat history as it goes to the external AI provider: every message with
 * phones, e-mails and messenger handles hidden. Roles and order are kept.
 */
export function maskMessagesForAi<T extends { content: string }>(messages: readonly T[]): T[] {
  return messages.map((message) => ({ ...message, content: maskContacts(message.content) }));
}

export const HIDDEN_LINK = '[ссылка скрыта]';

// Any web link: with a scheme, starting with www., or a bare domain with a
// common zone (site.ru/page). Runs after maskContacts, so e-mails are gone.
// Trailing punctuation after a link stays in the text.
const WEB_LINK =
  /(?:https?:\/\/|www\.)[^\s<>"']*[^\s<>"'.,;:!?)]|(?<![\p{L}\p{N}@-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:ru|рф|com|net|org|su|info|biz|pro|site|online|store|shop|me|io|ua|by|kz)(?![\p{L}\p{N}])(?:\/(?:[^\s<>"']*[^\s<>"'.,;:!?)])?)?/giu;

/**
 * Text written by users for other users (comments): contacts and any web
 * links are hidden, so the platform is not used to lure clients away or to
 * post spam.
 */
export function maskContactsAndLinks(text: string): string {
  return maskContacts(text).replace(WEB_LINK, HIDDEN_LINK);
}

/** Only absolute http(s) links may be rendered as <a href>. */
export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export interface OrderViewer {
  userId?: string | null;
  role?: string | null;
  companyId?: string | null;
  emailVerified?: boolean;
  /** Signed in to /admin (password cookie) or PLATFORM_ADMIN. */
  isAdmin?: boolean;
}

/**
 * Who sees the bids of an order: the customer and admins see all of them, a
 * provider sees only the bids of their own company, everyone else sees none
 * (only the number of bids).
 */
export function visibleBids<T extends { equipment: { companyId: string } }>(
  bids: T[],
  viewer: OrderViewer,
  orderCustomerId: string,
): T[] {
  if (viewer.isAdmin || viewer.role === 'PLATFORM_ADMIN') return bids;
  if (viewer.userId && viewer.userId === orderCustomerId) return bids;
  if (viewer.companyId) return bids.filter((bid) => bid.equipment.companyId === viewer.companyId);
  return [];
}

/** The customer's name is shown only to the customer and admins. */
export function canSeeCustomerName(viewer: OrderViewer, orderCustomerId: string): boolean {
  return Boolean(
    viewer.isAdmin ||
    viewer.role === 'PLATFORM_ADMIN' ||
    (viewer.userId && viewer.userId === orderCustomerId),
  );
}

/**
 * Contacts of people from messenger chats (name, phone, original message):
 * admins, and providers who confirmed their e-mail.
 */
export function canSeeChatContacts(viewer: OrderViewer): boolean {
  if (viewer.isAdmin || viewer.role === 'PLATFORM_ADMIN') return true;
  return viewer.role === 'PROVIDER_ADMIN' && viewer.emailVerified === true;
}

/** Description of an order as a given viewer may see it. */
export function orderDescriptionFor(
  order: { description: string; source: string },
  viewer: OrderViewer,
): string {
  if (order.source === 'SITE' || canSeeChatContacts(viewer)) return order.description;
  return maskContacts(order.description);
}
