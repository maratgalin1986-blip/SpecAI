// Notifications: which channels a message goes to and what it says. Pure
// functions only (no database, no network), so the rules are unit-tested;
// the dispatcher in ./notifyUser.ts loads the data and calls the adapters.
//
// Privacy (CLAUDE.md): a provider never gets the customer's full name, phone
// or e-mail in a notification — only «Анна П.» — and texts that come from
// users or chats are passed through maskContacts.
import { maskContacts } from '../privacy';

export const CHANNELS = ['telegram', 'push', 'email', 'whatsapp', 'sms'] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  telegram: 'Telegram',
  push: 'Push в приложении',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
};

export type ChannelPrefs = Record<Channel, boolean>;

/** Without a saved row: Telegram, push and e-mail on; the paid ones off. */
export const DEFAULT_PREFS: ChannelPrefs = {
  telegram: true,
  push: true,
  email: true,
  whatsapp: false,
  sms: false,
};

export function prefsFrom(row: Partial<ChannelPrefs> | null | undefined): ChannelPrefs {
  const prefs = { ...DEFAULT_PREFS };
  if (!row) return prefs;
  for (const channel of CHANNELS) {
    if (typeof row[channel] === 'boolean') prefs[channel] = row[channel] as boolean;
  }
  return prefs;
}

/** Everything the dispatcher knows about where a user can be reached. */
export interface Recipient {
  userId: string;
  email?: string | null;
  phone?: string | null;
  telegramChatId?: string | null;
  pushTokens?: string[];
}

/** Which adapters are set up on the server (env vars present). */
export interface ServerChannels {
  telegram: boolean;
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
}

/** Reserved .invalid addresses belong to technical accounts (chat importer). */
export function isRealEmail(email: string | null | undefined): email is string {
  return Boolean(email && email.includes('@') && !email.trim().toLowerCase().endsWith('.invalid'));
}

/** +7XXXXXXXXXX (or any 10–15 digits) → digits only; null if it is not a phone. */
export function phoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** Whether a channel can reach this recipient at all (server set up + address known). */
export function channelReachable(
  channel: Channel,
  recipient: Recipient,
  server: ServerChannels,
): boolean {
  if (!server[channel]) return false;
  switch (channel) {
    case 'telegram':
      return Boolean(recipient.telegramChatId);
    case 'push':
      return (recipient.pushTokens?.length ?? 0) > 0;
    case 'email':
      return isRealEmail(recipient.email);
    case 'whatsapp':
    case 'sms':
      return phoneDigits(recipient.phone) !== null;
  }
}

