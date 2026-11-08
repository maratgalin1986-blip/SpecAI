import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { INVALID_JSON_MESSAGE, readJson } from '@/lib/apiInput';
import { checkRateLimit } from '@/lib/rateLimit';
import { notifyCompany, notifyUser } from '@/lib/notifications/notifyUser';
import {
  CHAT_PAGE_SIZE,
  CHAT_RATE_LIMITS,
  CONTACTS_AFTER_CONFIRM_CHAT,
  THREAD_READ_ONLY,
  canWriteThread,
  counterpartName,
  prepareAttachmentUrl,
  prepareChatMessage,
  senderNameFor,
  toPublicMessage,
} from '@/lib/orderChat';
import { chatViewer, threadContext, type ThreadContext } from '@/lib/orderChatAccess';

export const dynamic = 'force-dynamic';

function threadView(context: ThreadContext) {
  const { thread, order, role, contactsOpen, companyName } = context;
  return {
    id: thread.id,
    orderId: thread.orderId,
    companyId: thread.companyId,
    role,
    canWrite: canWriteThread(role),
    contactsOpen,
    counterpart: counterpartName(role, { companyName, customerName: order.customerName }),
    notice: contactsOpen ? null : CONTACTS_AFTER_CONFIRM_CHAT,
  };
}

function idParam(value: string | null): string | null {
  return value && value.length > 0 && value.length <= 64 ? value : null;
}

/**
 * Messages of a thread, oldest first. `?cursor=<messageId>` loads the page
 * before that message (older), `?after=<messageId>` only what came after it
 * (polling). `nextCursor` is set when older messages remain.
 */
export async function GET(request: NextRequest, { params }: { params: { threadId: string } }) {
  const viewer = await chatViewer(request);
  const access = await threadContext(params.threadId, viewer);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { context } = access;
  const { searchParams } = request.nextUrl;
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || CHAT_PAGE_SIZE));
  const cursor = idParam(searchParams.get('cursor'));
  const after = idParam(searchParams.get('after'));

  const anchorId = cursor ?? after;
  const anchor = anchorId
    ? await prisma.orderMessage.findFirst({
        where: { id: anchorId, threadId: context.thread.id },
        select: { createdAt: true },
      })
    : null;
  if (anchorId && !anchor) {
    return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 });
  }

  const rows = await prisma.orderMessage.findMany({
    where: {
      threadId: context.thread.id,
      ...(cursor && anchor ? { createdAt: { lt: anchor.createdAt } } : {}),
      ...(after && anchor ? { createdAt: { gt: anchor.createdAt } } : {}),
    },
    orderBy: { createdAt: after ? 'asc' : 'desc' },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const ordered = after ? page : [...page].reverse();
  const viewerId = viewer!.id;
  return NextResponse.json({
    thread: threadView(context),
    messages: ordered.map((message) =>
      toPublicMessage(message, context.role, context.order.customerId, viewerId),
    ),
    nextCursor: !after && hasMore ? ordered[0]!.id : null,
  });
}

/**
 * A new message: `{ body, attachmentUrl? }`. Until the booking is confirmed
 * contacts and links are masked and stored that way; `masked: true` with
 * `notice` tells the sender why.
 */
export async function POST(request: NextRequest, { params }: { params: { threadId: string } }) {
  const viewer = await chatViewer(request);
  const access = await threadContext(params.threadId, viewer);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { context } = access;
  if (!canWriteThread(context.role)) {
    return NextResponse.json({ error: THREAD_READ_ONLY }, { status: 403 });
  }
  const body = await readJson(request);
  if (body === null || typeof body !== 'object') {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const prepared = prepareChatMessage(input.body, context.contactsOpen);
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });
  const attachment = prepareAttachmentUrl(input.attachmentUrl);
  if (!attachment.ok) return NextResponse.json({ error: attachment.error }, { status: 400 });

  const senderId = viewer!.id;
  for (const window of CHAT_RATE_LIMITS) {
    const rate = checkRateLimit(`chat:${senderId}:${window.windowMs}`, window);
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'Слишком много сообщений подряд. Попробуйте позже' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
      );
    }
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.orderMessage.create({
      data: {
        threadId: context.thread.id,
        senderUserId: senderId,
        body: prepared.text,
        attachmentUrl: attachment.url,
      },
    });
    await tx.orderThread.update({
      where: { id: context.thread.id },
      data: { lastMessageAt: created.createdAt },
    });
    return created;
  });

  // The other side hears about it; a failed notification never fails the message.
  const event = {
    type: 'chat.message' as const,
    orderId: context.order.id,
    fromName: senderNameFor(context.role, {
      companyName: context.companyName,
      customerName: context.order.customerName,
    }),
    text: prepared.text,
  };
  const notify =
    context.role === 'customer'
      ? notifyCompany(context.thread.companyId, event)
      : notifyUser(context.order.customerId, event).then(() => undefined);
  notify.catch((error) => console.error('[chat] notification failed', error));

  return NextResponse.json(
    {
      message: toPublicMessage(message, context.role, context.order.customerId, senderId),
      masked: prepared.masked,
      notice: prepared.masked ? CONTACTS_AFTER_CONFIRM_CHAT : null,
    },
    { status: 201 },
  );
}
