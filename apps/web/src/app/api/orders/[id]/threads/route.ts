import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { INVALID_JSON_MESSAGE, readJson } from '@/lib/apiInput';
import {
  chatContactsOpen,
  countUnread,
  resolveThreadCompany,
  threadRole,
  visibleThreads,
  CONTACTS_AFTER_CONFIRM_CHAT,
} from '@/lib/orderChat';
import { chatViewer, getOrCreateThread, loadChatOrder } from '@/lib/orderChatAccess';

export const dynamic = 'force-dynamic';

/**
 * Chats of an order. The customer and admins see one thread per provider
 * company (with its name), a provider sees only its own. `companies` lists
 * the providers the customer may still start a chat with.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const viewer = await chatViewer(request);
  if (!viewer) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  const order = await loadChatOrder(params.id);
  if (!order) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

  const all = await prisma.orderThread.findMany({
    where: { orderId: order.id },
    include: {
      messages: {
        select: { id: true, body: true, createdAt: true, readAt: true, senderUserId: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
    },
    orderBy: { lastMessageAt: 'desc' },
  });
  const threads = visibleThreads(all, viewer, order);
  const isCustomer = viewer.id === order.customerId;
  const isAdmin = !isCustomer && (viewer.isAdmin || viewer.role === 'PLATFORM_ADMIN');
  if (threads.length === 0 && !isCustomer && !isAdmin) {
    const role = threadRole(viewer, order, viewer.companyId ?? '');
    if (!role) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  const companyIds = new Set<string>(threads.map((thread) => thread.companyId));
  if (isCustomer || isAdmin) {
    for (const id of order.bidCompanyIds) companyIds.add(id);
    if (order.booking) companyIds.add(order.booking.companyId);
  }
  const companies = await prisma.company.findMany({
    where: { id: { in: [...companyIds] } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(companies.map((company) => [company.id, company.name]));

  return NextResponse.json({
    threads: threads.map((thread) => {
      const role = threadRole(viewer, order, thread.companyId) ?? 'admin';
      const last = thread.messages[0];
      return {
        id: thread.id,
        orderId: thread.orderId,
        companyId: thread.companyId,
        companyName: nameOf.get(thread.companyId) ?? 'Исполнитель',
        lastMessageAt: thread.lastMessageAt.toISOString(),
        unread: countUnread(thread.messages, role, order.customerId, viewer.id),
        contactsOpen: chatContactsOpen(order, thread.companyId),
        lastMessage: last
          ? { body: last.body.slice(0, 200), createdAt: last.createdAt.toISOString() }
          : null,
      };
    }),
    companies: companies.map((company) => ({
      id: company.id,
      name: company.name,
      contactsOpen: chatContactsOpen(order, company.id),
    })),
    notice: CONTACTS_AFTER_CONFIRM_CHAT,
  });
}

/**
 * Opens (or finds) the thread with a company: the customer and admins pass
 * `{ companyId }`, a provider gets its own. Returns `{ thread }` with the
 * thread id to use with /api/threads/[threadId]/messages.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const viewer = await chatViewer(request);
  if (!viewer) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  const body = await readJson(request);
  if (body !== null && typeof body !== 'object') {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const requested = (body as { companyId?: unknown } | null)?.companyId;
  const companyId =
    typeof requested === 'string' && requested.length > 0 && requested.length <= 64
      ? requested
      : null;

  const order = await loadChatOrder(params.id);
  if (!order) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  const resolved = resolveThreadCompany(viewer, order, companyId);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const role = threadRole(viewer, order, resolved.companyId);
  if (!role) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });

  const [thread, company] = await Promise.all([
    getOrCreateThread(order.id, resolved.companyId),
    prisma.company.findUnique({ where: { id: resolved.companyId }, select: { name: true } }),
  ]);
  return NextResponse.json({
    thread: {
      id: thread.id,
      orderId: thread.orderId,
      companyId: thread.companyId,
      companyName: company?.name ?? 'Исполнитель',
      lastMessageAt: thread.lastMessageAt.toISOString(),
      contactsOpen: chatContactsOpen(order, thread.companyId),
      role,
    },
  });
}