/** The channels a notification goes to: chosen by the user AND reachable. */
export function pickChannels(
  prefs: ChannelPrefs,
  recipient: Recipient,
  server: ServerChannels,
): Channel[] {
  return CHANNELS.filter(
    (channel) => prefs[channel] && channelReachable(channel, recipient, server),
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type NotificationEvent =
  /** To providers: a new order in their categories / area. */
  | {
      type: 'order.new';
      orderId: string;
      description: string;
      categoryName?: string | null;
      city?: string | null;
      startDate: Date;
      fromChat?: boolean;
    }
  /** To the customer: a provider bid on their order. */
  | {
      type: 'bid.new';
      orderId: string;
      equipmentName: string;
      price: string;
      companyName?: string | null;
    }
  /** To the provider: the customer accepted their bid (booking created). */
  | {
      type: 'bid.accepted';
      bookingId: string;
      equipmentName: string;
      price: string;
      startDate: Date;
      /** Always the short form («Анна П.»). */
      customerShortName: string;
    }
  /** To the customer or the provider: the booking changed its status. */
  | {
      type: 'booking.status';
      bookingId: string;
      equipmentName: string;
      status: 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
      startDate: Date;
      /** 'customer' — the provider changed it; 'provider' — the customer cancelled. */
      audience: 'customer' | 'provider';
    }
  /** To admins: a comment waits for moderation. */
  | { type: 'comment.pending'; authorShortName: string; about: string; text: string }
  /** To the author and the subject: a comment was published. */
  | { type: 'comment.published'; audience: 'author' | 'subject'; about: string; text: string }
  /** To the other side of an order chat: a new message (text already masked). */
  | { type: 'chat.message'; orderId: string; fromName: string; text: string }
  /** «Проверить уведомления» in the settings. */
  | { type: 'test' };

export interface RenderedNotification {
  title: string;
  body: string;
  /** Path on the site, e.g. /orders/abc. */
  path: string;
}

const STATUS_TEXT: Record<string, string> = {
  PENDING: 'ожидает подтверждения',
  CONFIRMED: 'подтверждена',
  ACTIVE: 'в работе',
  COMPLETED: 'завершена',
  CANCELLED: 'отменена',
};

function day(date: Date): string {
  return date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function renderNotification(event: NotificationEvent): RenderedNotification {
  switch (event.type) {
    case 'order.new': {
      const what = event.categoryName ?? 'Техника';
      const where = event.city ? `, ${event.city}` : '';
      return {
        title: `Новая заявка: ${what}${where}`,
        body:
          `${day(event.startDate)} · ${clip(maskContacts(event.description), 180)}` +
          (event.fromChat ? '\nНайдена в открытом чате.' : ''),
        path: `/orders/${event.orderId}`,
      };
    }
    case 'bid.new':
      return {
        title: 'Новое предложение по вашей заявке',
        body: `${event.equipmentName}${event.companyName ? ` · ${event.companyName}` : ''} — ${event.price}`,
        path: `/orders/${event.orderId}`,
      };
    case 'bid.accepted':
      return {
        title: 'Ваше предложение приняли',
        body:
          `${event.customerShortName} выбрал(а) ${event.equipmentName} за ${event.price}, ` +
          `с ${day(event.startDate)}. Подтвердите бронь в кабинете — после этого откроются контакты.`,
        path: '/provider#bookings',
      };
    case 'booking.status': {
      const status = STATUS_TEXT[event.status] ?? event.status;
      return {
        title: `Бронь ${status}`,
        body:
          event.audience === 'provider'
            ? `Заказчик отменил бронь: ${event.equipmentName}, ${day(event.startDate)}`
            : `${event.equipmentName}, ${day(event.startDate)}: бронь ${status}`,
        path: event.audience === 'provider' ? '/provider#bookings' : '/dashboard#bookings',
      };
    }
    case 'comment.pending':
      return {
        title: 'Комментарий ждёт модерации',
        body: `${event.authorShortName} ${event.about}: ${clip(maskContacts(event.text), 200)}`,
        path: '/admin#comments',
      };
    case 'comment.published':
      return {
        title:
          event.audience === 'author' ? 'Ваш комментарий опубликован' : 'О вас новый комментарий',
        body: `${event.about}: ${clip(maskContacts(event.text), 200)}`,
        // /dashboard sends providers on to /provider.
        path: '/dashboard',
      };
    case 'chat.message':
      return {
        title: 'Новое сообщение по заявке',
        body: `${event.fromName}: ${clip(maskContacts(event.text), 200)}`,
        path: `/orders/${event.orderId}#chat`,
      };
    case 'test':
      return {
        title: 'Проверка уведомлений',
        body: 'Если вы это видите — канал работает.',
        path: '/dashboard',
      };
  }
}

/** Plain text for Telegram, WhatsApp and SMS. SMS is kept short (one or two segments). */
export function plainText(
  message: RenderedNotification,
  baseUrl: string,
  channel: Channel,
): string {
  const link = `${baseUrl.replace(/\/+$/, '')}${message.path}`;
  if (channel === 'sms') return clip(`${message.title}. ${link}`, 140);
  return `${message.title}\n${message.body}\n${link}`;
}

// ---------------------------------------------------------------------------
// Which providers hear about a new order
// ---------------------------------------------------------------------------

/** How far from a provider's base an order still counts as «рядом». */
export const ORDER_RADIUS_KM = 150;

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface ProviderForMatch {
  categoryIds: string[];
  baseLat?: number | null;
  baseLon?: number | null;
}

export interface OrderForMatch {
  categoryId?: string | null;
  lat?: number | null;
  lon?: number | null;
}

/**
 * A provider hears about an order when it has machinery of the order's
 * category (any, if the order has none) and, when both points are known, its
 * base is within ORDER_RADIUS_KM of the work site.
 */
export function providerMatchesOrder(provider: ProviderForMatch, order: OrderForMatch): boolean {
  if (provider.categoryIds.length === 0) return false;
  if (order.categoryId && !provider.categoryIds.includes(order.categoryId)) return false;
  if (
    order.lat != null &&
    order.lon != null &&
    provider.baseLat != null &&
    provider.baseLon != null
  ) {
    const km = distanceKm(
      { lat: order.lat, lon: order.lon },
      { lat: provider.baseLat, lon: provider.baseLon },
    );
    if (km > ORDER_RADIUS_KM) return false;
  }
  return true;
}
