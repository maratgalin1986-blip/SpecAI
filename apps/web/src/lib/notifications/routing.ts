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
  | { type: 'test' }
  /** To the company's managers: a document runs out in 30 days / today (api/cron/daily). */
  | {
      type: 'document.expiring';
      /** «СТС № … (JCB 4CX)», see lib/documents.ts documentTitle. */
      title: string;
      expiresAt: Date;
      /** 0 on the day (or after), otherwise the days left. */
      daysLeft: number;
    }
  /** To providers at 19:00: tomorrow's open orders in their categories and radius. */
  | { type: 'digest.evening'; items: string[] }
  /** To the customer at 19:00: the booking starts tomorrow. */
  | {
      type: 'booking.tomorrow';
      bookingId: string;
      equipmentName: string;
      startDate: Date;
      providerName?: string | null;
    };

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
    case 'document.expiring':
      return {
        title:
          event.daysLeft <= 0
            ? `Документ истёк: ${event.title}`
            : `Документ истекает через ${event.daysLeft} дн: ${event.title}`,
        body:
          event.daysLeft <= 0
            ? `Срок действия закончился ${day(event.expiresAt)}. Продлите документ и обновите дату в кабинете — без него машину могут не выбрать.`
            : `Действует до ${day(event.expiresAt)}. Продлите заранее и обновите дату в кабинете.`,
        path: '/provider#documents',
      };
    case 'digest.evening': {
      const count = event.items.length;
      return {
        title: `На завтра: ${count} ${pluralOrders(count)}`,
        body: `${event.items.map((item) => clip(maskContacts(item), 80)).join('; ')}. Предложите цену вечером — утром заказчики выбирают.`,
        path: '/orders',
      };
    }
    case 'booking.tomorrow':
      return {
        title: 'Завтра начало работ',
        body: `${event.equipmentName}${event.providerName ? ` · ${event.providerName}` : ''}, ${day(event.startDate)}. Проверьте адрес и время подачи; исполнитель на связи в кабинете.`,
        path: '/dashboard#bookings',
      };
  }
}

function pluralOrders(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'заявка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'заявки';
  return 'заявок';
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
  /** The company's own delivery radius (Company.deliveryRadiusKm); ORDER_RADIUS_KM without it. */
  radiusKm?: number | null;
}

export interface OrderForMatch {
  categoryId?: string | null;
  lat?: number | null;
  lon?: number | null;
}

/**
 * A provider hears about an order when it has machinery of the order's
 * category (any, if the order has none) and, when both points are known, its
 * base is within its own delivery radius (ORDER_RADIUS_KM when none is set)
 * of the work site.
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
    const radius =
      provider.radiusKm != null && provider.radiusKm > 0 ? provider.radiusKm : ORDER_RADIUS_KM;
    if (km > radius) return false;
  }
  return true;
}
