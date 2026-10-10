// The admin's notification feed (/admin/feed): events derived from the data
// the service already has — new orders and bids, booking status changes,
// moderation queue, new providers, chat imports under review, expired
// documents, callback requests. Pure functions, unit-tested; the loader in
// lib/adminFeedData.ts does the database work. «Read» state lives in
// AdminFeedRead by `key`.

import { providerDocumentKindLabel } from '@specai/shared';
import { documentStatus } from './documents';
import { providerPath } from './providerSeo';

export type FeedKind =
  | 'order'
  | 'order_review'
  | 'bid'
  | 'booking'
  | 'comment'
  | 'review'
  | 'provider'
  | 'document'
  | 'lead';

export type FeedTone = 'signal' | 'graphite' | 'amber' | 'red' | 'green';

export interface FeedEvent {
  /** "<kind>:<entity id>[:<state>]" — the AdminFeedRead key. */
  key: string;
  kind: FeedKind;
  /** ISO date-time the event happened. */
  at: string;
  title: string;
  text: string;
  href: string;
  tag: string;
  tone: FeedTone;
}

export const FEED_KIND_LABELS: Record<FeedKind, string> = {
  order: 'Заявка',
  order_review: 'На проверку',
  bid: 'Предложение',
  booking: 'Бронь',
  comment: 'Комментарий',
  review: 'Отзыв',
  provider: 'Исполнитель',
  document: 'Документ',
  lead: 'Звонок',
};

/** How far back the feed looks. */
export const FEED_WINDOW_DAYS = 30;

export function feedKey(kind: FeedKind, id: string, state?: string): string {
  return state ? `${kind}:${id}:${state}` : `${kind}:${id}`;
}

/** Newest first; equal moments keep a stable order by key. */
export function sortFeed(events: FeedEvent[]): FeedEvent[] {
  return [...events].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at) || a.key.localeCompare(b.key),
  );
}

export function splitFeed(events: FeedEvent[], readKeys: ReadonlySet<string>) {
  const unread: FeedEvent[] = [];
  const read: FeedEvent[] = [];
  for (const event of events) (readKeys.has(event.key) ? read : unread).push(event);
  return { unread, read };
}

export function unreadCount(events: FeedEvent[], readKeys: ReadonlySet<string>): number {
  return events.reduce((n, event) => n + (readKeys.has(event.key) ? 0 : 1), 0);
}

export type FeedTab = 'unread' | 'read' | 'all';

export function parseFeedTab(value: string | string[] | undefined): FeedTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'read' || raw === 'all' ? raw : 'unread';
}

export function clipText(text: string | null | undefined, max = 140): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const iso = (date: Date) => date.toISOString();

// ---------------------------------------------------------------------------
// Builders: one per data source. Each gets plain rows and returns events.
// ---------------------------------------------------------------------------

export interface FeedOrderRow {
  id: string;
  status: string;
  description: string;
  createdAt: Date;
  source: string;
  categoryName?: string | null;
  city?: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  TELEGRAM: 'Telegram',
  WHATSAPP: 'WhatsApp',
  OTHER: 'другой источник',
};

export function orderEvents(orders: FeedOrderRow[]): FeedEvent[] {
  return orders.map((order) => {
    const where = [order.categoryName, order.city].filter(Boolean).join(', ');
    if (order.status === 'PENDING_REVIEW') {
      return {
        key: feedKey('order_review', order.id),
        kind: 'order_review',
        at: iso(order.createdAt),
        title: `Заявка из чата ждёт проверки${where ? `: ${where}` : ''}`,
        text: `${SOURCE_LABELS[order.source] ?? order.source} · ${clipText(order.description)}`,
        href: '/admin',
        tag: FEED_KIND_LABELS.order_review,
        tone: 'amber',
      };
    }
    return {
      key: feedKey('order', order.id),
      kind: 'order',
      at: iso(order.createdAt),
      title: `Новая заявка${where ? `: ${where}` : ''}`,
      text:
        (order.source !== 'SITE' ? `${SOURCE_LABELS[order.source] ?? order.source} · ` : '') +
        clipText(order.description),
      href: `/orders/${order.id}`,
      tag: FEED_KIND_LABELS.order,
      tone: 'signal',
    };
  });
}

export interface FeedBidRow {
  id: string;
  createdAt: Date;
  /** Already formatted, e.g. «12 000 ₽». */
  price: string;
  orderId: string;
  equipmentName: string;
  companyName: string;
}

export function bidEvents(bids: FeedBidRow[]): FeedEvent[] {
  return bids.map((bid) => ({
    key: feedKey('bid', bid.id),
    kind: 'bid',
    at: iso(bid.createdAt),
    title: `Предложение: ${bid.companyName}`,
    text: `${bid.equipmentName} — ${bid.price}`,
    href: `/orders/${bid.orderId}#offers`,
    tag: FEED_KIND_LABELS.bid,
    tone: 'graphite',
  }));
}

export interface FeedBookingRow {
  id: string;
  status: string;
  updatedAt: Date;
  equipmentName: string;
  companyName: string;
  orderId: string | null;
}

const BOOKING_TITLES: Record<string, string> = {
  PENDING: 'Исполнитель выбран, бронь ждёт подтверждения',
  CONFIRMED: 'Бронь подтверждена',
  ACTIVE: 'Техника на объекте',
  COMPLETED: 'Заказ завершён',
  CANCELLED: 'Бронь отменена',
};

