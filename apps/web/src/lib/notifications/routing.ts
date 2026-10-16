// Notifications: which channels a message goes to and what it says. Pure
// functions only (no database, no network), so the rules are unit-tested;
// the dispatcher in ./notifyUser.ts loads the data and calls the adapters.
//
// Privacy (CLAUDE.md): a provider never gets the customer's full name, phone
// or e-mail in a notification — only «Анна П.» — and texts that come from
// users or chats are passed through maskContacts.
import { stripChatOrderNote } from '../chatOrders';
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
  /** To the customer: a provider bid on their order (or changed its bid: `updated`). */
  | {
      type: 'bid.new';
      orderId: string;
      equipmentName: string;
      price: string;
      companyName?: string | null;
      updated?: boolean;
    }
  /** To the provider's managers: a customer booked a machine directly (PENDING, awaits confirmation). */
  | {
      type: 'booking.new';
      bookingId: string;
      equipmentName: string;
      startDate: Date;
      endDate: Date;
      /** Always the short form («Анна П.»). */
      customerShortName: string;
    }
  /** To the companies whose bids were pending: the customer cancelled the open order. */
  | {
      type: 'order.cancelled';
      orderId: string;
      equipmentName: string;
      categoryName?: string | null;
      startDate: Date;
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
  /** At 19:00, a CONFIRMED booking starts tomorrow: to the customer, the provider and the operator. */
  | {
      type: 'booking.tomorrow';
      bookingId: string;
      equipmentName: string;
      startDate: Date;
      providerName?: string | null;
      /** Who reads it; 'customer' when not given. */
      audience?: 'customer' | 'provider' | 'operator';
    }
  /** To СпецПласт16's managers: a bid on a guest or chat order, whose customer has no account to hear of it. */
  | {
      type: 'bid.relay';
      orderId: string;
      equipmentName: string;
      price: string;
      companyName?: string | null;
      fromChat: boolean;
    }
  /** To the customer: the operator moved the shift (Выехал, На объекте, Работа…). */
  | {
      type: 'shift.status';
      bookingId: string;
      equipmentName: string;
      /** Russian label of the shift status. */
      statusLabel: string;
      note?: string | null;
      at: Date;
    }
  /** Timesheet steps: submitted / confirmed / disputed, to the other side. */
  | {
      type: 'timesheet';
      bookingId: string;
      equipmentName: string;
      step: 'submitted' | 'confirmed' | 'disputed' | 'final';
      hoursWorked: string;
      audience: 'customer' | 'provider';
      note?: string | null;
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

/** «16.10.2026» or «16.10.2026 – 18.10.2026». */
function dateRange(start: Date, end: Date): string {
  const from = day(start);
  const to = day(end);
  return from === to ? from : `${from} – ${to}`;
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
      // A chat order's description ends with the removal notice (lib/chatOrders.ts):
      // the alert says «найдена в открытом чате» once, in its own line.
      const text = stripChatOrderNote(event.description);
      return {
        title: `Новая заявка: ${what}${where}`,
        body:
          `${day(event.startDate)} · ${clip(maskContacts(text), 180)}` +
          (event.fromChat ? '\nНайдена в открытом чате.' : ''),
        path: `/orders/${event.orderId}`,
      };
    }
    case 'bid.new':
      return {
        title: event.updated
          ? 'Предложение по вашей заявке обновлено'
          : 'Новое предложение по вашей заявке',
        body: `${event.equipmentName}${event.companyName ? ` · ${event.companyName}` : ''} — ${event.price}`,
        path: `/orders/${event.orderId}`,
      };
    case 'booking.new':
      return {
        title: `Новая бронь: ${event.equipmentName}`,
        body:
          `${event.customerShortName} бронирует ${event.equipmentName} на ${dateRange(event.startDate, event.endDate)}. ` +
          'Подтвердите или отклоните бронь — заказчик ждёт ответа.',
        path: '/provider#bookings',
      };
    case 'order.cancelled':
      return {
        title: 'Заявка отменена заказчиком',
        body:
          `Ваше предложение (${event.equipmentName}) снято: заказчик отменил заявку` +
          `${event.categoryName ? ` «${event.categoryName}»` : ''} на ${day(event.startDate)}. Машина снова свободна.`,
        path: '/orders',
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
      if (event.audience === 'provider' || event.audience === 'operator') {
        return {
          title: 'Завтра выезд на объект',
          body:
            `${event.equipmentName}, ${day(event.startDate)}. ` +
            (event.audience === 'provider'
              ? 'Проверьте машиниста и время подачи; адрес и контакты заказчика — в кабинете.'
              : 'Адрес и время подачи — в приложении, отметьте «Выехал», когда тронетесь.'),
          path: event.audience === 'provider' ? '/provider#bookings' : '/dashboard#shifts',
        };
      }
      return {
        title: 'Завтра начало работ',
        body: `${event.equipmentName}${event.providerName ? ` · ${event.providerName}` : ''}, ${day(event.startDate)}. Проверьте адрес и время подачи; исполнитель на связи в кабинете.`,
        path: '/dashboard#bookings',
      };
    case 'bid.relay':
      return {
        title: `Предложение по заявке ${event.fromChat ? 'из чата' : 'гостя с сайта'}`,
        body:
          `${event.equipmentName}${event.companyName ? ` · ${event.companyName}` : ''} — ${event.price}. ` +
          'У заказчика нет кабинета: позвоните ему и передайте предложение.',
        path: `/orders/${event.orderId}`,
      };
    case 'shift.status': {
      const time = event.at.toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        title: `Машинист: ${event.statusLabel}`,
        body:
          `${event.equipmentName}, ${day(event.at)} ${time}` +
          (event.note ? ` — ${clip(maskContacts(event.note), 160)}` : ''),
        path: '/dashboard#bookings',
      };
    }
    case 'timesheet': {
      const titles: Record<typeof event.step, string> = {
        submitted: 'Табель смены ждёт подтверждения',
        confirmed: 'Табель смены подтверждён',
        disputed: 'По табелю смены есть замечания',
        final: 'Табель смены подтверждён обеими сторонами',
      };
      return {
        // The company's manager hears that his machinist filled in the timesheet.
        title:
          event.step === 'submitted' && event.audience === 'provider'
            ? 'Машинист заполнил табель — подтвердите'
            : titles[event.step],
        body:
          `${event.equipmentName}: ${event.hoursWorked} ч` +
          (event.note ? ` — ${clip(maskContacts(event.note), 160)}` : ''),
        path: event.audience === 'provider' ? '/provider#bookings' : '/dashboard#bookings',
      };
    }
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
  // SMS: the title is clipped, never the link — a cut link would open nothing.
  if (channel === 'sms')
    return `${clip(message.title, Math.max(SMS_MAX - link.length - 2, 8))}. ${link}`;
  return `${message.title}\n${message.body}\n${link}`;
}

const SMS_MAX = 140;

/**
 * Events the legacy owner alert (lib/notify.ts notifyTelegram → TELEGRAM_CHAT_ID)
 * already covers: a new order, a bid on a guest or chat order, a comment for
 * moderation. When the owner also linked that very chat to his account, the
 * dispatcher skips Telegram for him, so he reads each of them once.
 */
export const OWNER_TELEGRAM_EVENTS: readonly NotificationEvent['type'][] = [
  'order.new',
  'bid.relay',
  'comment.pending',
];

export function coveredByOwnerTelegram(
  event: NotificationEvent,
  recipient: Recipient,
  ownerChatId: string | null | undefined,
): boolean {
  if (!ownerChatId || !recipient.telegramChatId) return false;
  return (
    recipient.telegramChatId.trim() === ownerChatId.trim() &&
    OWNER_TELEGRAM_EVENTS.includes(event.type)
  );
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

/**
 * Machine types that stand in for each other in a new-order alert. The
 * catalogue split of 2026-10-11 kept the old slugs (so every machine listed as
 * «Экскаваторы» before is now «гусеничный») and added new leaves nobody owns
 * yet; without this a «колёсный» or «мини» order reached no one.
 */
export const CATEGORY_FAMILIES: readonly (readonly string[])[] = [
  ['excavators', 'wheeled-excavators', 'mini-excavators'],
  ['cranes', 'crawler-cranes'],
  ['aerial-platforms', 'scissor-lifts'],
];

export interface CategoryRow {
  id: string;
  slug: string;
  parentId: string | null;
}

/**
 * Ids of the categories whose machines can take an order of `categoryId`:
 * the category itself, its family (CATEGORY_FAMILIES), its group (a machine
 * filed under the group row itself) and, for an order filed under a group,
 * every category of that group. Null for an order without a category.
 */
export function acceptedCategoryIds(
  categoryId: string | null | undefined,
  rows: readonly CategoryRow[],
): string[] | null {
  if (!categoryId) return null;
  const row = rows.find((item) => item.id === categoryId);
  if (!row) return [categoryId];
  const ids = new Set([categoryId]);
  if (row.parentId) ids.add(row.parentId);
  for (const item of rows) if (item.parentId === row.id) ids.add(item.id);
  const family = CATEGORY_FAMILIES.find((slugs) => slugs.includes(row.slug));
  if (family) {
    for (const item of rows) if (family.includes(item.slug)) ids.add(item.id);
  }
  return [...ids];
}

export interface ProviderForMatch {
  categoryIds: string[];
  baseLat?: number | null;
  baseLon?: number | null;
  /** The company's own delivery radius (Company.deliveryRadiusKm); ORDER_RADIUS_KM without it. */
  radiusKm?: number | null;
  /** Company.baseAddress: matched against the city of an order with no known point. */
  baseAddress?: string | null;
  /** СпецПласт16's own company: its managers sort out orders nobody can place. */
  isHouse?: boolean;
}

export interface OrderForMatch {
  categoryId?: string | null;
  /** acceptedCategoryIds(categoryId); just [categoryId] when not given. */
  categoryIds?: string[] | null;
  /** The work site, or a known city's centre (lib/geo.ts orderPoint). */
  lat?: number | null;
  lon?: number | null;
  /** The city text, for an order whose point is unknown. */
  city?: string | null;
}

function normalizePlace(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Whether a provider's base address names the city («Бавлы» in «Бавлы, ул. …»). */
export function addressNamesCity(address: string | null | undefined, city: string): boolean {
  const name = normalizePlace(city);
  if (!address || name.length < 3) return false;
  const stem = name.length > 4 ? name.slice(0, -1) : name;
  return normalizePlace(address).includes(stem);
}

/**
 * A provider hears about an order when it has machinery that can take it
 * (OrderForMatch.categoryIds; any, if the order has no category) and its base
 * is within its own delivery radius (ORDER_RADIUS_KM when none is set) of the
 * work site.
 *
 * A provider without base coordinates is never sent everything: it hears only
 * of orders whose city text its base address names (the house company hears
 * of every order). The same rule covers an order whose place is unknown (a
 * chat order from a town we cannot place): it is never spread over the whole
 * region — only the house company and providers whose base address names
 * that town.
 */
export function providerMatchesOrder(provider: ProviderForMatch, order: OrderForMatch): boolean {
  if (provider.categoryIds.length === 0) return false;
  const accepted = order.categoryIds ?? (order.categoryId ? [order.categoryId] : null);
  if (accepted && !accepted.some((id) => provider.categoryIds.includes(id))) return false;
  const byCity = Boolean(
    provider.isHouse || (order.city && addressNamesCity(provider.baseAddress, order.city)),
  );
  if (order.lat == null || order.lon == null) return byCity;
  if (provider.baseLat == null || provider.baseLon == null) return byCity;
  const km = distanceKm(
    { lat: order.lat, lon: order.lon },
    { lat: provider.baseLat, lon: provider.baseLon },
  );
  const radius =
    provider.radiusKm != null && provider.radiusKm > 0 ? provider.radiusKm : ORDER_RADIUS_KM;
  return km <= radius;
}
