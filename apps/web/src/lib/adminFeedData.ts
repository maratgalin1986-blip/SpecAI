// Database side of the admin feed (/admin/feed and the badge in the admin
// nav): loads the latest rows of every source, turns them into events with
// lib/adminFeed.ts and looks up which ones the admin has read.
import { prisma } from '@specai/database';
import {
  FEED_WINDOW_DAYS,
  bidEvents,
  bookingEvents,
  commentEvents,
  documentEvents,
  leadEvents,
  orderEvents,
  providerEvents,
  reviewEvents,
  sortFeed,
  unreadCount,
  type FeedEvent,
} from './adminFeed';
import { formatMoney } from './money';

/** Rows per source; the merged feed is capped at FEED_LIMIT. */
const PER_SOURCE = 40;
export const FEED_LIMIT = 200;
/** Documents that ran out longer ago than this are no longer news. */
const EXPIRED_DOCS_DAYS = 90;

export interface AdminFeed {
  events: FeedEvent[];
  readKeys: Set<string>;
  unread: number;
}

export async function loadAdminFeed(now: Date = new Date()): Promise<AdminFeed> {
  const since = new Date(now.getTime() - FEED_WINDOW_DAYS * 86_400_000);
  const docsSince = new Date(now.getTime() - EXPIRED_DOCS_DAYS * 86_400_000);
  const recent = { createdAt: { gte: since } };

  const [orders, bids, bookings, comments, reviews, providers, documents, leads] =
    await Promise.all([
      prisma.order.findMany({
        where: recent,
        select: {
          id: true,
          status: true,
          description: true,
          createdAt: true,
          source: true,
          category: { select: { name: true } },
          location: { select: { city: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: PER_SOURCE,
      }),
      prisma.bid.findMany({
        where: recent,
        select: {
          id: true,
          createdAt: true,
          price: true,
          currency: true,
          orderId: true,
          equipment: { select: { name: true, company: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: PER_SOURCE,
      }),
      prisma.booking.findMany({
        where: { updatedAt: { gte: since } },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          orderId: true,
          equipment: { select: { name: true, company: { select: { name: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: PER_SOURCE,
      }),
      prisma.comment.findMany({
        where: { status: 'PENDING' },
        select: {
          id: true,
          createdAt: true,
          text: true,
          author: { select: { name: true } },
          targetCompany: { select: { name: true } },
          targetUser: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: PER_SOURCE,
      }),
      prisma.review.findMany({
        where: { textStatus: 'PENDING', comment: { not: null } },
        select: {
          id: true,
          createdAt: true,
          rating: true,
          comment: true,
          author: { select: { name: true } },
          company: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: PER_SOURCE,
      }),
      prisma.company.findMany({
        where: { isProvider: true, ...recent },
        select: {
          id: true,
          name: true,
          createdAt: true,
          taxId: true,
          _count: { select: { equipment: { where: { status: { not: 'RETIRED' } } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: PER_SOURCE,
      }),
      prisma.providerDocument.findMany({
        where: { expiresAt: { gte: docsSince, lt: now } },
        select: {
          id: true,
          kind: true,
          number: true,
          operatorName: true,
          expiresAt: true,
          companyId: true,
          equipmentId: true,
        },
        orderBy: { expiresAt: 'desc' },
        take: PER_SOURCE,
      }),
      prisma.lead.findMany({
        where: { NOT: { phone: '' }, ...recent },
        select: { id: true, createdAt: true, name: true, phone: true, message: true },
        orderBy: { createdAt: 'desc' },
        take: PER_SOURCE,
      }),
    ]);

  // Documents keep plain ids (schema), so names come in two small lookups.
  const companyIds = [...new Set(documents.map((doc) => doc.companyId))];
  const equipmentIds = [
    ...new Set(documents.map((doc) => doc.equipmentId).filter((id): id is string => !!id)),
  ];
  const [docCompanies, docEquipment] = await Promise.all([
    companyIds.length
      ? prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, name: true },
        })
      : [],
    equipmentIds.length
      ? prisma.equipment.findMany({
          where: { id: { in: equipmentIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const companyName = new Map(docCompanies.map((c) => [c.id, c.name]));
  const equipmentName = new Map(docEquipment.map((e) => [e.id, e.name]));

  const events = sortFeed([
    ...orderEvents(
      orders.map((order) => ({
        id: order.id,
        status: order.status,
        description: order.description,
        createdAt: order.createdAt,
        source: order.source,
        categoryName: order.category?.name,
        city: order.location?.city,
      })),
    ),
    ...bidEvents(
      bids.map((bid) => ({
        id: bid.id,
        createdAt: bid.createdAt,
        price: formatMoney(bid.price, bid.currency),
        orderId: bid.orderId,
        equipmentName: bid.equipment.name,
        companyName: bid.equipment.company.name,
      })),
    ),
    ...bookingEvents(
      bookings.map((booking) => ({
        id: booking.id,
        status: booking.status,
        updatedAt: booking.updatedAt,
        orderId: booking.orderId,
        equipmentName: booking.equipment.name,
        companyName: booking.equipment.company.name,
      })),
    ),
    ...commentEvents(
      comments.map((comment) => ({
        id: comment.id,
        createdAt: comment.createdAt,
        text: comment.text,
        authorName: comment.author.name,
        about: comment.targetCompany
          ? `исполнитель «${comment.targetCompany.name}»`
          : `заказчик ${comment.targetUser?.name ?? ''}`.trim(),
      })),
    ),
    ...reviewEvents(
      reviews.map((review) => ({
        id: review.id,
        createdAt: review.createdAt,
        rating: review.rating,
        text: review.comment ?? '',
        authorName: review.author.name,
        companyName: review.company.name,
      })),
    ),
    ...providerEvents(
      providers.map((company) => ({
        id: company.id,
        name: company.name,
        createdAt: company.createdAt,
        taxId: company.taxId,
        machines: company._count.equipment,
      })),
    ),
    ...documentEvents(
      documents.map((doc) => ({
        id: doc.id,
        kind: doc.kind,
        number: doc.number,
        operatorName: doc.operatorName,
        expiresAt: doc.expiresAt,
        companyId: doc.companyId,
        companyName: companyName.get(doc.companyId) ?? 'Компания',
        equipmentName: doc.equipmentId ? equipmentName.get(doc.equipmentId) : null,
      })),
      now,
    ),
    ...leadEvents(leads),
  ]).slice(0, FEED_LIMIT);

  const readRows = events.length
    ? await prisma.adminFeedRead.findMany({
        where: { key: { in: events.map((event) => event.key) } },
        select: { key: true },
      })
    : [];
  const readKeys = new Set(readRows.map((row) => row.key));
  return { events, readKeys, unread: unreadCount(events, readKeys) };
}

/** The badge in the admin nav. Never throws: a broken feed must not hide the admin. */
export async function countUnreadFeed(): Promise<number> {
  try {
    return (await loadAdminFeed()).unread;
  } catch {
    return 0;
  }
}

/** «Прочитано»: remember the keys; already-read ones are skipped. */
export async function markFeedRead(keys: string[]): Promise<number> {
  const unique = [...new Set(keys.filter((key) => key.length > 0 && key.length <= 200))];
  if (unique.length === 0) return 0;
  const result = await prisma.adminFeedRead.createMany({
    data: unique.map((key) => ({ key })),
    skipDuplicates: true,
  });
  return result.count;
}
