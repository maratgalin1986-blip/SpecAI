// Database side of the order chat: loads what the rules in orderChat.ts need,
// resolves the viewer and counts unread messages for the app badges.
import { prisma } from '@specai/database';
import { isAdminRequest } from './admin';
import {
  chatContactsOpen,
  threadRole,
  type ChatOrder,
  type ChatViewer,
  type ThreadRole,
} from './orderChat';
import { getRequestUser } from './requestUser';

/** The current user plus the /admin cookie, as the chat rules see them. */
export async function chatViewer(request: Request): Promise<ChatViewer | null> {
  const user = await getRequestUser(request);
  let isAdmin = false;
  try {
    isAdmin = isAdminRequest();
  } catch {
    isAdmin = false;
  }
  if (!user) return isAdmin ? { id: 'admin', role: 'PLATFORM_ADMIN', isAdmin: true } : null;
  return { id: user.id, role: user.role, companyId: user.companyId, isAdmin };
}

export interface LoadedChatOrder extends ChatOrder {
  status: string;
  customerName: string;
}

/** An order with the bidding and booked companies; null when it is not visible. */
export async function loadChatOrder(orderId: string): Promise<LoadedChatOrder | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      customerId: true,
      customer: { select: { name: true } },
      booking: { select: { status: true, equipment: { select: { companyId: true } } } },
      bids: { select: { equipment: { select: { companyId: true } } } },
    },
  });
  if (!order || order.status === 'PENDING_REVIEW') return null;
  return {
    id: order.id,
    status: order.status,
    customerId: order.customerId,
    customerName: order.customer.name,
    bidCompanyIds: [...new Set(order.bids.map((bid) => bid.equipment.companyId))],
    booking: order.booking
      ? { companyId: order.booking.equipment.companyId, status: order.booking.status }
      : null,
  };
}

/** The thread of (order, company), created on first use. */
export async function getOrCreateThread(orderId: string, companyId: string) {
  return prisma.orderThread.upsert({
    where: { orderId_companyId: { orderId, companyId } },
    create: { orderId, companyId },
    update: {},
  });
}

export interface ThreadContext {
  thread: { id: string; orderId: string; companyId: string; lastMessageAt: Date };
  order: LoadedChatOrder;
  role: ThreadRole;
  contactsOpen: boolean;
  companyName: string;
}

/**
 * A thread as a viewer may open it, or the reason they may not. Admins get
 * the 'admin' role (read-only).
 */
export async function threadContext(
  threadId: string,
  viewer: ChatViewer | null,
): Promise<{ ok: true; context: ThreadContext } | { ok: false; error: string; status: number }> {
  if (!viewer) return { ok: false, error: 'Необходимо войти в аккаунт', status: 401 };
  const thread = await prisma.orderThread.findUnique({ where: { id: threadId } });
  if (!thread) return { ok: false, error: 'Чат не найден', status: 404 };
  const [order, company] = await Promise.all([
    loadChatOrder(thread.orderId),
    prisma.company.findUnique({ where: { id: thread.companyId }, select: { name: true } }),
  ]);
  if (!order) return { ok: false, error: 'Чат не найден', status: 404 };
  const role = threadRole(viewer, order, thread.companyId);
  // A stranger learns nothing, not even that the thread exists.
  if (!role) return { ok: false, error: 'Чат не найден', status: 404 };
  return {
    ok: true,
    context: {
      thread,
      order,
      role,
      contactsOpen: chatContactsOpen(order, thread.companyId),
      companyName: company?.name ?? 'Исполнитель',
    },
  };
}

/** Ids of the managers of a company (their messages are «ours» on the provider side). */
export async function companyUserIds(companyId: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { companyId }, select: { id: true } });
  return users.map((user) => user.id);
}

/**
 * Unread messages per order for the viewer: as the customer, in every thread
 * of their orders (messages not written by them); as a provider, in the
 * company's threads (messages not written by the company's managers).
 */
export async function unreadMessagesByOrder(
  orderIds: string[],
  viewer: { id: string; role?: string | null; companyId?: string | null },
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (orderIds.length === 0) return result;
  const provider = viewer.role === 'PROVIDER_ADMIN' && Boolean(viewer.companyId);
  const threads = await prisma.orderThread.findMany({
    where: {
      orderId: { in: orderIds },
      ...(provider ? { companyId: viewer.companyId! } : {}),
    },
    select: { id: true, orderId: true },
  });
  if (threads.length === 0) return result;
  const ours = provider ? await companyUserIds(viewer.companyId!) : [viewer.id];
  const counts = await prisma.orderMessage.groupBy({
    by: ['threadId'],
    where: {
      threadId: { in: threads.map((thread) => thread.id) },
      readAt: null,
      senderUserId: { notIn: ours },
    },
    _count: { _all: true },
  });
  const byThread = new Map(counts.map((row) => [row.threadId, row._count._all]));
  for (const thread of threads) {
    const unread = byThread.get(thread.id) ?? 0;
    if (unread > 0) result.set(thread.orderId, (result.get(thread.orderId) ?? 0) + unread);
  }
  return result;
}

/** All unread messages of the viewer, for the tab badge. */
export async function unreadMessagesTotal(viewer: {
  id: string;
  role?: string | null;
  companyId?: string | null;
}): Promise<number> {
  const provider = viewer.role === 'PROVIDER_ADMIN' && Boolean(viewer.companyId);
  let threadWhere: { companyId: string } | { orderId: { in: string[] } };
  if (provider) {
    threadWhere = { companyId: viewer.companyId! };
  } else {
    const orders = await prisma.order.findMany({
      where: { customerId: viewer.id },
      select: { id: true },
      take: 500,
    });
    if (orders.length === 0) return 0;
    threadWhere = { orderId: { in: orders.map((order) => order.id) } };
  }
  const ours = provider ? await companyUserIds(viewer.companyId!) : [viewer.id];
  return prisma.orderMessage.count({
    where: { thread: threadWhere, readAt: null, senderUserId: { notIn: ours } },
  });
}