const BOOKING_TONES: Record<string, FeedTone> = {
  PENDING: 'amber',
  CONFIRMED: 'graphite',
  ACTIVE: 'signal',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

export function bookingEvents(bookings: FeedBookingRow[]): FeedEvent[] {
  return bookings.map((booking) => ({
    // The state is part of the key: every status change is a new event.
    key: feedKey('booking', booking.id, booking.status),
    kind: 'booking',
    at: iso(booking.updatedAt),
    title: BOOKING_TITLES[booking.status] ?? `Бронь: ${booking.status}`,
    text: `${booking.equipmentName} · ${booking.companyName}`,
    href: booking.orderId ? `/orders/${booking.orderId}` : '/admin',
    tag: FEED_KIND_LABELS.booking,
    tone: BOOKING_TONES[booking.status] ?? 'graphite',
  }));
}

export interface FeedCommentRow {
  id: string;
  createdAt: Date;
  text: string;
  authorName: string;
  /** «исполнитель „Альфа“» / «заказчик Иван». */
  about: string;
}

export function commentEvents(comments: FeedCommentRow[]): FeedEvent[] {
  return comments.map((comment) => ({
    key: feedKey('comment', comment.id),
    kind: 'comment',
    at: iso(comment.createdAt),
    title: 'Комментарий ждёт модерации',
    text: `${comment.authorName} → ${comment.about}: ${clipText(comment.text)}`,
    href: '/admin#comments',
    tag: FEED_KIND_LABELS.comment,
    tone: 'amber',
  }));
}

export interface FeedReviewRow {
  id: string;
  createdAt: Date;
  rating: number;
  text: string;
  authorName: string;
  companyName: string;
}

export function reviewEvents(reviews: FeedReviewRow[]): FeedEvent[] {
  return reviews.map((review) => ({
    key: feedKey('review', review.id),
    kind: 'review',
    at: iso(review.createdAt),
    title: `Отзыв ${'★'.repeat(review.rating)} ждёт модерации`,
    text: `${review.authorName} о «${review.companyName}»: ${clipText(review.text)}`,
    href: '/admin#comments',
    tag: FEED_KIND_LABELS.review,
    tone: 'amber',
  }));
}

export interface FeedProviderRow {
  id: string;
  name: string;
  createdAt: Date;
  machines: number;
  taxId?: string | null;
}

export function providerEvents(companies: FeedProviderRow[]): FeedEvent[] {
  return companies.map((company) => ({
    key: feedKey('provider', company.id),
    kind: 'provider',
    at: iso(company.createdAt),
    title: `Новый исполнитель: ${company.name}`,
    text: [
      company.taxId ? `ИНН ${company.taxId}` : 'ИНН не указан',
      company.machines > 0 ? `техники: ${company.machines}` : 'техника не добавлена',
    ].join(' · '),
    href: providerPath(company.id),
    tag: FEED_KIND_LABELS.provider,
    tone: 'green',
  }));
}

export interface FeedDocumentRow {
  id: string;
  kind: string;
  number?: string | null;
  operatorName?: string | null;
  expiresAt: Date | null;
  companyId: string;
  companyName: string;
  equipmentName?: string | null;
}

/** Expired documents only (lib/documents.ts); the moment is the expiry day. */
export function documentEvents(docs: FeedDocumentRow[], now: Date = new Date()): FeedEvent[] {
  const events: FeedEvent[] = [];
  for (const doc of docs) {
    if (!doc.expiresAt || documentStatus(doc, now) !== 'expired') continue;
    const subject = doc.equipmentName ?? doc.operatorName ?? null;
    events.push({
      key: feedKey('document', doc.id, 'expired'),
      kind: 'document',
      at: iso(doc.expiresAt),
      title: `Документ истёк: ${providerDocumentKindLabel(doc.kind)}${doc.number ? ` № ${doc.number}` : ''}`,
      text: `${doc.companyName}${subject ? ` · ${subject}` : ''}`,
      href: '/admin/providers?filter=docs_expired',
      tag: FEED_KIND_LABELS.document,
      tone: 'red',
    });
  }
  return events;
}

export interface FeedLeadRow {
  id: string;
  createdAt: Date;
  name: string;
  phone: string;
  message?: string | null;
}

export function leadEvents(leads: FeedLeadRow[]): FeedEvent[] {
  return leads.map((lead) => ({
    key: feedKey('lead', lead.id),
    kind: 'lead',
    at: iso(lead.createdAt),
    title: `Заявка на звонок: ${lead.name}`,
    text: `${lead.phone}${lead.message ? ` · ${clipText(lead.message)}` : ''}`,
    href: '/admin#leads',
    tag: FEED_KIND_LABELS.lead,
    tone: 'signal',
  }));
}

/** «сегодня 14:05», «вчера 09:30», «12.03 18:00» — in Moscow time. */
export function feedMoment(at: string, now: Date = new Date()): string {
  const date = new Date(at);
  const dayKey = (d: Date) => d.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
  const time = date.toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  });
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const day = dayKey(date);
  if (day === today) return `сегодня ${time}`;
  if (day === yesterday) return `вчера ${time}`;
  return `${day.slice(0, 5)} ${time}`;
}
